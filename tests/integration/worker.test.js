import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root = new URL('../../', import.meta.url);
const origin = 'http://localhost:5173';
function runtime(store) {
  return new Miniflare(convertV4MiniflareOptions({
    name:'spyhaz-integration', modules: true, scriptPath:fileURLToPath(new URL('server/dist/index.js', root)),
    compatibilityDate:'2026-05-21',
    durableObjects:{ ROOMS:{ className:'SpyhazRoom', useSQLite:true } },
    resourcePersistencePath:store, bindings:{ ALLOWED_ORIGINS:origin },
  }));
}
function identity(name) { return { name, playerId:crypto.randomUUID(), token:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url') }; }
async function post(mf, path, body, extra = {}) {
  const response = await mf.dispatchFetch('http://localhost' + path, { method:'POST', headers:{ 'Content-Type':'application/json', Origin:origin, ...extra }, body:JSON.stringify(body) });
  const result = { status:response.status, headers:response.headers, body:await response.json() };
  return result;
}
async function session(mf, code, identity, expected = 'snapshot') {
  const response = await mf.dispatchFetch('http://localhost/api/rooms/' + code + '/socket', { headers:{ Upgrade:'websocket', Origin:origin } });
  assert.equal(response.status, 101);
  const ws = response.webSocket;
  const queue = [], waiters = [];
  let latest = null;
  ws.addEventListener('message', event => {
    if (event.data === 'pong') return;
    const msg = JSON.parse(event.data);
    if (msg.type === 'snapshot') latest = msg;
    const waiter = waiters.find(w => w.match(msg));
    if (waiter) { clearTimeout(waiter.timer); waiters.splice(waiters.indexOf(waiter),1); waiter.resolve(msg); }
    else queue.push(msg);
  });
  ws.accept();
  function wait(match) {
    const queued = queue.findIndex(match);
    if (queued !== -1) return Promise.resolve(queue.splice(queued,1)[0]);
    return new Promise((resolve,reject) => {
      const waiter = { match, resolve, timer:null };
      waiter.timer = setTimeout(() => { waiters.splice(waiters.indexOf(waiter),1); reject(new Error('Worker message timeout: ' + match.toString() + ' | state=' + latest?.state + ' revision=' + latest?.revision + ' queued=' + queue.map(m => m.type + ':' + (m.code || m.state || m.error || '')).join(','))); }, 8000);
      waiters.push(waiter);
    });
  }
  ws.send(JSON.stringify({ v:2, type:'session:resume', playerId:identity.playerId, token:identity.token }));
  const first = await wait(message => message.type === expected);
  return {
    ws, first, wait, get view() { return latest; },
    async send(type, payload = {}, extra = {}) {
      const data = { v:2, id:crypto.randomUUID(), type, contextId:latest.contextId, turnId:latest.game?.question.turnId, payload, ...extra };
      ws.send(JSON.stringify(data));
      const ack = await wait(msg => msg.type === 'ack' && msg.id === data.id);
      if (ack.ok) await wait(msg => msg.type === 'snapshot' && msg.revision >= ack.revision);
      return { ack, data };
    },
    close() { ws.close(1000,'test'); for (const waiter of waiters) { clearTimeout(waiter.timer); waiter.resolve({type:'closed'}); } },
  };
}
async function storePath() {
  // workerd's SQLite paths can exceed Windows MAX_PATH in deep checkout folders.
  return mkdtemp(join(tmpdir(), 'spyhaz-it-'));
}

test('Worker persists a 15-player room and private role across an actual runtime restart', { timeout:45000 }, async t => {
  const store = await storePath();
  let mf = runtime(store);
  const sockets = [];
  t.after(async () => { for (const client of sockets) { try { client.close(); } catch {} } await mf.dispose(); });
  const players = Array.from({length:15}, (_,i) => identity('Oyuncu ' + (i+1)));
  const code = 'ABC-DEF';
  assert.equal((await post(mf,'/api/rooms',{...players[0],code, settings:{spyCount:2, professions:false}})).status,201);
  for (const p of players.slice(1)) assert.equal((await post(mf,'/api/rooms/' + code + '/players',p)).status,201);
  assert.equal((await post(mf,'/api/rooms/' + code + '/players',identity('Fazla oyuncu'))).status,400);
  for (const p of players) sockets.push(await session(mf,code,p));
  await sockets[0].wait(msg => msg.type === 'snapshot' && msg.players.every(p => p.connected));
  assert.equal((await sockets[0].send('game:start')).ack.ok,true);
  for (const client of sockets) if (!client.view.game) await client.wait(msg => msg.type === 'snapshot' && msg.state === 'ROLE_REVEAL');
  for (const client of sockets) assert.equal((await client.send('game:ready')).ack.ok,true);
  const spyIndex = sockets.findIndex(client => client.view.game?.isSpy);
  assert.notEqual(spyIndex,-1);
  const spy = sockets[spyIndex];
  const roundId = spy.view.game.id;
  assert.equal(spy.view.game.location,null);
  assert.equal(spy.view.game.spyIds,undefined);
  const replacement = await session(mf,code,players[spyIndex]);
  sockets.push(replacement);
  await spy.wait(msg => msg.type === 'fatal' && msg.code === 'SESSION_REPLACED');
  assert.equal(replacement.view.game.id,roundId);
  assert.equal(replacement.view.players.find(p => p.id === players[spyIndex].playerId).connected,true);
  for (const client of sockets) { try { client.close(); } catch {} }
  await mf.dispose();
  mf = runtime(store);
  const resumed = await session(mf,code,players[spyIndex]);
  sockets.push(resumed);
  assert.equal(resumed.view.game.id,roundId);
  assert.equal(resumed.view.state,'PLAYING');
  assert.equal(resumed.view.game.isSpy,true);
  assert.equal(resumed.view.game.location,null);
});

test('Worker validates origin, identity, malformed input and retry-safe joining', { timeout:30000 }, async t => {
  const mf = runtime(await storePath());
  const clients = [];
  t.after(async () => { clients.forEach(c => c.close()); await mf.dispose(); });
  const player = identity('<b>Oyuncu</b>');
  const created = await post(mf,'/api/rooms',{...player,code:'GHJ-KLM'});
  assert.equal(created.status,201);
  assert.equal(created.headers.get('access-control-allow-origin'),origin);
  assert.equal((await post(mf,'/api/rooms',{...player,code:'GHJ-KLM'})).status,200);
  const intruder = identity('Yetkisiz');
  assert.equal((await post(mf,'/api/rooms',{...intruder,code:'GHJ-KLM'})).status,409);
  const denied = await post(mf,'/api/rooms',{...intruder,code:'NPQ-RST'},{Origin:'https://untrusted.example'});
  assert.equal(denied.status,403);
  assert.equal((await post(mf,'/api/rooms/GHJ-KLM/players',{...intruder,name:123})).status,400);
  assert.equal((await post(mf,'/api/rooms/GHJ-KLM/players',intruder)).status,201);
  assert.equal((await post(mf,'/api/rooms/GHJ-KLM/players',intruder)).status,201);
  const bad = await session(mf,'GHJ-KLM',{...player,token:identity('x').token},'fatal');
  clients.push(bad);
  assert.equal(bad.first.code,'INVALID_SESSION');
  const host = await session(mf,'GHJ-KLM',player); clients.push(host);
  assert.equal(host.view.players.length,2);
  assert.equal(host.view.players[0].name,'<b>Oyuncu</b>'); // UI must render this as text.
  host.ws.send('not json');
  assert.equal((await host.wait(m => m.type === 'error')).error,'Geçersiz JSON.');
  assert.equal((await host.send('chat:send',{message:123})).ack.ok,false);
  const sent = await host.send('chat:send',{message:'Bir kez'});
  assert.equal(sent.ack.ok,true);
  host.ws.send(JSON.stringify(sent.data));
  await host.wait(m => m.type === 'ack' && m.id === sent.data.id);
  const replayView = await host.wait(m => m.type === 'snapshot' && m.chat.some(x => x.id === sent.data.id));
  assert.equal(replayView.chat.filter(x => x.id === sent.data.id).length,1);
});

test('Worker resumes role reveal, a selected question, a submitted ballot and final result', { timeout:45000 }, async t => {
  const store = await storePath(); let mf = runtime(store);
  const clients = [], players = [identity('Ali'),identity('Ayşe'),identity('Can')], code='UVW-XYZ';
  t.after(async () => { clients.forEach(c => {try{c.close();}catch{}}); await mf.dispose(); });
  await post(mf,'/api/rooms',{...players[0],code});
  for (const p of players.slice(1)) await post(mf,'/api/rooms/'+code+'/players',p);
  for (const p of players) clients.push(await session(mf,code,p));
  await clients[0].wait(m => m.type === 'snapshot' && m.players.every(p => p.connected));
  assert.equal((await clients[0].send('game:start')).ack.ok,true);
  for (const c of clients) if (!c.view.game) await c.wait(m => m.type === 'snapshot' && m.game);
  await clients[0].send('game:ready');
  let host = await session(mf,code,players[0]); clients.push(host);
  assert.equal(host.view.game.readyIds.includes(players[0].playerId),true);
  for (const c of clients.slice(1,3)) await c.send('game:ready');
  if (host.view.state !== 'PLAYING') await host.wait(m => m.type === 'snapshot' && m.state === 'PLAYING');
  let selected = host.view;
  while (selected.game.question.cycle === 1) {
    const askerId = selected.game.question.currentAskerId;
    const asker = askerId === players[0].playerId ? host : clients[players.findIndex(p => p.playerId === askerId)];
    if (asker.view.revision < selected.revision) await asker.wait(m => m.type === 'snapshot' && m.revision >= selected.revision);
    const target = selected.game.question.availableTargets[0];
    assert.equal((await asker.send('question:select',{targetId:target})).ack.ok,true);
    const question = asker.view.game.question;
    const identityForAsker = players.find(p => p.playerId === askerId);
    const resumed = await session(mf,code,identityForAsker); clients.push(resumed);
    if (askerId === players[0].playerId) host = resumed;
    else clients[players.findIndex(p => p.playerId === askerId)] = resumed;
    assert.equal(resumed.view.game.question.targetId,target);
    assert.equal((await resumed.send('question:done')).ack.ok,true);
    selected = resumed.view;
  }
  if (host.view.game.question.cycle === 1) await host.wait(m => m.type === 'snapshot' && m.game.question.cycle === 2);
  const spy = clients.find(c => c.view?.game?.isSpy)?.view.playerId;
  const requester = players.find(p => p.playerId !== spy);
  let accuser = requester.playerId === players[0].playerId ? host : clients[players.indexOf(requester)];
  assert.equal((await accuser.send('vote:accuse',{suspectId:spy})).ack.ok,true);
  accuser = await session(mf,code,requester); clients.push(accuser);
  assert.equal(accuser.view.state,'ACCUSATION'); assert.equal(accuser.view.game.ballot.myVote,true);
  // Abort via the host to verify persisted result and no points.
  if (requester === players[0]) host = accuser;
  if (host.view.state !== 'ACCUSATION') await host.wait(m => m.type === 'snapshot' && m.state === 'ACCUSATION');
  assert.equal((await host.send('host:abort')).ack.ok,true);
  for (const c of clients) { try { c.close(); } catch {} }
  await mf.dispose(); mf = runtime(store);
  const result = await session(mf,code,players[0]); clients.push(result);
  assert.equal(result.view.state,'RESULT');
  assert.equal(result.view.game.result.winner,'CANCELLED');
  assert.deepEqual(result.view.scores,{});
});
