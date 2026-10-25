import { locations } from '../../shared/locations.js';
import { MAX_PLAYERS, BALLOT_MS, ROOM_TTL_MS, HOST_GRACE_MS, approvalThreshold, validateSettings, validateName } from '../../shared/rules.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const uid = () => crypto.randomUUID();
const sample = values => values[crypto.getRandomValues(new Uint32Array(1))[0] % values.length];
const member = (room, id) => room.players.find(p => p.id === id);
const active = room => room.players.filter(p => p.connected && !p.withdrawn);
const participants = room => room.game.participantIds.map(id => member(room, id)).filter(Boolean);
export const contextId = room => room.game?.id || room.lobbyId;
const publicLocation = id => { const l = locations.find(l => l.id === id); return { id: l.id, name: l.name, emoji: l.emoji }; };
const phase = (room, name) => assert(room.game?.state === name, 'Bu işlem şu anda yapılamaz.');
const host = (room, id) => assert(room.hostId === id, 'Bu işlem yalnızca kurucuya açık.');

export function createRoom(code, player, settings = {}, now = Date.now()) {
  return {
    schemaVersion: 2, code, instanceId: uid(), lobbyId: uid(), revision: 0,
    hostId: player.id, settings: validateSettings(settings),
    players: [{ ...player, name: validateName(player.name), connected: false, generation: null, joinedAt: now, withdrawn: false }],
    game: null, scores: {}, roundNumber: 0, chat: [], receipts: [], summaries: [],
    createdAt: now, expiresAt: now + ROOM_TTL_MS, hostTransferAt: now + HOST_GRACE_MS, notice: '',
  };
}

export function joinRoom(room, player, now = Date.now()) {
  assert(!room.game, 'Tur devam ediyor. Kurucu lobiye döndüğünde katılabilirsin.');
  assert(room.players.length < MAX_PLAYERS, 'Oda dolu (en fazla 15 kişi).');
  const name = validateName(player.name);
  assert(!room.players.some(p => p.id === player.id), 'Bu oyuncu zaten odada.');
  assert(!room.players.some(p => p.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr')), 'Bu isim zaten kullanılıyor.');
  room.players.push({ ...player, name, connected: false, generation: null, joinedAt: now, withdrawn: false });
  room.revision++;
}

export function connectPlayer(room, id, generation, now = Date.now()) {
  const p = member(room, id);
  assert(p && !p.withdrawn, 'Oturum geçersiz. Odaya yeniden katıl.');
  p.connected = true;
  p.generation = generation;
  room.expiresAt = null;
  if (room.hostId === id) room.hostTransferAt = null;
  else if (!member(room, room.hostId)?.connected && room.hostTransferAt === null) room.hostTransferAt = now + HOST_GRACE_MS;
  if (room.game && room.game.state !== 'RESULT') {
    const q = room.game.question;
    // A skipped participant can still receive a question if they return before the cycle ends.
    q.skippedIds = q.skippedIds.filter(x => x !== id);
    maybeStart(room, now);
  }
  room.revision++;
}

export function disconnectPlayer(room, id, generation, now = Date.now()) {
  const p = member(room, id);
  if (!p || p.generation !== generation || !p.connected) return false;
  p.connected = false;
  if (room.hostId === id) room.hostTransferAt = now + HOST_GRACE_MS;
  if (!active(room).length) room.expiresAt = now + ROOM_TTL_MS;
  maybeStart(room, now);
  room.revision++;
  return true;
}

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function start(room, now) {
  assert(!room.game, 'Önce mevcut tur tamamlanmalı.');
  const players = active(room);
  assert(players.length >= 3 && players.length <= MAX_PLAYERS, '3–15 bağlı oyuncu gerekli.');
  assert(room.settings.spyCount === 1 || players.length >= 7, 'İki casus için en az 7 bağlı oyuncu gerekli.');
  const locationId = sample(room.settings.enabledLocationIds);
  const spyIds = shuffle(players.map(p => p.id)).slice(0, room.settings.spyCount);
  const selected = locations.find(l => l.id === locationId);
  const rolePool = shuffle(selected.roles);
  const professions = {};
  let index = 0;
  for (const p of players) {
    if (!spyIds.includes(p.id) && room.settings.professions) professions[p.id] = rolePool[index++ % rolePool.length];
  }
  room.game = {
    id: uid(), state: 'ROLE_REVEAL', startedAt: now, duration: room.settings.duration,
    participantIds: players.map(p => p.id), locationId, spyIds, professions, readyIds: [],
    forceReadyAt: now + BALLOT_MS, remainingMs: room.settings.duration * 1000,
    deadline: null, manualPaused: false, phaseDeadline: null,
    question: { cycle: 1, turnId: uid(), currentAskerId: sample(players).id, previousAskerId: null, targetId: null, answeredIds: [], skippedIds: [] },
    answeredEver: [], accusationUsedIds: [], ballot: null, guesses: {}, result: null, interventions: [],
  };
  room.notice = 'Yeni tur: kartını gör ve hazır olduğunu bildir.';
}

function maybeStart(room, now, force = false) {
  const g = room.game;
  if (g?.state !== 'ROLE_REVEAL') return;
  const online = participants(room).filter(p => p.connected && !p.withdrawn);
  if (online.length < 3) return;
  if (!force && !online.every(p => g.readyIds.includes(p.id))) return;
  g.state = 'PLAYING';
  g.deadline = now + g.remainingMs;
  normalizeQuestion(room);
  room.notice = 'İlk soru döngüsünde herkes bir kez cevap verecek.';
}

function pendingTargets(room) {
  const g = room.game, q = g.question;
  return participants(room).filter(p => p.connected && !p.withdrawn && !q.answeredIds.includes(p.id) && !q.skippedIds.includes(p.id)).map(p => p.id);
}

export function availableTargets(room) {
  if (!room.game) return [];
  const q = room.game.question;
  let ids = pendingTargets(room).filter(id => id !== q.currentAskerId);
  if (ids.length > 1) ids = ids.filter(id => id !== q.previousAskerId);
  return ids;
}

function normalizeQuestion(room) {
  const g = room.game, q = g.question;
  if (q.targetId) return;
  if (g.participantIds.every(id => q.answeredIds.includes(id) || q.skippedIds.includes(id))) {
    q.cycle++;
    q.answeredIds = [];
    q.skippedIds = [];
  }
  const pending = pendingTargets(room);
  // After a host skip the only unasked player can be the asker. Give another
  // connected player the asking duty rather than silently recording a fake answer.
  if (pending.length === 1 && pending[0] === q.currentAskerId) {
    const asker = participants(room).find(p => p.connected && !p.withdrawn && p.id !== pending[0]);
    if (asker) q.currentAskerId = asker.id;
  }
}

function pauseClock(g, now) {
  if (g.deadline !== null) g.remainingMs = Math.max(0, g.deadline - now);
  g.deadline = null;
}
function resumeClock(g, now) {
  if (!g.manualPaused) g.deadline = now + g.remainingMs;
}
function playable(room) {
  phase(room, 'PLAYING');
  assert(!room.game.manualPaused, 'Oyun kurucu tarafından duraklatıldı.');
}
function ballotComplete(room) {
  const b = room.game.ballot;
  const voters = b.kind === 'nomination' ? room.game.participantIds : room.game.participantIds.filter(id => id !== b.suspectId);
  return voters.every(id => Object.hasOwn(b.votes, id));
}

function end(room, winner, reason, now, options = {}) {
  const g = room.game;
  if (!g || g.state === 'RESULT') return;
  const points = Object.fromEntries(g.participantIds.map(id => [id, 0]));
  if (winner === 'SPY') {
    for (const id of g.spyIds) {
      points[id] = reason === 'WRONG_ACCUSATION' ? 4 : 2;
      if (reason === 'CORRECT_GUESS' && options.correctSpyIds?.includes(id)) points[id] += 2;
    }
  } else if (winner === 'PLAYERS') {
    for (const id of g.participantIds) {
      if (!g.spyIds.includes(id)) points[id] = 1 + (options.requesterId === id ? 1 : 0);
      else if (reason === 'CORRECT_ACCUSATION' && id !== options.accusedId) points[id] = 1;
    }
  }
  if (winner !== 'CANCELLED') {
    room.roundNumber++;
    for (const [id, value] of Object.entries(points)) room.scores[id] = (room.scores[id] || 0) + value;
  }
  g.state = 'RESULT';
  g.deadline = null;
  g.phaseDeadline = null;
  g.result = {
    id: g.id, winner, reason, location: publicLocation(g.locationId),
    spies: g.spyIds.map(id => ({ id, name: member(room, id)?.name || '?' })),
    roles: Object.fromEntries(g.participantIds.map(id => [id, {
      name: member(room, id)?.name || '?', isSpy: g.spyIds.includes(id), role: g.professions[id] || null,
    }])),
    guesses: Object.fromEntries(Object.entries(g.guesses).map(([id, loc]) => [id, { location: publicLocation(loc), correct: loc === g.locationId }])),
    roundScores: points, totalScores: { ...room.scores }, roundNumber: room.roundNumber, endedAt: now,
  };
  room.notice = winner === 'CANCELLED' ? 'Tur puan verilmeden iptal edildi.' : 'Tur tamamlandı. Yeni tur aynı odada oynanabilir.';
  room.summaries.push({
    id: g.id, winner, reason, players: g.participantIds.length, spyCount: g.spyIds.length,
    durationSeconds: Math.round((now - g.startedAt) / 1000),
    unansweredIds: g.participantIds.filter(id => !g.answeredEver.includes(id)),
    interventions: g.interventions.length,
  });
  room.summaries = room.summaries.slice(-50);
}

function resolveBallot(room, now) {
  const g = room.game, b = g.ballot;
  if (b.kind === 'nomination') {
    const counts = {};
    for (const id of Object.values(b.votes)) counts[id] = (counts[id] || 0) + 1;
    const ordered = Object.entries(counts).sort((a, z) => z[1] - a[1]);
    if (!ordered.length || ordered[0][1] === ordered[1]?.[1]) return end(room, 'SPY', 'TIME_EXPIRED', now);
    g.state = 'FINAL_ACCUSATION';
    g.phaseDeadline = now + BALLOT_MS;
    g.ballot = { kind: 'accusation', suspectId: ordered[0][0], requesterId: null, votes: {}, isFinal: true };
    room.notice = 'Son suçlama: gerekli onay sayısına ulaşılmalı.';
    return;
  }
  const yes = Object.values(b.votes).filter(x => x === true).length;
  if (yes >= approvalThreshold(g.participantIds.length)) {
    const isSpy = g.spyIds.includes(b.suspectId);
    end(room, isSpy ? 'PLAYERS' : 'SPY', isSpy ? 'CORRECT_ACCUSATION' : 'WRONG_ACCUSATION', now, { accusedId: b.suspectId, requesterId: b.requesterId });
  } else if (b.isFinal) {
    end(room, 'SPY', 'TIME_EXPIRED', now);
  } else {
    g.state = 'PLAYING';
    g.phaseDeadline = null;
    g.ballot = null;
    resumeClock(g, now);
    room.notice = 'Yeterli onay yok. Kimlik açıklanmadı; soru sırası devam ediyor.';
  }
}

function finishGuesses(room, now) {
  const g = room.game;
  const correctSpyIds = g.spyIds.filter(id => g.guesses[id] === g.locationId);
  end(room, correctSpyIds.length ? 'SPY' : 'PLAYERS', correctSpyIds.length ? 'CORRECT_GUESS' : 'WRONG_GUESS', now, { correctSpyIds });
}

/** Resolve overdue events first, including after hibernation or a runtime restart. */
export function tick(room, now = Date.now()) {
  let changed = false;
  if (room.hostTransferAt !== null && room.hostTransferAt <= now) {
    const next = active(room).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next && next.id !== room.hostId) {
      room.hostId = next.id;
      room.notice = 'Kurucu bağlı olmadığı için yönetim bağlı oyuncuya geçti.';
      changed = true;
    }
    room.hostTransferAt = null;
    changed = true;
  }
  const g = room.game;
  if (g?.state === 'PLAYING' && g.deadline !== null && now >= g.deadline) {
    g.remainingMs = 0;
    g.deadline = null;
    g.state = 'FINAL_NOMINATION';
    g.phaseDeadline = now + BALLOT_MS;
    g.ballot = { kind: 'nomination', votes: {}, suspectId: null, requesterId: null, isFinal: true };
    room.notice = 'Süre doldu. Son oylama için bir şüpheli seç.';
    changed = true;
  } else if (g?.phaseDeadline !== null && g?.phaseDeadline !== undefined && now >= g.phaseDeadline) {
    if (g.state === 'SPY_GUESS') finishGuesses(room, now);
    else if (g.ballot) resolveBallot(room, now);
    changed = true;
  }
  if (changed) room.revision++;
  return changed;
}

export function nextDeadline(room) {
  return Math.min(...[room.hostTransferAt, room.expiresAt, room.game?.deadline, room.game?.phaseDeadline].filter(x => typeof x === 'number'));
}

function execute(room, id, cmd, now) {
  const p = member(room, id), g = room.game, data = cmd.payload || {};
  assert(p && p.connected && !p.withdrawn, 'Oyuncu bağlı değil.');
  if (cmd.type !== 'session:sync') assert(cmd.contextId === contextId(room), 'Oyun değişti. Güncel ekranı bekleyip tekrar dene.');
  if (/^(question:|vote:|spy:|game:ready)/.test(cmd.type)) assert(g?.participantIds.includes(id), 'Bu turun katılımcısı değilsin.');
  if (cmd.type.startsWith('question:') || cmd.type === 'host:skip') assert(cmd.turnId === g.question.turnId, 'Soru sırası değişti.');
  switch (cmd.type) {
    case 'session:sync': break;
    case 'room:settings':
      host(room, id); assert(!g, 'Ayarlar yalnızca lobide değişir.');
      room.settings = validateSettings(data, room.settings); break;
    case 'game:start': host(room, id); start(room, now); break;
    case 'game:ready':
      phase(room, 'ROLE_REVEAL');
      if (!g.readyIds.includes(id)) g.readyIds.push(id);
      maybeStart(room, now); break;
    case 'host:forceReady':
      host(room, id); phase(room, 'ROLE_REVEAL');
      assert(now >= g.forceReadyAt, 'Hazır beklemesi 30 saniye sonra aşılabilir.');
      assert(participants(room).filter(p => p.connected && !p.withdrawn).length >= 3, 'En az 3 bağlı katılımcı gerekli.');
      maybeStart(room, now, true); break;
    case 'question:select':
      playable(room);
      assert(g.question.currentAskerId === id && !g.question.targetId, 'Soru seçme sırası sende değil.');
      assert(availableTargets(room).includes(data.targetId), 'Bu oyuncuya şu anda soru soramazsın.');
      g.question.targetId = data.targetId; break;
    case 'question:done': {
      playable(room);
      const q = g.question;
      assert(q.currentAskerId === id && q.targetId, 'Önce soru sorulacak oyuncuyu seç.');
      const target = q.targetId;
      if (!q.answeredIds.includes(target)) q.answeredIds.push(target);
      if (!g.answeredEver.includes(target)) g.answeredEver.push(target);
      q.previousAskerId = id; q.currentAskerId = target; q.targetId = null; q.turnId = uid();
      normalizeQuestion(room); break;
    }
    case 'host:skip': {
      host(room, id); phase(room, 'PLAYING');
      const q = g.question, skipped = q.targetId || q.currentAskerId;
      if (!q.answeredIds.includes(skipped) && !q.skippedIds.includes(skipped)) q.skippedIds.push(skipped);
      if (!member(room, q.currentAskerId)?.connected && !q.answeredIds.includes(q.currentAskerId) && !q.skippedIds.includes(q.currentAskerId)) q.skippedIds.push(q.currentAskerId);
      const options = participants(room).filter(p => p.connected && !p.withdrawn && p.id !== skipped);
      assert(options.length, 'Sırayı alabilecek başka bağlı oyuncu yok.');
      q.currentAskerId = options.find(p => q.answeredIds.includes(p.id))?.id || options[0].id;
      q.targetId = null; q.turnId = uid();
      g.interventions.push({ kind: 'skip', playerId: skipped, at: now });
      normalizeQuestion(room);
      room.notice = 'Kurucu bir soru sırasını atlattı. Atlanan kişiye cevap yazılmadı.';
      break;
    }
    case 'vote:accuse':
      playable(room);
      assert(g.question.cycle > 1, 'Önce ilk soru döngüsü tamamlanmalı.');
      assert(!g.accusationUsedIds.includes(id), 'Bu tur suçlama hakkını kullandın.');
      assert(data.suspectId !== id && g.participantIds.includes(data.suspectId), 'Geçersiz şüpheli.');
      g.accusationUsedIds.push(id);
      pauseClock(g, now); g.state = 'ACCUSATION'; g.phaseDeadline = now + BALLOT_MS;
      g.ballot = { kind: 'accusation', suspectId: data.suspectId, requesterId: id, votes: { [id]: true }, isFinal: false }; break;
    case 'vote:cast':
      assert(g && ['ACCUSATION', 'FINAL_ACCUSATION', 'FINAL_NOMINATION'].includes(g.state), 'Aktif oylama yok.');
      assert(!Object.hasOwn(g.ballot.votes, id), 'Oyunu zaten verdin.');
      if (g.ballot.kind === 'nomination') {
        assert(data.suspectId !== id && g.participantIds.includes(data.suspectId), 'Geçersiz şüpheli.');
        g.ballot.votes[id] = data.suspectId;
      } else {
        assert(id !== g.ballot.suspectId, 'Şüpheli kendi suçlamasına oy veremez.');
        assert(typeof data.accept === 'boolean', 'Oy evet veya hayır olmalı.');
        g.ballot.votes[id] = data.accept;
      }
      if (ballotComplete(room)) resolveBallot(room, now);
      break;
    case 'spy:guess':
      assert(g && ['PLAYING', 'SPY_GUESS'].includes(g.state), 'Şimdi konum tahmini yapılamaz.');
      assert(!g.manualPaused && g.spyIds.includes(id), 'Yalnızca casus tahmin yapabilir.');
      assert(!Object.hasOwn(g.guesses, id), 'Tek tahmin hakkını kullandın.');
      assert(room.settings.enabledLocationIds.includes(data.locationId), 'Geçersiz konum.');
      if (g.state === 'PLAYING') {
        pauseClock(g, now); g.state = 'SPY_GUESS'; g.phaseDeadline = now + BALLOT_MS;
      }
      g.guesses[id] = data.locationId;
      if (g.spyIds.every(spy => Object.hasOwn(g.guesses, spy))) finishGuesses(room, now);
      break;
    case 'timer:toggle':
      host(room, id); phase(room, 'PLAYING');
      if (g.manualPaused) { g.manualPaused = false; resumeClock(g, now); }
      else { pauseClock(g, now); g.manualPaused = true; }
      break;
    case 'host:transfer':
      host(room, id);
      assert(data.playerId !== id && active(room).some(p => p.id === data.playerId), 'Bağlı başka oyuncu seç.');
      room.hostId = data.playerId; room.hostTransferAt = null; room.notice = 'Kurucu yönetimi devretti.'; break;
    case 'host:kick':
      host(room, id); assert(!g, 'Oyuncu çıkarma yalnızca lobide yapılır.');
      assert(data.playerId !== id && member(room, data.playerId), 'Geçersiz oyuncu.');
      room.players = room.players.filter(p => p.id !== data.playerId); break;
    case 'host:abort':
      host(room, id); assert(g && g.state !== 'RESULT', 'İptal edilecek tur yok.');
      g.interventions.push({ kind: 'abort', at: now });
      end(room, 'CANCELLED', 'HOST_ABORT', now); break;
    case 'game:lobby':
      host(room, id); phase(room, 'RESULT');
      room.game = null; room.lobbyId = uid();
      room.players = room.players.filter(p => !p.withdrawn);
      room.notice = 'Yeni tur için ayarları gözden geçirebilirsin.'; break;
    case 'chat:send':
      assert(typeof data.message === 'string' && data.message.trim().length > 0 && data.message.length <= 300, 'Mesaj 1–300 karakter olmalı.');
      room.chat.push({ id: cmd.id, senderId: id, senderName: p.name, message: data.message.trim(), time: now });
      room.chat = room.chat.slice(-100); break;
    case 'room:leave':
      if (g && g.state !== 'RESULT') {
        p.withdrawn = true;
        disconnectPlayer(room, id, p.generation, now);
      } else {
        room.players = room.players.filter(x => x.id !== id);
        if (room.hostId === id) {
          room.hostId = active(room)[0]?.id || room.players[0]?.id || null;
          room.hostTransferAt = null;
        }
        if (!active(room).length) room.expiresAt = now + ROOM_TTL_MS;
      }
      break;
    default: throw new Error('Bilinmeyen işlem.');
  }
}

/** Work on a clone: rejected commands cannot leave half-applied state behind. */
export function command(room, playerId, input, now = Date.now()) {
  const before = structuredClone(room);
  try {
    assert(input && typeof input === 'object' && !Array.isArray(input), 'Geçersiz mesaj.');
    assert(typeof input.id === 'string' && input.id.length >= 8 && input.id.length <= 80, 'İşlem kimliği gerekli.');
    assert(typeof input.type === 'string' && input.type.length <= 40, 'İşlem türü gerekli.');
    assert(input.payload === undefined || (input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)), 'Geçersiz işlem verisi.');
    const cached = room.receipts.find(r => r.playerId === playerId && r.id === input.id);
    if (cached) return { room, ack: cached.ack, duplicate: true };
    const draft = structuredClone(room);
    execute(draft, playerId, input, now);
    draft.revision++;
    const ack = { type: 'ack', id: input.id, ok: true, revision: draft.revision };
    draft.receipts.push({ id: input.id, playerId, ack });
    draft.receipts = draft.receipts.slice(-512);
    return { room: draft, ack, duplicate: false };
  } catch (error) {
    return { room: before, ack: { type: 'ack', id: typeof input?.id === 'string' ? input.id : null, ok: false, error: error.message }, duplicate: false };
  }
}

export function snapshot(room, playerId, now = Date.now()) {
  const p = member(room, playerId);
  assert(p && !p.withdrawn, 'Oyuncu odada değil.');
  const g = room.game;
  const common = {
    type: 'snapshot', v: 2, code: room.code, instanceId: room.instanceId,
    contextId: contextId(room), revision: room.revision, serverNow: now,
    playerId, hostId: room.hostId, settings: { ...room.settings },
    players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected && !p.withdrawn, isHost: p.id === room.hostId })),
    chat: room.chat, scores: room.scores, roundNumber: room.roundNumber, notice: room.notice,
    state: g?.state || 'LOBBY', game: null, summaries: g?.state === 'RESULT' ? room.summaries : undefined,
    hostControls: g && room.hostId === playerId ? { turnId: g.question.turnId, forceReadyAt: g.forceReadyAt, timerPaused: g.deadline === null } : null,
  };
  if (!g || !g.participantIds.includes(playerId)) return common;
  const q = g.question, b = g.ballot;
  common.game = {
    id: g.id, state: g.state, isSpy: g.spyIds.includes(playerId),
    location: g.spyIds.includes(playerId) && g.state !== 'RESULT' ? null : publicLocation(g.locationId),
    profession: g.professions[playerId] || null,
    locations: room.settings.enabledLocationIds.map(publicLocation),
    participantIds: g.participantIds, readyIds: g.readyIds, forceReadyAt: g.forceReadyAt,
    timer: { deadline: g.deadline, remainingMs: g.deadline === null ? g.remainingMs : Math.max(0, g.deadline - now), paused: g.deadline === null },
    phaseDeadline: g.phaseDeadline, question: { ...q, availableTargets: availableTargets(room) },
    canAccuse: g.state === 'PLAYING' && q.cycle > 1 && !g.accusationUsedIds.includes(playerId),
    myGuessSubmitted: Object.hasOwn(g.guesses, playerId),
    revealedSpies: g.state === 'SPY_GUESS' ? g.spyIds.map(id => ({ id, name: member(room, id)?.name || '?' })) : undefined,
    ballot: b ? {
      kind: b.kind, suspectId: b.suspectId, requesterId: b.requesterId, isFinal: b.isFinal,
      threshold: approvalThreshold(g.participantIds.length),
      eligible: b.kind === 'nomination' || b.suspectId !== playerId,
      myVote: Object.hasOwn(b.votes, playerId) ? b.votes[playerId] : null,
      votedIds: Object.keys(b.votes), // no choices or running tally before resolution
    } : null,
    result: g.result,
  };
  return common;
}
