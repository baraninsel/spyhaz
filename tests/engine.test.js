import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.js';
import { command, snapshot, disconnectPlayer, connectPlayer, tick, availableTargets, nextDeadline, joinRoom } from '../server/src/engine.js';
import { approvalThreshold, validateSettings, normalizeCode } from '../shared/rules.js';

test('private snapshots never contain the selected location or other spies', () => {
  const h = setup(15, { spyCount: 2 }).start();
  for (const spy of h.room.game.spyIds) {
    const view = snapshot(h.room, spy, h.now);
    assert.equal(view.game.location, null);
    assert.equal(view.game.profession, null);
    assert.equal('spyIds' in view.game, false);
    assert.equal('previousLocationId' in view.game, false);
    assert.equal('guesses' in view.game, false);
    assert.equal('tokenHash' in view.players[0], false);
    assert.equal(view.game.locations.length, 30);
    assert.equal(view.game.revealedSpies, undefined);
  }
  const civilian = h.players.find(p => !h.room.game.spyIds.includes(p.id));
  assert.equal(snapshot(h.room, civilian.id).game.location.id, h.room.game.locationId);
});

test('repeated locations remain possible and all locations remain guessable', t => {
  t.mock.method(crypto, 'getRandomValues', array => { array.fill(0); return array; });
  const h = setup(3).start();
  const location = h.room.game.locationId;
  const spy = h.room.game.spyIds[0];
  h.send(spy, 'spy:guess', { locationId: location });
  assert.equal(h.room.game.result.winner, 'SPY');
  h.send(h.room.hostId, 'game:lobby');
  h.start();
  assert.equal(h.room.game.locationId, location);
  assert.equal(snapshot(h.room, h.room.game.spyIds[0]).game.locations.some(l => l.id === location), true);
});

test('supports 3, 8, 12, and 15 players with the requested spy count', () => {
  for (const n of [3,8,12,15]) {
    const h = setup(n, { spyCount: n >= 7 ? 2 : 1 }).start();
    assert.equal(h.room.game.participantIds.length, n);
    assert.equal(h.room.game.spyIds.length, n >= 7 ? 2 : 1);
  }
});

test('limits lobby capacity to fifteen and validates two-spy minimum', () => {
  const small = setup(6, { spyCount: 2 });
  assert.equal(small.raw(small.room.hostId, 'game:start').ack.ok, false);
  const h = setup(15);
  assert.throws(() => joinRoom(h.room, { id:crypto.randomUUID(), name:'Fazla oyuncu', tokenHash:'test' }), /15/);
  assert.equal(h.room.players.length, 15);
});

test('profession mode is off by default, optional, and stable after reconnect', () => {
  const off = setup(8).start();
  assert.deepEqual(off.room.game.professions, {});
  const h = setup(15, { professions: true, spyCount: 2 }).start();
  const civilian = h.players.find(p => !h.room.game.spyIds.includes(p.id));
  const before = snapshot(h.room, civilian.id).game.profession;
  disconnectPlayer(h.room, civilian.id, 'generation-' + civilian.id, h.now);
  connectPlayer(h.room, civilian.id, 'new-generation', h.now + 1);
  assert.equal(snapshot(h.room, civilian.id).game.profession, before);
  assert.equal(Object.keys(h.room.game.professions).length, 13);
});

test('a stale socket close cannot disconnect the replacement session', () => {
  const h = setup();
  const id = h.players[0].id;
  connectPlayer(h.room, id, 'replacement', h.now + 1);
  assert.equal(disconnectPlayer(h.room, id, 'generation-' + id, h.now + 2), false);
  assert.equal(h.room.players[0].connected, true);
});

test('host transfers after grace and returning host does not reclaim control', () => {
  const h = setup();
  const original = h.room.hostId;
  disconnectPlayer(h.room, original, 'generation-' + original, h.now);
  tick(h.room, h.now + 29_999); assert.equal(h.room.hostId, original);
  tick(h.room, h.now + 30_000); assert.notEqual(h.room.hostId, original);
  const replacement = h.room.hostId;
  connectPlayer(h.room, original, 'again', h.now + 31_000);
  assert.equal(h.room.hostId, replacement);
});

test('only an entirely disconnected room receives a 24-hour expiry', () => {
  const h = setup(3).start();
  assert.equal(h.room.expiresAt, null);
  for (const p of h.players) disconnectPlayer(h.room, p.id, 'generation-' + p.id, h.now);
  assert.equal(h.room.expiresAt, h.now + 86_400_000);
  connectPlayer(h.room, h.players[0].id, 'again', h.now + 1000);
  assert.equal(h.room.expiresAt, null);
});

test('disconnected ready participants no longer block connected ready players', () => {
  const h = setup(4);
  h.send(h.room.hostId, 'game:start');
  const absent = h.players[3].id;
  disconnectPlayer(h.room, absent, 'generation-' + absent, h.now);
  for (const p of h.players.slice(0,3)) h.send(p.id, 'game:ready');
  assert.equal(h.room.game.state, 'PLAYING');
  assert.equal(h.room.game.participantIds.length, 4);
});

test('host can bypass readiness only after thirty seconds', () => {
  const h = setup(3);
  h.send(h.room.hostId, 'game:start');
  assert.equal(h.raw(h.room.hostId, 'host:forceReady').ack.ok, false);
  h.now += 30_000;
  h.send(h.room.hostId, 'host:forceReady');
  assert.equal(h.room.game.state, 'PLAYING');
});

test('first cycle includes every participant exactly once and carries the question chain', () => {
  const h = setup(15).start();
  const seen = new Set(), cycle = h.room.game.question.cycle;
  while (h.room.game.question.cycle === cycle) {
    const q = h.room.game.question;
    const target = availableTargets(h.room)[0];
    assert.equal(seen.has(target), false);
    seen.add(target);
    const asker = q.currentAskerId;
    h.send(asker, 'question:select', { targetId: target });
    h.send(asker, 'question:done');
    assert.equal(h.room.game.question.currentAskerId, target);
  }
  assert.equal(seen.size, 15);
});

test('accusation is blocked before the first cycle completes', () => {
  const h = setup(8).start();
  assert.equal(h.raw(h.players[0].id, 'vote:accuse', { suspectId: h.players[1].id }).ack.ok, false);
  h.cycle();
  h.send(h.players[0].id, 'vote:accuse', { suspectId: h.players[1].id });
  assert.equal(h.room.game.state, 'ACCUSATION');
});

test('active target, turn ID, and asker identity are enforced', () => {
  const h = setup(8).start();
  const asker = h.room.game.question.currentAskerId;
  assert.equal(h.raw(asker, 'question:done').ack.ok, false);
  const target = availableTargets(h.room)[0];
  const selected = h.send(asker, 'question:select', { targetId:target });
  assert.equal(h.raw(asker, 'question:select', { targetId: availableTargets(h.room)[1] }).ack.ok, false);
  h.send(asker, 'question:done');
  assert.equal(h.raw(target, 'question:done', {}, { turnId:selected.input.turnId }).ack.ok, false);
});

test('host skip never fabricates an answer and frees a stuck question', () => {
  const h = setup().start();
  const q = h.room.game.question;
  const target = availableTargets(h.room).find(id => id !== h.room.hostId);
  h.send(q.currentAskerId, 'question:select', { targetId:target });
  disconnectPlayer(h.room, target, 'generation-' + target, h.now);
  h.send(h.room.hostId, 'host:skip');
  assert.equal(h.room.game.question.targetId, null);
  assert.equal(h.room.game.answeredEver.includes(target), false);
  assert.equal(h.room.game.question.skippedIds.includes(target), true);
  assert.ok(availableTargets(h.room).length);
});

test('duplicate command is acknowledged without applying a second mutation', () => {
  const h = setup(3).start(), spy = h.room.game.spyIds[0];
  const result = h.send(spy, 'spy:guess', { locationId: h.room.game.locationId });
  const replay = command(h.room, spy, result.input, h.now + 1);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.room.roundNumber, 1);
  assert.equal(replay.room.scores[spy], 4);
  assert.equal(replay.room.summaries.length, 1);
});

test('new game cannot overwrite an active round and stale lobby commands are rejected', () => {
  const h = setup(3);
  const old = h.send(h.room.hostId, 'game:start').input;
  assert.equal(h.raw(h.room.hostId, 'game:start').ack.ok, false);
  h.send(h.room.hostId, 'host:abort'); h.send(h.room.hostId, 'game:lobby');
  const replay = command(h.room, h.room.hostId, { ...old, id:crypto.randomUUID() }, h.now);
  assert.equal(replay.ack.ok, false);
  assert.equal(replay.room.game, null);
});

test('threshold uses the frozen roster, including disconnected players', () => {
  const h = setup(12).start().cycle();
  const suspect = h.room.game.spyIds[0];
  const voters = h.players.filter(p => p.id !== suspect);
  h.send(voters[0].id, 'vote:accuse', { suspectId:suspect });
  for (const p of voters.slice(8)) disconnectPlayer(h.room, p.id, 'generation-' + p.id, h.now);
  for (const p of voters.slice(1,7)) h.send(p.id, 'vote:cast', { accept:true });
  assert.equal(snapshot(h.room, voters[0].id).game.ballot.threshold, 8);
  h.now += 30_000; tick(h.room, h.now);
  assert.equal(h.room.game.state, 'PLAYING'); // seven yes, not eight
  assert.equal(h.room.game.result, null);
});

test('accusation choices stay secret and failed ballot restores the open question and clock', () => {
  const h = setup(8).start().cycle();
  const q = h.room.game.question, target = availableTargets(h.room)[0];
  h.send(q.currentAskerId, 'question:select', { targetId:target });
  const suspect = h.players[1].id, requester = h.players[0].id;
  h.now += 9000;
  h.send(requester, 'vote:accuse', { suspectId:suspect });
  const remaining = h.room.game.remainingMs;
  h.send(h.players[2].id, 'vote:cast', { accept:false });
  const view = snapshot(h.room, requester).game.ballot;
  assert.equal(view.votes, undefined);
  assert.equal(view.myVote, true);
  assert.equal(h.room.game.deadline, null);
  h.now += 30_000; tick(h.room, h.now);
  assert.equal(h.room.game.state, 'PLAYING');
  assert.equal(h.room.game.question.targetId, target);
  assert.equal(h.room.game.deadline, h.now + remaining);
  assert.equal(h.raw(requester, 'vote:accuse', { suspectId:suspect }).ack.ok, false);
});

test('successful accusation scores once, including the uncaught second spy', () => {
  const h = setup(12, { spyCount:2 }).start().cycle();
  const suspect = h.room.game.spyIds[0], otherSpy = h.room.game.spyIds[1];
  const civilians = h.players.filter(p => !h.room.game.spyIds.includes(p.id));
  h.send(civilians[0].id, 'vote:accuse', { suspectId:suspect });
  for (const p of civilians.slice(1)) h.send(p.id, 'vote:cast', { accept:true });
  h.now += 30_000; tick(h.room, h.now);
  assert.equal(h.room.game.result.winner, 'PLAYERS');
  assert.equal(h.room.scores[civilians[0].id], 2);
  assert.equal(h.room.scores[otherSpy], 1);
  assert.equal(h.room.scores[suspect], 0);
  tick(h.room, h.now + 100000);
  assert.equal(h.room.roundNumber, 1);
});

test('invalid suspect, self vote, and changed vote are rejected atomically', () => {
  const h = setup().start().cycle();
  assert.equal(h.raw(h.players[0].id, 'vote:accuse', { suspectId:'not-in-room' }).ack.ok, false);
  assert.equal(h.room.game.state, 'PLAYING');
  h.send(h.players[0].id, 'vote:accuse', { suspectId:h.players[1].id });
  assert.equal(h.raw(h.players[1].id, 'vote:cast', { accept:true }).ack.ok, false);
  assert.equal(h.raw(h.players[0].id, 'vote:cast', { accept:false }).ack.ok, false);
  assert.equal(h.raw(h.players[2].id, 'vote:cast', { accept:'yes' }).ack.ok, false);
});

test('two spies each have one private guess and either correct guess wins', () => {
  const h = setup(12, { spyCount:2 }).start();
  const [a,b] = h.room.game.spyIds, correct = h.room.game.locationId;
  const wrong = h.room.settings.enabledLocationIds.find(id => id !== correct);
  h.send(a, 'spy:guess', { locationId:wrong });
  assert.equal(h.room.game.state, 'SPY_GUESS');
  assert.equal(snapshot(h.room, b).game.guesses, undefined);
  assert.equal(h.raw(a, 'spy:guess', { locationId:correct }).ack.ok, false);
  h.send(b, 'spy:guess', { locationId:correct });
  assert.equal(h.room.game.result.winner, 'SPY');
  assert.equal(h.room.scores[a], 2); assert.equal(h.room.scores[b], 4);
});

test('an absent second spy times out without freezing the game', () => {
  const h = setup(8, { spyCount:2 }).start();
  const [a] = h.room.game.spyIds, correct = h.room.game.locationId;
  h.send(a, 'spy:guess', { locationId:h.room.settings.enabledLocationIds.find(id => id !== correct) });
  h.now += 30_000; tick(h.room, h.now);
  assert.equal(h.room.game.result.winner, 'PLAYERS');
});

test('timer enters final nomination, followed by approval and no accuser bonus', () => {
  const h = setup(8, { duration:60 }).start();
  h.now += 60_000; tick(h.room, h.now);
  assert.equal(h.room.game.state, 'FINAL_NOMINATION');
  const spy = h.room.game.spyIds[0];
  for (const p of h.players) h.send(p.id, 'vote:cast', { suspectId:p.id === spy ? h.players.find(x => x.id !== spy).id : spy });
  assert.equal(h.room.game.state, 'FINAL_ACCUSATION');
  for (const p of h.players.filter(p => p.id !== spy)) h.send(p.id, 'vote:cast', { accept:true });
  assert.equal(h.room.game.result.winner, 'PLAYERS');
  for (const p of h.players.filter(p => p.id !== spy)) assert.equal(h.room.scores[p.id], 1);
});

test('final nomination tie and missing final approval end with spy victory', () => {
  const h = setup(8, { duration:60 }).start();
  h.now += 60_000; tick(h.room, h.now);
  h.now += 30_000; tick(h.room, h.now);
  assert.equal(h.room.game.result.winner, 'SPY');
  assert.equal(h.room.roundNumber, 1);
});

test('host abort has no score or counted round', () => {
  const h = setup().start();
  h.send(h.room.hostId, 'host:abort');
  assert.equal(h.room.game.result.winner, 'CANCELLED');
  assert.deepEqual(h.room.scores, {});
  assert.equal(h.room.roundNumber, 0);
});

test('malformed messages and unauthorized host operations do not mutate state', () => {
  const h = setup().start(), id = h.players[1].id;
  for (const input of [null, 0, [], {}, { id:'abc', type:'x' }, { id:crypto.randomUUID(), type:'chat:send', payload:[] }]) {
    const result = command(h.room, id, input, h.now);
    assert.equal(result.ack.ok, false);
    assert.deepEqual(result.room, h.room);
  }
  for (const type of ['host:skip','host:abort','host:transfer','timer:toggle']) assert.equal(h.raw(id, type).ack.ok, false);
  assert.equal(h.raw(id, 'chat:send', { message:123 }).ack.ok, false);
  assert.equal(h.raw(id, 'chat:send', { message:'x'.repeat(301) }).ack.ok, false);
});

test('snapshot retains role reveal, open target, vote and result after serialization', () => {
  const h = setup();
  h.send(h.room.hostId, 'game:start');
  h.send(h.players[0].id, 'game:ready');
  h.room = JSON.parse(JSON.stringify(h.room));
  assert.equal(snapshot(h.room, h.players[0].id).game.readyIds.includes(h.players[0].id), true);
  for (const p of h.players.slice(1)) h.send(p.id, 'game:ready');
  h.cycle();
  const target = availableTargets(h.room)[0];
  h.send(h.room.game.question.currentAskerId, 'question:select', { targetId:target });
  const requester = h.players[0].id, suspect = h.players[1].id;
  h.send(requester, 'vote:accuse', { suspectId:suspect });
  h.room = JSON.parse(JSON.stringify(h.room));
  const view = snapshot(h.room, requester);
  assert.equal(view.state, 'ACCUSATION');
  assert.equal(view.game.question.targetId, target);
  assert.equal(view.game.ballot.myVote, true);
  h.send(h.room.hostId, 'host:abort');
  h.room = JSON.parse(JSON.stringify(h.room));
  assert.equal(snapshot(h.room, requester).game.result.id, h.room.game.id);
});

test('shared settings reject short, duplicate and unknown location lists', () => {
  assert.throws(() => validateSettings({ enabledLocationIds:[1,2,3,4,5] }), /10/);
  assert.throws(() => validateSettings({ enabledLocationIds:Array(10).fill(1) }), /10/);
  assert.throws(() => validateSettings({ enabledLocationIds:[1,2,3,4,5,6,7,8,9,31] }));
  assert.equal(validateSettings({ enabledLocationIds:[1,2,3,4,5,6,7,8,9,10,10] }).enabledLocationIds.length, 10);
  assert.equal(normalizeCode(' abc def '), 'ABC-DEF');
  assert.deepEqual([3,8,12,15].map(approvalThreshold), [2,5,8,10]);
});

test('clock advances by timestamps after restart, not by accumulated ticks', () => {
  const h = setup(3, { duration:60 }).start();
  const stored = JSON.parse(JSON.stringify(h.room));
  tick(stored, h.now + 70_000);
  assert.equal(stored.game.state, 'FINAL_NOMINATION');
  assert.equal(stored.game.remainingMs, 0);
  assert.equal(stored.game.phaseDeadline, h.now + 100_000);
  assert.ok(Number.isFinite(nextDeadline(stored)));
});

test('a returning nonparticipant sees no private card for the ongoing round', () => {
  const h = setup(4), absent = h.players[3].id;
  disconnectPlayer(h.room, absent, 'generation-' + absent, h.now);
  h.send(h.room.hostId, 'game:start');
  connectPlayer(h.room, absent, 'again', h.now);
  assert.equal(snapshot(h.room, absent).game, null);
  assert.equal(h.raw(absent, 'game:ready').ack.ok, false);
});

test('a spectator entrusted with hosting can recover the round without learning a private card', () => {
  const h = setup(4), spectator = h.players[3].id;
  disconnectPlayer(h.room, spectator, 'generation-' + spectator, h.now);
  h.send(h.room.hostId, 'game:start');
  for (const p of h.players.slice(0,3)) h.send(p.id, 'game:ready');
  connectPlayer(h.room, spectator, 'returned-spectator', h.now);
  h.send(h.room.hostId, 'host:transfer', {playerId:spectator});
  const view = snapshot(h.room, spectator);
  assert.equal(view.game, null);
  assert.equal(view.hostControls.turnId, h.room.game.question.turnId);
  assert.equal('location' in view.hostControls, false);
  const result = command(h.room, spectator, {id:crypto.randomUUID(),type:'host:skip',contextId:view.contextId,turnId:view.hostControls.turnId,payload:{}}, h.now);
  assert.equal(result.ack.ok, true);
});
