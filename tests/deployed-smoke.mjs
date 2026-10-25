// Run explicitly against a newly deployed server. Creates only a random test room.
// Usage: node tests/deployed-smoke.mjs https://worker.example.workers.dev
import assert from 'node:assert/strict';
const base = new URL(process.argv[2] || 'http://127.0.0.1:8787');
const origin = process.argv[3] || 'https://spyhaz.vercel.app';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join('');
const code = randomCode.slice(0, 3) + '-' + randomCode.slice(3);
const players = Array.from({length:15}, (_, i) => ({ name:'Yayın Test ' + (i + 1), playerId:crypto.randomUUID(), token:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url') }));
const clients = [];
async function post(path, data) {
  const response = await fetch(new URL(path, base), { method:'POST', headers:{'Content-Type':'application/json', Origin:origin}, body:JSON.stringify(data), signal:AbortSignal.timeout(15000) });
  const result = await response.json();
  assert.equal(response.status, 201, result.error);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  return result;
}
async function connect(player) {
  const url = new URL('/api/rooms/' + code + '/socket', base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(url);
  const pending = [], queued = [];
  let view;
  const receive = message => {
    if (message.type === 'snapshot') view = message;
    const index = pending.findIndex(item => item.match(message));
    if (index < 0) queued.push(message);
    else { const [item] = pending.splice(index,1); clearTimeout(item.timer); item.resolve(message); }
  };
  ws.onmessage = event => { if (event.data !== 'pong') receive(JSON.parse(event.data)); };
  ws.onopen = () => ws.send(JSON.stringify({v:2,type:'session:resume',playerId:player.playerId,token:player.token}));
  ws.onerror = () => receive({type:'transport-error'});
  function wait(match) {
    const index = queued.findIndex(match);
    if (index >= 0) return Promise.resolve(queued.splice(index,1)[0]);
    return new Promise((resolve,reject) => {
      const item = {match,resolve,timer:null};
      item.timer = setTimeout(() => { pending.splice(pending.indexOf(item),1); reject(new Error('Timed out waiting for deployed worker')); },15000);
      pending.push(item);
    });
  }
  const client = {
    ws, wait, get view() { return view; },
    async sync() { return this.send('session:sync'); },
    async send(type, payload = {}, expectSnapshot = true) {
      const data = {v:2,id:crypto.randomUUID(),type,contextId:view.contextId,turnId:view.game?.question.turnId,payload};
      ws.send(JSON.stringify(data));
      const ack = await wait(m => m.type === 'ack' && m.id === data.id);
      assert.equal(ack.ok,true,ack.error);
      if (expectSnapshot) await wait(m => m.type === 'snapshot' && m.revision >= ack.revision);
      return ack;
    },
    close() { ws.close(); for (const item of pending.splice(0)) { clearTimeout(item.timer); item.resolve({type:'closed'}); } },
  };
  clients.push(client);
  const first = await wait(m => ['snapshot','fatal','transport-error'].includes(m.type));
  assert.equal(first.type,'snapshot',first.error);
  return client;
}
let host;
try {
  const health = await fetch(new URL('/api/health',base), {signal:AbortSignal.timeout(15000)});
  assert.equal((await health.json()).protocol,2);
  await post('/api/rooms',{...players[0],code});
  host = await connect(players[0]);
  const members = [host];
  for (const player of players.slice(1)) {
    await post('/api/rooms/' + code + '/players',player);
    members.push(await connect(player));
  }
  await host.sync();
  assert.equal(host.view.players.filter(p => p.connected).length,15);
  await host.send('room:settings',{spyCount:2});
  await host.send('game:start');
  const roundId = host.view.game.id;
  for (const client of members) { await client.sync(); await client.send('game:ready'); }
  await host.sync();
  assert.equal(host.view.state,'PLAYING');
  for (const client of members) await client.sync();
  assert.equal(members.filter(c => c.view.game.isSpy).length,2);
  for (const client of members.filter(c => c.view.game.isSpy)) {
    assert.equal(client.view.game.location,null);
    assert.equal(client.view.game.spyIds,undefined);
  }
  const asker = members.find(c => c.view.playerId === host.view.game.question.currentAskerId);
  await asker.send('question:select',{targetId:asker.view.game.question.availableTargets[0]});
  const question = asker.view.game.question;
  const spyIndex = members.findIndex(c => c.view.game.isSpy);
  const resumedSpy = await connect(players[spyIndex]);
  assert.equal(resumedSpy.view.game.id,roundId);
  assert.equal(resumedSpy.view.game.question.targetId,question.targetId);
  assert.equal(resumedSpy.view.game.isSpy,true);
  assert.equal(resumedSpy.view.game.location,null);
  if (spyIndex === 0) host = resumedSpy;
  await host.sync();
  await host.send('host:abort');
  const restoredHost = await connect(players[0]); host = restoredHost;
  assert.equal(host.view.state,'RESULT');
  assert.equal(host.view.game.result.winner,'CANCELLED');
  assert.deepEqual(host.view.scores,{});
  await host.send('game:lobby');
  for (let i = members.length - 1; i >= 1; i--) {
    const client = i === spyIndex ? resumedSpy : members[i];
    await client.sync(); await client.send('room:leave',{},false); client.close();
  }
  await host.sync(); await host.send('room:leave',{},false);
  console.log(JSON.stringify({ok:true,server:base.origin,players:15,spies:2,checks:['HTTP/CORS','15 concurrent WebSockets','private cards','ready phase','open question recovery','result recovery','test memberships removed']}));
} catch (error) {
  if (host?.ws.readyState === WebSocket.OPEN) {
    try { await host.sync(); if (host.view.game && host.view.state !== 'RESULT') await host.send('host:abort'); } catch {}
  }
  throw error;
} finally { clients.forEach(client => client.close()); }
