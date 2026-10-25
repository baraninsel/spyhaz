import assert from 'node:assert/strict';
import { createRoom, joinRoom, connectPlayer, command, contextId, availableTargets } from '../server/src/engine.js';
export function setup(n = 8, settings = {}, now = 1_000_000) {
  const players = Array.from({ length:n }, (_, i) => ({ id: crypto.randomUUID(), name: 'Oyuncu ' + (i+1), tokenHash: 'private-hash-' + i }));
  let room = createRoom('ABC-DEF', players[0], settings, now);
  for (const player of players.slice(1)) joinRoom(room, player, now);
  for (const player of players) connectPlayer(room, player.id, 'generation-' + player.id, now);
  return {
    players, now,
    get room() { return room; }, set room(value) { room = value; },
    raw(id, type, payload = {}, extra = {}) {
      const input = { id: crypto.randomUUID(), type, contextId: contextId(room), turnId: room.game?.question.turnId, payload, ...extra };
      const result = command(room, id, input, this.now); room = result.room; return { ...result, input };
    },
    send(id, type, payload = {}, extra = {}) {
      const result = this.raw(id, type, payload, extra);
      assert.equal(result.ack.ok, true, result.ack.error); return result;
    },
    start() {
      this.send(room.hostId, 'game:start');
      for (const p of players) this.send(p.id, 'game:ready');
      assert.equal(room.game.state, 'PLAYING');
      return this;
    },
    cycle() {
      const cycle = room.game.question.cycle;
      let safety = 0;
      while (room.game.question.cycle === cycle) {
        assert.ok(++safety < n * 3);
        const asker = room.game.question.currentAskerId;
        const target = availableTargets(room)[0]; assert.ok(target);
        this.send(asker, 'question:select', { targetId: target });
        this.send(asker, 'question:done');
      }
      return this;
    },
  };
}
