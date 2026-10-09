import test from 'node:test';
import assert from 'node:assert/strict';
import { SpriteAnimator, SPRITE_HEIGHT, SPRITE_TIMING, SPRITE_CONTACT_PHASE, sampleSpriteFrames } from '../src/sprite-animation.js';
import { projectCourtPoint } from '../src/render.js';

const facings = ['down', 'up', 'left', 'right'];
const artClips = ['run', 'toss', 'spike', 'block'];
const character = { clips: Object.fromEntries(artClips.map((clip, clipIndex) => [clip, { views: Object.fromEntries(facings.map((facing, direction) => [facing, Array.from({ length: 6 }, (_, index) => ({ rect: [index * 90, direction * 130 + clipIndex * 700, 70 + index, 120 + index], pivot: [35 + index / 2, 118 + index], bodyHeight: 112 + index, fixtureFacing: facing, fixtureClip: clip, fixtureIndex: index }))])) }])) };
const images = Object.fromEntries(artClips.map(clip => [clip, { naturalWidth: 1024, clip }]));
const actor = changes => ({ id: 'nova', index: 0, team: 0, x: 500, y: 790, z: 0, moving: 0, facing: 'up', action: 'idle', actionAt: 0, contactKind: null, contactAt: -10, landAt: -10, ...changes });
const state = changes => ({ time: 0, phase: 'rally', ...changes });
function canvas() {
  const calls = [], stack = [];
  return { calls, globalAlpha: 1, save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); }, drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) { calls.push({ image, sx, sy, sw, sh, dx, dy, dw, dh, alpha: this.globalAlpha }); } };
}
const project = (x, y, z) => projectCourtPoint(x, y, z, 960, 1440);

test('seven gameplay clips use finite durations and six complete authored frames', () => {
  assert.deepEqual(Object.keys(SPRITE_TIMING).sort(), ['block', 'idle', 'land', 'run', 'serve', 'spike', 'toss']);
  assert.equal(SPRITE_HEIGHT, 298);
  for (const duration of Object.values(SPRITE_TIMING)) assert.ok(duration > 0 && Number.isFinite(duration));
  for (const clip of artClips) for (const facing of facings) {
    const seen = new Set();
    for (let frame = 0; frame < 60; frame++) {
      const sampled = sampleSpriteFrames(character, { clip, facing, phase: frame / 60 });
      assert.ok(sampled.layers.length >= 1 && sampled.layers.length <= 2);
      assert.ok(Math.abs(sampled.layers.reduce((sum, layer) => sum + layer.weight, 0) - 1) < 1e-12);
      for (const layer of sampled.layers) { seen.add(layer.frameIndex); assert.equal(layer.frame.fixtureFacing, facing); assert.equal(layer.frame.fixtureClip, clip); }
    }
    assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5], `${clip}/${facing}: all six drawings are played`);
  }
});

test('run phase advances only through actual travel and remains still when time passes', () => {
  const animator = new SpriteAnimator({ transition: 0, stride: 180 }), player = actor({ moving: 1 });
  animator.pose(player, state()); player.x += 45;
  const moved = animator.pose(player, state({ time: .2 }));
  assert.equal(moved.runPhase, .25);
  const stationary = animator.pose(player, state({ time: 20 }));
  assert.equal(stationary.runPhase, moved.runPhase);
  assert.deepEqual(sampleSpriteFrames(character, stationary), sampleSpriteFrames(character, moved));
});

test('a run cut finishes its 25 ms fade at a stationary court boundary without advancing movement phase', () => {
  const animator = new SpriteAnimator({ transition: 0 }), player = actor({ moving: 1 }), ctx = canvas();
  animator.draw(ctx, player, state(), { images, character, project });
  player.x += 31;
  animator.draw(ctx, player, state({ time: .1 }), { images, character, project });
  const stoppedPhase = animator.pose(player, state({ time: .1 })).runPhase;
  ctx.calls.length = 0;
  const midFade = animator.draw(ctx, player, state({ time: .11 }), { images, character, project });
  assert.equal(midFade.frameIndex, 1); assert.equal(midFade.drawCount, 2);
  for (const time of [.126, .3, 1]) {
    ctx.calls.length = 0;
    const finished = animator.draw(ctx, player, state({ time }), { images, character, project });
    assert.equal(finished.frameIndex, 1); assert.equal(finished.drawCount, 1); assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].sx, character.clips.run.views.up[1].rect[0]); assert.equal(ctx.calls[0].alpha, 1);
    assert.equal(animator.pose(player, state({ time })).runPhase, stoppedPhase);
    assert.equal(player.x, 531); assert.equal(player.y, 790);
  }
});

test('run cut fades have the same duration after slow and fast travel while standalone samples stay deterministic', () => {
  const observations = [];
  for (const arrivalTime of [.05, 1]) {
    const animator = new SpriteAnimator({ transition: 0 }), player = actor({ moving: 1 }), ctx = canvas();
    animator.draw(ctx, player, state(), { images, character, project }); player.x += 31;
    animator.draw(ctx, player, state({ time: arrivalTime }), { images, character, project });
    const sequence = [];
    for (const age of [.01, .026]) {
      ctx.calls.length = 0;
      const result = animator.draw(ctx, player, state({ time: arrivalTime + age }), { images, character, project });
      sequence.push({ frameIndex: result.frameIndex, count: result.drawCount, weights: ctx.calls.map(call => Math.round(call.alpha * 1e9) / 1e9) });
    }
    observations.push(sequence);
  }
  assert.deepEqual(observations[0], observations[1]);
  assert.equal(observations[0][0].count, 2); assert.equal(observations[0][1].count, 1);
  const pose = { clip: 'run', phase: 31 / 180, facing: 'up' };
  assert.deepEqual(sampleSpriteFrames(character, pose), sampleSpriteFrames(character, pose));
  assert.equal(sampleSpriteFrames(character, pose).layers.length, 2, 'standalone phase samples do not require an animator clock');
});

test('a teleport and a new match never consume stale movement phase or contact', () => {
  const animator = new SpriteAnimator({ transition: 0 }), player = actor({ moving: 1 });
  animator.pose(player, state()); player.x += 45; animator.pose(player, state({ time: .2 }));
  player.x += 300; assert.equal(animator.pose(player, state({ time: .3 })).runPhase, .25);
  assert.equal(animator.pose(player, state({ time: 0 })).runPhase, 0);
  animator.hit({ type: 'hit', actor: 0, kind: 'spike' }, .4);
  animator.clear(); assert.equal(animator.actors.size, 0); assert.equal(animator.contacts.size, 0);
});

test('four movement directions select their own complete drawings without changing actor position', () => {
  const animator = new SpriteAnimator({ transition: 0 }), player = actor({ moving: 1 });
  for (const facing of facings) {
    player.facing = facing;
    const before = { x: player.x, y: player.y, z: player.z }, pose = animator.pose(player, state());
    assert.equal(pose.facing, facing);
    assert.ok(sampleSpriteFrames(character, pose).layers.every(layer => layer.frame.fixtureFacing === facing));
    assert.deepEqual({ x: player.x, y: player.y, z: player.z }, before);
  }
});

test('automatic toss, spike and block jumps hold preparation until a real hit', () => {
  for (const [jumpKind, clip] of [['toss', 'toss'], ['attack', 'spike'], ['block', 'block']]) {
    const animator = new SpriteAnimator({ transition: 0 }), player = actor({ z: 160, jumpKind });
    const pose = animator.pose(player, state({ time: .8 }));
    assert.equal(pose.clip, clip); assert.ok(pose.phase < SPRITE_CONTACT_PHASE[clip]);
    assert.ok(sampleSpriteFrames(character, pose, { reducedMotion: true }).frameIndex < 3);
  }
});

test('a real contact immediately displays authored cut three without fading an old idle pose', () => {
  for (const [kind, clip] of [['receive', 'toss'], ['set', 'toss'], ['spike', 'spike'], ['block', 'block'], ['serve', 'serve']]) for (const facing of facings) {
    const animator = new SpriteAnimator(), player = actor({ facing }), ctx = canvas();
    animator.draw(ctx, player, state(), { images, character, project }); ctx.calls.length = 0;
    player.contactKind = kind; player.contactAt = .02;
    animator.hit({ type: 'hit', actor: 0, kind }, .02);
    const result = animator.draw(ctx, player, state({ time: .02 }), { images, character, project });
    assert.equal(result.clip, clip); assert.equal(result.phase, SPRITE_CONTACT_PHASE[clip]);
    assert.equal(result.frameIndex, 3); assert.equal(result.drawCount, 1); assert.equal(ctx.calls.length, 1);
    assert.equal(ctx.calls[0].sx, character.clips[clip === 'serve' ? 'spike' : clip].views[facing][3].rect[0]);
    assert.equal(ctx.calls[0].alpha, 1);
  }
});

test('engine hit events override older animation metadata for the contacted actor only', () => {
  const animator = new SpriteAnimator({ transition: 0 });
  animator.hit({ type: 'hit', actor: 0, kind: 'block' }, 1);
  assert.equal(animator.pose(actor(), state({ time: 1 })).clip, 'block');
  assert.equal(animator.pose(actor({ index: 1 }), state({ time: 1 })).clip, 'idle');
});

test('serve preparation belongs to the actual server and continues into its contact cut', () => {
  for (const serving of [0, 1]) {
    const animator = new SpriteAnimator(), serverIndex = serving === 0 ? 0 : 2;
    const player = actor({ index: serverIndex, actionAt: 1 });
    const preparing = animator.pose(player, state({ phase: 'serve', time: 1.8, serving }));
    assert.equal(preparing.clip, 'serve'); assert.ok(preparing.phase < SPRITE_CONTACT_PHASE.serve);
    assert.equal(animator.pose(actor({ index: serverIndex + 1 }), state({ phase: 'serve', time: 1.8, serving })).clip, 'idle');
    player.contactKind = 'serve'; player.contactAt = 1.85;
    const contact = animator.pose(player, state({ time: 1.85 }));
    assert.equal(contact.clip, 'serve'); assert.equal(sampleSpriteFrames(character, contact).frameIndex, 3);
  }
});

test('landing uses the final recovery drawing of the preceding action', () => {
  const animator = new SpriteAnimator({ transition: 0 }), player = actor({ contactKind: 'set', contactAt: 1 });
  animator.pose(player, state({ time: 1 }));
  player.action = 'land'; player.landAt = 1.2;
  const landed = animator.pose(player, state({ time: 1.21 })), frame = sampleSpriteFrames(character, landed);
  assert.equal(landed.clip, 'land'); assert.equal(frame.artClip, 'toss'); assert.equal(frame.frameIndex, 5); assert.equal(frame.layers.length, 1);
});

test('a connected airborne action keeps its final recovery drawing until landing and resets on the next jump', () => {
  for (const [jumpKind, kind, clip] of [['attack', 'spike', 'spike'], ['toss', 'set', 'toss'], ['block', 'block', 'block']]) {
    const animator = new SpriteAnimator({ transition: 0 });
    const player = actor({ z: 380, jumpKind, action: kind, actionAt: 1, contactKind: kind, contactAt: 1 });
    const recoveryDuration = SPRITE_TIMING[clip] * (1 - SPRITE_CONTACT_PHASE[clip]);
    animator.pose(player, state({ time: 1 }));
    const lastRecovery = animator.pose(player, state({ time: 1 + recoveryDuration - .001 }));
    assert.equal(sampleSpriteFrames(character, lastRecovery, { reducedMotion: true }).frameIndex, 5);
    for (const time of [1 + recoveryDuration + .01, 1.7, 1.9]) {
      const airborne = animator.pose(player, state({ time }));
      assert.equal(airborne.clip, clip); assert.equal(airborne.phase, 1);
      assert.equal(sampleSpriteFrames(character, airborne, { reducedMotion: true }).frameIndex, 5, `${clip}: no return to preparation after contact`);
    }
    Object.assign(player, { z: 0, jumpKind: null, action: 'land', actionAt: 2, landAt: 2 });
    assert.equal(sampleSpriteFrames(character, animator.pose(player, state({ time: 2.01 }))).frameIndex, 5);
    Object.assign(player, { z: 150, jumpKind, action: `${jumpKind}-jump`, actionAt: 2.5 });
    const nextJump = animator.pose(player, state({ time: 2.7 }));
    assert.equal(nextJump.clip, clip); assert.ok(nextJump.phase < SPRITE_CONTACT_PHASE[clip]);
    assert.ok(sampleSpriteFrames(character, nextJump, { reducedMotion: true }).frameIndex < 3, `${clip}: a new jump prepares for its own contact`);
    assert.equal(player.contactAt, 1); assert.equal(player.x, 500); assert.equal(player.y, 790);
  }
});

test('cut fades and action changes draw at most two whole bodies and preserve source aspect ratios', () => {
  for (const facing of facings) for (const clip of Object.keys(SPRITE_TIMING)) for (let frame = 0; frame < 60; frame++) {
    const animator = new SpriteAnimator(), player = actor({ facing }), ctx = canvas();
    animator.pose = () => ({ clip, phase: frame / 60, facing, recoveryClip: 'spike', previous: frame % 2 ? { clip: 'run', phase: .4, facing: 'down' } : null, transitionWeight: frame % 2 ? .4 : 1 });
    const result = animator.draw(ctx, player, state({ time: 1 }), { images, character, project });
    assert.ok(result.drawCount >= 1 && result.drawCount <= 2, `${clip}/${facing}/${frame}`);
    assert.equal(ctx.calls.length, result.drawCount);
    for (const call of ctx.calls) assert.ok(Math.abs(call.dw / call.sw - call.dh / call.sh) < 1e-12, `${clip}/${facing}/${frame}: whole-body uniform scale`);
  }
});

test('foot pivots stay on the calibrated court through every cropped source frame', () => {
  const animator = new SpriteAnimator(), player = actor({ z: 75 }), base = project(player.x, player.y, player.z), ctx = canvas();
  for (const facing of facings) for (const clip of artClips) for (let frame = 0; frame < 6; frame++) {
    animator.pose = () => ({ clip, phase: clip === 'run' ? (frame + .5) / 6 : [0, .1, .25, SPRITE_CONTACT_PHASE[clip], .8, .99][frame], facing, transitionWeight: 1 });
    ctx.calls.length = 0; animator.draw(ctx, player, state(), { images, character, project, reducedMotion: true });
    for (const call of ctx.calls) {
      const source = character.clips[call.image.clip].views[facing].find(item => item.rect[0] === call.sx), scale = call.dw / call.sw;
      assert.ok(Math.abs(call.dx + source.pivot[0] * scale - base.x) < 1e-10);
      assert.ok(Math.abs(call.dy + source.pivot[1] * scale - base.y) < 1e-10);
    }
  }
});

test('reduced motion removes idle breathing and fading while keeping the contact drawing', () => {
  const animator = new SpriteAnimator(), player = actor(), ctx = canvas();
  animator.draw(ctx, player, state({ time: .2 }), { images, character, project, reducedMotion: true });
  const first = { ...ctx.calls[0] }; ctx.calls.length = 0;
  animator.draw(ctx, player, state({ time: .7 }), { images, character, project, reducedMotion: true });
  assert.deepEqual(ctx.calls[0], first);
  player.contactAt = 1; player.contactKind = 'block';
  assert.equal(animator.draw(ctx, player, state({ time: 1 }), { images, character, project, reducedMotion: true }).frameIndex, 3);
});

test('drawing restores the parent canvas alpha and skips unavailable image assets safely', () => {
  const animator = new SpriteAnimator(), player = actor(), ctx = canvas(); ctx.globalAlpha = .6;
  animator.draw(ctx, player, state(), { images, character, project });
  assert.equal(ctx.globalAlpha, .6);
  assert.equal(ctx.calls[0].alpha, .6);
  const missing = animator.draw(ctx, player, state(), { images: {}, character, project });
  assert.equal(missing.drawCount, 0); assert.equal(ctx.globalAlpha, .6);
});
