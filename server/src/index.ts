import { DurableObject } from 'cloudflare:workers';
import { createRoom, joinRoom, connectPlayer, disconnectPlayer, command, snapshot, tick, nextDeadline } from './engine.js';
import { normalizeCode, PROTOCOL_VERSION } from '../../shared/rules.js';

interface Env { ROOMS: DurableObjectNamespace<SpyhazRoom>; ALLOWED_ORIGINS: string; }
interface Attachment {
  authenticated: boolean; playerId?: string; generation?: string;
  lastSeen: number; authDeadline: number; windowAt: number; messages: number;
}
const FRAME_LIMIT = 8192;
const PRESENCE_MS = 75_000;
const json = (data: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
});
const safeError = (error: unknown) => error instanceof Error ? error.message : 'İşlem tamamlanamadı.';

function credentials(input: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      typeof input.playerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.playerId) ||
      typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{43,100}$/.test(input.token))
    throw new Error('Geçersiz oturum bilgisi.');
  return { id: input.playerId, token: input.token };
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
function sameHash(a: string, b: string) {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
async function readBody(request: Request) {
  const length = request.headers.get('Content-Length');
  if (length && Number(length) > FRAME_LIMIT) throw new Error('İstek çok büyük.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('İstek verisi gerekli.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.byteLength;
    if (size > FRAME_LIMIT) { await reader.cancel(); throw new Error('İstek çok büyük.'); }
    chunks.push(item.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(body)); } catch { throw new Error('Geçersiz JSON.'); }
}

export class SpyhazRoom extends DurableObject<Env> {
  private room: any = null;
  private committedRoom: any = null;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get('room') || null;
      this.committedRoom = structuredClone(this.room);
      if (!this.room) return;
      const live = ctx.getWebSockets().map(ws => ws.deserializeAttachment() as Attachment)
        .filter(a => a?.authenticated);
      let dirty = false;
      for (const p of this.room.players) {
        if (p.connected && !live.some(a => a.playerId === p.id && a.generation === p.generation)) {
          dirty = disconnectPlayer(this.room, p.id, p.generation) || dirty;
        }
      }
      dirty = tick(this.room) || dirty;
      if (dirty) await this.save();
    });
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
  private expired() {
    return this.room && this.room.expiresAt !== null && this.room.expiresAt <= Date.now() &&
      !this.room.players.some((p: any) => p.connected);
  }
  private async save() {
    const deadline = this.alarmDeadline();
    try {
      await this.ctx.storage.transaction(async storage => {
        if (this.room) await storage.put('room', this.room);
        if (Number.isFinite(deadline)) await storage.setAlarm(Math.max(Date.now() + 1, deadline));
        else await storage.deleteAlarm();
      });
      this.committedRoom = structuredClone(this.room);
    } catch (error) {
      // Never serve an uncommitted room or acknowledge an unpersisted receipt.
      this.room = structuredClone(this.committedRoom);
      throw error;
    }
  }
  private alarmDeadline() {
    let deadline = this.room ? nextDeadline(this.room) : Infinity;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const a = ws.deserializeAttachment() as Attachment;
      if (!a) continue;
      const last = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() || 0;
      deadline = Math.min(deadline, a.authenticated ? Math.max(last, a.lastSeen) + PRESENCE_MS : a.authDeadline);
    }
    return deadline;
  }
  private async schedule() {
    const deadline = this.alarmDeadline();
    if (Number.isFinite(deadline)) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, deadline));
    else await this.ctx.storage.deleteAlarm();
  }
  private async expireRoom() {
    await this.ctx.storage.deleteAll();
    this.room = null;
    this.committedRoom = null;
  }
  private send(ws: WebSocket, data: unknown) {
    try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); } catch { /* close/error handler records presence */ }
  }
  private fatal(ws: WebSocket, code: string, error: string, closeCode = 4001) {
    this.send(ws, { type: 'fatal', code, error });
    try { ws.close(closeCode, code); } catch { /* already closed */ }
  }
  private broadcast() {
    if (!this.room) return;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (!a?.authenticated) continue;
      const p = this.room.players.find((p: any) => p.id === a.playerId);
      if (!p || p.withdrawn) { this.fatal(ws, 'MEMBERSHIP_ENDED', 'Odadan ayrıldın veya kurucu seni çıkardı.'); continue; }
      if (p.generation !== a.generation) continue;
      this.send(ws, snapshot(this.room, a.playerId));
    }
  }

  async fetch(request: Request): Promise<Response> {
    return this.exclusive(async () => {
      try {
        if (this.expired()) await this.expireRoom();
        const path = new URL(request.url).pathname;
        if (path === '/internal/socket') {
          if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket gerekli.' }, 426);
          if (this.ctx.getWebSockets().length >= 45) return json({ error: 'Çok fazla bağlantı. Biraz sonra tekrar dene.' }, 429);
          const pair = new WebSocketPair(), client = pair[0], server = pair[1];
          this.ctx.acceptWebSocket(server);
          server.serializeAttachment({ authenticated: false, lastSeen: Date.now(), authDeadline: Date.now() + 10_000, windowAt: Date.now(), messages: 0 } satisfies Attachment);
          await this.schedule();
          return new Response(null, { status: 101, webSocket: client });
        }
        if (request.method !== 'POST') return json({ error: 'Bulunamadı.' }, 404);
        const input = await readBody(request);
        const { id, token } = credentials(input);
        const tokenHash = await digest(token);
        if (path === '/internal/create') {
          if (this.room) {
            const p = this.room.players.find((p: any) => p.id === id);
            if (p && sameHash(p.tokenHash, tokenHash)) return json({ code: this.room.code, playerId: id, token });
            return json({ error: 'Bu oda kodu kullanılıyor.' }, 409);
          }
          this.room = createRoom(normalizeCode(input.code), { id, name: input.name, tokenHash }, input.settings || {});
        } else if (path === '/internal/join') {
          if (!this.room) return json({ error: 'Oda bulunamadı veya süresi doldu.' }, 410);
          const existing = this.room.players.find((p: any) => p.id === id);
          if (existing) {
            if (!sameHash(existing.tokenHash, tokenHash) || existing.withdrawn) return json({ error: 'Oturum geçersiz.' }, 401);
          } else {
            joinRoom(this.room, { id, name: input.name, tokenHash });
          }
        } else return json({ error: 'Bulunamadı.' }, 404);
        await this.save();
        this.broadcast();
        return json({ code: this.room.code, playerId: id, token }, 201);
      } catch (error) {
        return json({ error: safeError(error) }, 400);
      }
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.exclusive(async () => {
      try {
        const a = ws.deserializeAttachment() as Attachment;
        if (!a) return this.fatal(ws, 'INVALID_SESSION', 'Oturum bulunamadı.');
        if (typeof message !== 'string' || new TextEncoder().encode(message).byteLength > FRAME_LIMIT)
          return this.fatal(ws, 'INVALID_MESSAGE', 'Mesaj biçimi veya boyutu geçersiz.', 1008);
        const now = Date.now();
        if (now - a.windowAt > 5000) { a.windowAt = now; a.messages = 0; }
        if (++a.messages > 30) { this.send(ws, { type: 'error', error: 'Çok hızlı işlem yapıyorsun. Birkaç saniye bekle.' }); return; }
        a.lastSeen = now;
        ws.serializeAttachment(a);
        let data;
        try { data = JSON.parse(message); } catch { this.send(ws, { type: 'error', error: 'Geçersiz JSON.' }); return; }
        if (!a.authenticated) {
          if (data?.v !== PROTOCOL_VERSION || data?.type !== 'session:resume') return this.fatal(ws, 'VERSION_MISMATCH', 'Oyunun yeni sürümü için sayfayı yenile.');
          if (!this.room || this.expired()) return this.fatal(ws, 'ROOM_EXPIRED', 'Oda bulunamadı veya 24 saatlik dönüş süresi doldu.');
          let identity;
          try { identity = credentials(data); }
          catch { return this.fatal(ws, 'INVALID_SESSION', 'Oturum bilgisi geçersiz.'); }
          const { id, token } = identity;
          const p = this.room.players.find((p: any) => p.id === id);
          if (!p || p.withdrawn || !sameHash(p.tokenHash, await digest(token))) return this.fatal(ws, 'INVALID_SESSION', 'Oturum geçersiz. Odaya yeniden katıl.');
          const generation = crypto.randomUUID();
          connectPlayer(this.room, id, generation, now);
          const auth: Attachment = { ...a, authenticated: true, playerId: id, generation };
          ws.serializeAttachment(auth);
          await this.save();
          for (const old of this.ctx.getWebSockets()) {
            const oldAuth = old.deserializeAttachment() as Attachment;
            if (old !== ws && oldAuth?.playerId === id) this.fatal(old, 'SESSION_REPLACED', 'Oyun başka sekmede açıldı. Bu sekmeden devam edebilirsin.', 4009);
          }
          this.broadcast();
          return;
        }
        const p = this.room?.players.find((p: any) => p.id === a.playerId);
        if (!p || p.withdrawn) return this.fatal(ws, 'MEMBERSHIP_ENDED', 'Odadan ayrıldın veya kurucu seni çıkardı.');
        if (p.generation !== a.generation) return this.fatal(ws, 'SESSION_REPLACED', 'Oyun başka sekmede açık.', 4009);
        const timed = tick(this.room, now);
        if (data?.v !== PROTOCOL_VERSION) {
          if (timed) { await this.save(); this.broadcast(); }
          this.send(ws, { type: 'error', error: 'Sürüm uyuşmuyor. Sayfayı yenile.' }); return;
        }
        const result = command(this.room, a.playerId, data, now);
        this.room = result.room;
        // Persist state and its receipt together, before acknowledgement or broadcast.
        if (timed || (result.ack.ok && !result.duplicate)) await this.save();
        else await this.schedule();
        this.send(ws, result.ack);
        this.broadcast();
      } catch (error) {
        this.send(ws, { type: 'error', error: 'Sunucu işlemi tamamlayamadı. Odan korunuyor; yeniden bağlanılıyor.' });
        try { ws.close(1011, 'RETRY'); } catch { /* client retries with the same credentials */ }
      }
    });
  }

  async webSocketClose(ws: WebSocket) { await this.closed(ws); }
  async webSocketError(ws: WebSocket) { await this.closed(ws); }
  private async closed(ws: WebSocket) {
    await this.exclusive(async () => {
      const a = ws.deserializeAttachment() as Attachment;
      if (this.room && a?.authenticated && disconnectPlayer(this.room, a.playerId, a.generation)) {
        await this.save(); this.broadcast();
      } else await this.schedule();
    });
  }
  async alarm() {
    await this.exclusive(async () => {
      const now = Date.now();
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Attachment;
        if (!a) continue;
        const last = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() || 0;
        if ((!a.authenticated && now >= a.authDeadline) || (a.authenticated && now >= Math.max(last, a.lastSeen) + PRESENCE_MS)) {
          if (this.room && a.authenticated) disconnectPlayer(this.room, a.playerId, a.generation, now);
          try { ws.close(4000, 'RECONNECT'); } catch { /* already closed */ }
        }
      }
      if (this.expired()) {
        await this.expireRoom();
      } else if (this.room) {
        tick(this.room, now);
        await this.save();
        this.broadcast();
      }
      await this.schedule();
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS.split(',').map(x => x.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return json({ error: 'Bu siteye bağlantı izni verilmedi.' }, 403);
    const cors: Record<string, string> = {
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (origin) cors['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, protocol: PROTOCOL_VERSION }, 200, cors);
    try {
      let response: Response;
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        const input = await readBody(request);
        const code = normalizeCode(input.code);
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        response = await stub.fetch('https://room/internal/create', { method: 'POST', body: JSON.stringify(input) });
      } else {
        const match = /^\/api\/rooms\/([^/]+)\/(players|socket)$/.exec(url.pathname);
        if (!match) return json({ error: 'Bulunamadı.' }, 404, cors);
        const code = normalizeCode(decodeURIComponent(match[1]));
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        response = await stub.fetch(new Request('https://room/internal/' + (match[2] === 'players' ? 'join' : 'socket'), request));
      }
      if (response.status === 101) return response;
      const result = new Response(response.body, response);
      for (const [key, value] of Object.entries(cors)) result.headers.set(key, value);
      return result;
    } catch (error) {
      return json({ error: safeError(error) }, 400, cors);
    }
  },
} satisfies ExportedHandler<Env>;
