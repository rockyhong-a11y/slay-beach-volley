import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createMatch, step, requestBlock, releaseSpike, beginCharge, predictLanding, drainEvents, playerCue, WORLD } from '../src/engine.js';
import { ROSTER } from '../src/roster.js';

const frame = 1 / 120;
function rallyState() {
  const state = createMatch({ seed: 42 });
  state.phase = 'rally'; state.handler = 0; state.possession = 0; state.lastActor = 1; state.touches = 2;
  Object.assign(state.actors[0], { x: 400, y: 790, z: 135, vz: 0 });
  Object.assign(state.ball, { x: 400, y: 790, z: 340, vx: 0, vy: 0, vz: -100 });
  return state;
}
function run(state, limit = 360, active = false) {
  const events = [];
  for (let i = 0; i < limit * 120 && state.phase !== 'finished'; i++) {
    if (active && state.phase === 'rally' && state.possession === 0 && state.touches >= 1 && state.handler === 0) {
      const player = state.actors[0];
      if (playerCue(state) === 'approach' && !state.charging) beginCharge(state);
      if (playerCue(state) === 'spike' && Math.abs(state.ball.z - player.z - 205) < 75 && state.ball.vz < 0) releaseSpike(state);
    }
    step(state, frame); events.push(...drainEvents(state));
    assert.ok(Number.isFinite(state.ball.x) && Number.isFinite(state.ball.y) && Number.isFinite(state.ball.z));
    for (const actor of state.actors) assert.ok(actor.x >= 70 && actor.x <= 930 && actor.y >= 75 && actor.y <= 1125 && actor.z >= 0);
  }
  return events;
}

test('all ten original identities and source sprite rectangles are shipped', async () => {
  assert.equal(ROSTER.length, 10); assert.equal(new Set(ROSTER.map(character => character.id)).size, 10);
  const manifest = JSON.parse(await readFile(new URL('../src/sprites.json', import.meta.url), 'utf8'));
  for (const character of ROSTER) {
    const sprite = manifest[character.id];
    assert.equal(sprite.frames.length, 3); assert.equal(sprite.width, 1774); assert.equal(sprite.height, 887);
    for (const rect of sprite.frames) assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= sprite.width && rect.y + rect.height <= sprite.height);
    const bytes = await readFile(new URL(`../assets/sprites/${character.id}.webp`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sprite.webpSha256);
  }
});
test('a known falling ball predicts the court landing correctly', () => {
  const landing = predictLanding({ x: 100, y: 200, z: 313.6, vx: 200, vy: 500, vz: 0 });
  assert.ok(Math.abs(landing.time - .8) < 1e-10); assert.ok(Math.abs(landing.x - 260) < 1e-10); assert.ok(Math.abs(landing.y - 600) < 1e-10);
});
test('a high pass predicts its descending target even when it starts below that height', () => {
  const pass = { x: 100, y: 800, z: 160, vx: 100, vy: -80, vz: (300 - 160 + .5 * WORLD.gravity * 1.65 ** 2) / 1.65 };
  assert.ok(Math.abs(predictLanding(pass, 300).time - 1.65) < 1e-10);
});
test('an airborne, well timed manual spike gets a perfect and hit stop', () => {
  const state = rallyState(); state.charge = .6; releaseSpike(state); step(state, frame);
  const hit = drainEvents(state).find(event => event.type === 'hit' && event.manual);
  assert.equal(hit.kind, 'spike'); assert.equal(hit.perfect, true); assert.equal(state.stats.spikes, 1); assert.equal(state.stats.perfects, 1); assert.ok(state.freeze > 0); assert.equal(state.possession, 1);
});
test('a missed assisted receive can be rescued by a manual swing', () => {
  const state = rallyState(); state.actors[0].miss = true; releaseSpike(state); step(state, frame);
  assert.equal(state.stats.spikes, 1);
});
test('a grounded swing is a safe return rather than a counted spike', () => {
  const state = rallyState(); state.actors[0].z = 0; state.ball.z = 145; releaseSpike(state); step(state, frame);
  assert.equal(state.stats.spikes, 0); assert.equal(drainEvents(state).find(event => event.manual)?.kind, 'return');
});
test('the dedicated block input can stop an incoming attack without spike input', () => {
  const state = rallyState(); state.actors[0].y = 690; state.ball.y = 675; state.lastActor = 2; state.touches = 0;
  requestBlock(state); step(state, frame);
  assert.equal(state.stats.blocks, 1); assert.equal(state.stats.spikes, 0); assert.equal(drainEvents(state).find(event => event.manual)?.kind, 'block');
});
test('a low ball crossing the net awards the point to the other team once', () => {
  const state = rallyState(); state.lastActor = 2; Object.assign(state.ball, { x: 500, y: 595, z: 100, vy: 1800 });
  step(state, frame); assert.deepEqual(state.score, [1, 0]); assert.equal(state.lastPoint.reason, 'net');
  for (let i = 0; i < 30; i++) step(state, frame);
  assert.deepEqual(state.score, [1, 0]);
});
test('an out ball is charged to its last hitter, regardless of the landing half', () => {
  const state = rallyState(); state.lastActor = 2; Object.assign(state.ball, { x: 1100, y: 950, z: 1, vy: 0, vz: -200 });
  step(state, frame); assert.deepEqual(state.score, [1, 0]); assert.equal(state.lastPoint.reason, 'out');
});
test('a player cannot touch the ball twice in a row', () => {
  const state = rallyState(); state.lastActor = 0; state.touches = 1; releaseSpike(state); step(state, frame);
  assert.equal(drainEvents(state).filter(event => event.type === 'hit').length, 0); assert.equal(state.touches, 1);
});
test('turning off assistance leaves the player under manual control', () => {
  const state = rallyState(); state.assist = false; const x = state.actors[0].x;
  state.handler = 2; state.possession = 1; step(state, frame); assert.equal(state.actors[0].x, x);
  step(state, frame, { x: 1, y: 0 }); assert.ok(state.actors[0].x > x);
});
test('seeded quick matches finish with a valid 7-point winner at every difficulty', () => {
  for (const difficulty of [0, 1, 2]) {
    const state = createMatch({ difficulty, seed: 42 }); run(state);
    assert.equal(state.phase, 'finished'); assert.equal(Math.max(...state.score), 7); assert.equal(state.winner, state.score[0] === 7 ? 0 : 1);
  }
});
test('all ten characters can jump and score manual spikes in 60-second practice', () => {
  for (const character of ROSTER) {
    const state = createMatch({ character: character.id, partner: character.id === 'seraph' ? 'nova' : 'seraph', training: true, seed: 42 });
    run(state, 61, true); assert.equal(state.phase, 'finished', character.id); assert.equal(state.remaining, 0); assert.ok(state.stats.spikes > 0, `${character.id} needs a real spike opportunity`); assert.ok(state.stats.longestRally > 0, `${character.id} needs a recorded practice rally`);
  }
});
test('active spike timing makes perfect contacts and a match can be replayed independently', () => {
  const state = createMatch({ seed: 42 }); run(state, 360, true);
  assert.equal(state.phase, 'finished'); assert.ok(state.stats.perfects > 0);
  const replay = createMatch({ seed: 42 }); assert.deepEqual(replay.score, [0, 0]); assert.equal(replay.stats.spikes, 0); assert.equal(replay.phase, 'ready');
});
test('charging is bounded and cannot be started after a match finishes', () => {
  const state = rallyState(); beginCharge(state); state.ball.z = 1500; state.ball.vz = 0; state.ball.vx = state.ball.vy = 0;
  for (let i = 0; i < 90; i++) step(state, frame);
  assert.ok(state.charge <= 1 && state.charge >= 0); state.phase = 'finished'; state.charging = false; beginCharge(state); assert.equal(state.charging, false);
});

test('approaching an incoming ball automatically jumps and tosses without movement assistance', () => {
  const state = rallyState(); state.assist = false; state.touches = 0; state.lastActor = 2;
  Object.assign(state.actors[0], { z: 0, vz: 0 });
  Object.assign(state.ball, { x: 570, z: 280, vz: -180 });
  const events = run(state, .5);
  assert.ok(events.some(event => event.type === 'jump' && event.actor === 0), 'the toss needs its automatic jump');
  assert.ok(events.some(event => event.type === 'hit' && event.actor === 0 && event.kind === 'receive'), 'a nearby ball must be tossed automatically');
  assert.equal(state.stats.spikes, 0);
  assert.ok(predictLanding(state.ball, 130).time > 1.3, 'the toss must leave time to reposition');
});

test('an attack set automatically jumps but never attacks without the player pressing spike', () => {
  const state = rallyState(); state.assist = false;
  Object.assign(state.actors[0], { z: 0, vz: 0 });
  Object.assign(state.ball, { z: 560, vz: -180 });
  const firstEvents = run(state, .2);
  assert.ok(firstEvents.some(event => event.type === 'jump' && event.actor === 0), 'attack jumping is automatic');
  const events = [...firstEvents, ...run(state, 1.2)];
  assert.equal(events.filter(event => event.type === 'hit' && event.actor === 0).length, 0, 'the third touch must not be returned automatically');
  assert.equal(state.stats.spikes, 0);
});

test('an early spike press is buffered through the automatic attack jump', () => {
  const state = rallyState(); state.assist = false;
  Object.assign(state.actors[0], { z: 0, vz: 0 });
  Object.assign(state.ball, { z: 540, vz: -120 });
  releaseSpike(state); const events = run(state, .7);
  assert.ok(events.some(event => event.type === 'hit' && event.kind === 'spike' && event.manual));
  assert.equal(state.stats.spikes, 1);
});

test('every original character gets at least half a second to choose a manual spike', () => {
  for (const character of ROSTER) {
    const state = rallyState(); state.assist = false; state.actors[0].id = character.id;
    Object.assign(state.actors[0], { z: 0, vz: 0 });
    Object.assign(state.ball, { z: 620, vz: -180, gravity: 620 });
    let readyFrames = 0;
    for (let i = 0; i < 240; i++) { step(state, frame); if (playerCue(state) === 'spike') readyFrames++; drainEvents(state); }
    assert.ok(readyFrames * frame >= .5, `${character.id} needs time to choose an attack`);
    assert.equal(state.stats.spikes, 0, 'jumping and waiting must not attack automatically');
  }
});

test('the block button jumps from the ground and blocks independently of spike', () => {
  const state = rallyState(); state.assist = false; state.touches = 0; state.lastActor = 2;
  Object.assign(state.actors[0], { y: 690, z: 0, vz: 0 });
  Object.assign(state.ball, { y: 640, z: 365, vz: -100, vy: 140 });
  requestBlock(state); const events = run(state, .6);
  assert.ok(events.some(event => event.type === 'jump' && event.kind === 'block' && event.actor === 0));
  assert.ok(events.some(event => event.type === 'hit' && event.kind === 'block' && event.manual));
  assert.equal(state.stats.blocks, 1); assert.equal(state.stats.spikes, 0);
});

test('spike input at the net does not implicitly perform a block', () => {
  const state = rallyState(); state.actors[0].y = 690; state.ball.y = 675; state.lastActor = 2; state.touches = 0;
  releaseSpike(state); step(state, frame);
  assert.equal(state.stats.blocks, 0); assert.equal(state.stats.spikes, 1);
  assert.equal(drainEvents(state).find(event => event.manual)?.kind, 'spike');
});

test('a teammate toss does not cancel an attack the player is holding', () => {
  const state = rallyState(); state.handler = 1; state.touches = 1; state.lastActor = 0;
  Object.assign(state.ball, { x: state.actors[1].x, y: state.actors[1].y, z: 150, vz: -100 });
  beginCharge(state); const events = run(state, .1);
  assert.ok(events.some(event => event.type === 'hit' && event.actor === 1));
  assert.equal(state.charging, true); assert.ok(state.charge > 0);
});

test('intercepting the partner lane gives the actual receiver the next attack', () => {
  const state = rallyState(); state.assist = false; state.touches = 0; state.lastActor = 2; state.handler = state.receiver = 1;
  Object.assign(state.actors[0], { z: 0, vz: 0 });
  Object.assign(state.ball, { z: 280, vz: -180 });
  const events = run(state, .4);
  assert.equal(events.find(event => event.type === 'hit')?.actor, 0, 'the player intercepted the incoming ball');
  assert.equal(state.receiver, 0, 'the actual receiver owns the third touch');
  Object.assign(state.ball, { x: state.actors[1].x, y: state.actors[1].y, z: 150, vz: -100, vx: 0, vy: 0 });
  run(state, .05); assert.equal(state.handler, 0); assert.equal(state.lastActor, 1); assert.equal(playerCue(state), 'approach');
});
