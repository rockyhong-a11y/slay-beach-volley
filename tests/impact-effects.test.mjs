import test from 'node:test';
import assert from 'node:assert/strict';
import { ImpactEffects, IMPACT_LIMITS } from '../src/impact-effects.js';

const hit = (kind, extra = {}) => ({ type: 'hit', kind, x: 430, y: 810, z: 240, actor: 0, vx: 150, vy: -580, vz: 200, ...extra });
const project = (x, y, z = 0) => ({ x: x * .36, y: y * .4 - z * .2, scale: 1 });
function context() {
  const operations = [];
  const values = { globalAlpha: 1 };
  return new Proxy(values, {
    get(target, key) {
      if (key === 'operations') return operations;
      if (key in target) return target[key];
      return (...args) => {
        assert.ok(args.filter(value => typeof value === 'number').every(Number.isFinite), `${String(key)} uses finite coordinates`);
        operations.push({ key, args });
      };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
}

test('volleyball contacts have distinct lift, set, strike, and shield silhouettes', () => {
  const effects = new ImpactEffects();
  for (const kind of ['receive', 'set', 'spike', 'block']) effects.burst(hit(kind));
  assert.equal(new Set(effects.bursts.map(effect => effect.family)).size, 4);
  const counts = effects.bursts.map(effect => effect.particles.length);
  assert.ok(counts[2] > counts[0], 'a spike carries more energy than a toss');
  effects.burst(hit('spike', { perfect: true }));
  assert.ok(effects.bursts.at(-1).particles.length > counts[2]);
  for (const effect of effects.bursts) assert.ok(effect.life <= IMPACT_LIMITS.maximumLife);
});

test('effects expire within a short real-time window and remain resource bounded under repeated contacts', () => {
  const effects = new ImpactEffects(), ctx = context();
  for (let i = 0; i < 100; i++) effects.burst(hit(i % 2 ? 'spike' : 'block', { perfect: true }));
  assert.ok(effects.bursts.length <= IMPACT_LIMITS.bursts);
  assert.ok(effects.particleCount <= IMPACT_LIMITS.particles);
  effects.draw(ctx, .56, { project, width: 360, height: 580 });
  assert.equal(effects.bursts.length, 0);
  assert.equal(effects.particleCount, 0);
  effects.burst(hit('set')); effects.clear();
  assert.equal(effects.bursts.length, 0);
});

test('reduced motion keeps readable contact shapes with fewer particles and no ball trails', () => {
  const normal = new ImpactEffects(), reduced = new ImpactEffects({ reducedMotion: true });
  for (const kind of ['receive', 'set', 'spike', 'block']) { normal.burst(hit(kind)); reduced.burst(hit(kind)); }
  assert.ok(reduced.particleCount < normal.particleCount / 3);
  assert.equal(new Set(reduced.bursts.map(effect => effect.family)).size, 4);
  const ctx = context();
  reduced.drawTrail(ctx, [hit('spike'), hit('spike', { x: 510 })], { project });
  assert.equal(ctx.operations.length, 0);
  reduced.draw(ctx, .025, { project });
  assert.ok(ctx.operations.some(operation => operation.key === 'stroke'));
  reduced.draw(ctx, .24, { project });
  assert.equal(reduced.bursts.length, 0);
});

test('world-space impacts reproject after resize instead of staying at stale screen positions', () => {
  const effects = new ImpactEffects(), ctx = context();
  effects.burst(hit('spike'));
  effects.draw(ctx, .025, { project, width: 360, height: 580 });
  const first = ctx.operations.find(operation => operation.key === 'translate');
  ctx.operations.length = 0;
  effects.draw(ctx, 0, { project: (x, y, z) => { const p = project(x, y, z); return { ...p, x: p.x * 2, y: p.y * 2 }; }, width: 720, height: 1160 });
  const resized = ctx.operations.find(operation => operation.key === 'translate');
  assert.deepEqual(resized.args, first.args.map(value => value * 2));
  assert.deepEqual([effects.bursts[0].x, effects.bursts[0].y, effects.bursts[0].z], [430, 810, 240]);
});

test('spike strokes follow the outgoing ball direction with legacy events still drawable', () => {
  const effects = new ImpactEffects(), ctx = context();
  effects.burst(hit('spike', { vx: 600, vy: 0, vz: 0 }));
  effects.draw(ctx, .025, { project });
  assert.ok(ctx.operations.some(operation => operation.key === 'rotate' && Math.abs(operation.args[0]) < .00001));
  effects.clear(); ctx.operations.length = 0;
  effects.burst({ type: 'hit', kind: 'block', x: 430, y: 810 });
  effects.draw(ctx, .025, { project });
  assert.ok(ctx.operations.length > 0);
  assert.ok(!ctx.operations.some(operation => operation.key === 'fillRect'), 'no full-screen flash');
});

test('trail rendering stays capped and invalid or offscreen contacts do not allocate draw work', () => {
  const effects = new ImpactEffects(), ctx = context();
  const points = Array.from({ length: 300 }, (_, i) => ({ x: i, y: 500, z: 200, hot: 1 }));
  let projections = 0;
  effects.drawTrail(ctx, points, { project: (...args) => { projections++; return project(...args); } });
  assert.ok(projections <= (IMPACT_LIMITS.trailPoints - 1) * 2);
  assert.equal(effects.burst(hit('spike', { x: NaN })), false);
  assert.equal(effects.burst(hit('unknown')), false);
  ctx.operations.length = 0;
  effects.burst(hit('spike', { x: -100000 }));
  effects.draw(ctx, .02, { project });
  assert.equal(ctx.operations.length, 0);
});
