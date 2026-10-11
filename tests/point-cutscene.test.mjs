import test from 'node:test';
import assert from 'node:assert/strict';
import { PointCardTimeline, pointCardFor, drawPointCardArt, POINT_CARD_DURATION } from '../src/point-cutscene.js';
import { ROSTER } from '../src/roster.js';
import { readFile } from 'node:fs/promises';

const eventFor = (id, team = 0, reason = 'ground', contactKind = 'spike') => ({
  type: 'point', team, reason, score: [3, 2],
  scorer: { id: team === 0 ? id : 'raven', index: team === 0 ? 1 : 2, team, contactKind },
  conceded: { id: team === 1 ? id : 'raven', index: team === 1 ? 1 : 2, team: 1 - team, contactKind: 'receive' },
});

test('cards use the actual contributor and original attack/hurt poses for all ten identities', () => {
  for (const character of ROSTER) for (const team of [0, 1]) {
    const card = pointCardFor(eventFor(character.id, team));
    assert.equal(card.character.id, character.id);
    assert.equal(card.actor.team, 0);
    assert.equal(card.pose, team === 0 ? 1 : 2);
    assert.equal(card.outcome, team === 0 ? 'won' : 'lost');
  }
});

test('scoring and faults have appropriate captions; training never invents match points', () => {
  assert.equal(pointCardFor(eventFor('nova', 0, 'ground', 'block')).detail, '블로킹 득점');
  assert.equal(pointCardFor(eventFor('seraph', 0, 'ground', 'serve')).detail, '서비스 에이스');
  assert.equal(pointCardFor(eventFor('nova', 0, 'out')).detail, '상대 아웃');
  assert.equal(pointCardFor(eventFor('nova', 1, 'net')).detail, '네트에 걸렸어요');
  assert.equal(pointCardFor(eventFor('nova'), { training: true }).training, true);
  assert.equal(pointCardFor({ type: 'finish' }), null);
});

test('card snapshots cannot change when the next rally updates events', () => {
  const event = eventFor('tempest'); const card = pointCardFor(event);
  event.score[0] = 7; event.scorer.id = 'atlas';
  assert.deepEqual(card.score, [3, 2]); assert.equal(card.actor.id, 'tempest');
});

test('a received serve followed by an opponent error is not announced as an ace', () => {
  const event = eventFor('nova', 0, 'ground', 'serve');
  assert.equal(pointCardFor({ ...event, rally: 0 }).detail, '서비스 에이스');
  assert.equal(pointCardFor({ ...event, rally: 2 }).detail, '우리 팀 득점');
});

test('card clock fits inside point phase, pauses, and completes at its exact boundary', () => {
  const clock = new PointCardTimeline(); clock.show(eventFor('nova'));
  assert.ok(POINT_CARD_DURATION < 1.65); assert.equal(clock.stage, 'enter');
  clock.advance(.3); assert.equal(clock.stage, 'hold');
  const remaining = clock.remaining; clock.advance(20, { paused: true });
  assert.equal(clock.remaining, remaining);
  clock.advance(1); assert.equal(clock.stage, 'exit');
  clock.advance(clock.remaining); assert.equal(clock.active, false); assert.equal(clock.remaining, 0);
});

test('home/restart clears cards and a later point receives its full duration', () => {
  const clock = new PointCardTimeline(); clock.show(eventFor('nova')); clock.advance(.8); clock.clear();
  assert.equal(clock.stage, 'idle'); clock.advance(4); assert.equal(clock.active, false);
  clock.show(eventFor('onyx', 1)); assert.equal(clock.remaining, POINT_CARD_DURATION);
  clock.advance(NaN); clock.advance(-1); assert.equal(clock.remaining, POINT_CARD_DURATION);
});

test('original card artwork preserves full-body aspect ratio in both outcomes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../src/sprites.json', import.meta.url), 'utf8'));
  const calls = [], canvas = { width: 360, height: 420, getContext: () => ({ clearRect() {}, drawImage(...args) { calls.push(args); } }) };
  const images = Object.fromEntries(ROSTER.map(({ id }) => [id, { naturalWidth: manifest[id].renderWidth }]));
  for (const { id } of ROSTER) for (const team of [0, 1]) {
    const card = pointCardFor(eventFor(id, team));
    assert.equal(drawPointCardArt(canvas, card, images, manifest), true);
    const [, , , sw, sh, dx, dy, dw, dh] = calls.at(-1);
    assert.ok(Math.abs(dw / sw - dh / sh) < 1e-9, id);
    assert.ok(dx >= 0 && dy >= 0 && dx + dw <= canvas.width && dy + dh <= canvas.height);
  }
  assert.equal(drawPointCardArt(canvas, pointCardFor(eventFor('nova')), {}, manifest), false);
});
