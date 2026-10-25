// Local browser QA fixture: joins two synthetic players; never contacts production.
const code = process.argv[2];
if (!code) throw new Error('Usage: node tests/browser-fixture.mjs ABC-DEF');
const base = 'http://127.0.0.1:8787';
const bots = [];
for (const name of ['Deneme Ayşe', 'Deneme Can']) {
  const identity = { name, playerId:crypto.randomUUID(), token:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url') };
  const response = await fetch(base + '/api/rooms/' + code + '/players', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(identity) });
  if (!response.ok) throw new Error(await response.text());
  const ws = new WebSocket('ws://127.0.0.1:8787/api/rooms/' + code + '/socket');
  const bot = { ws, seen:new Set() }; bots.push(bot);
  ws.onopen = () => ws.send(JSON.stringify({v:2,type:'session:resume',...identity}));
  const send = (s,type,payload={}) => ws.send(JSON.stringify({v:2,id:crypto.randomUUID(),type,contextId:s.contextId,turnId:s.game?.question.turnId,payload}));
  ws.onmessage = event => {
    if (event.data === 'pong') return;
    const s = JSON.parse(event.data);
    if (s.type !== 'snapshot' || !s.game) return;
    const g = s.game;
    if (s.state === 'ROLE_REVEAL' && !g.readyIds.includes(identity.playerId) && !bot.seen.has(g.id + ':ready')) {
      bot.seen.add(g.id + ':ready'); send(s,'game:ready');
    }
    if (s.state === 'PLAYING' && g.question.currentAskerId === identity.playerId) {
      const q = g.question;
      const key = q.turnId + ':' + (q.targetId ? 'done' : 'select');
      if (!bot.seen.has(key)) {
        bot.seen.add(key);
        setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (q.targetId) send(s,'question:done');
          else if (q.availableTargets[0]) send(s,'question:select',{targetId:q.availableTargets[0]});
        }, 600);
      }
    }
    if (['ACCUSATION','FINAL_ACCUSATION'].includes(s.state) && g.ballot.eligible && g.ballot.myVote === null) {
      const key = g.id + ':' + g.phaseDeadline;
      if (!bot.seen.has(key)) { bot.seen.add(key); send(s,'vote:cast',{accept:true}); }
    }
  };
}
console.log('Two local test players connected to', code);
const ping = setInterval(() => bots.forEach(b => { if (b.ws.readyState === WebSocket.OPEN) b.ws.send('ping'); }),25000);
const stop = () => { clearInterval(ping); bots.forEach(b => b.ws.close()); process.exit(); };
process.on('SIGINT',stop); process.on('SIGTERM',stop);
