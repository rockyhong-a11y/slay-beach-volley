import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterAnimator, MOTION_CLIPS, CONTACT_PHASE, sampleMotion, solveTwoBone, localToWorld } from '../src/character-motion.js';
import { projectCourtPoint } from '../src/render.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const actor = changes => ({ id: 'nova', index: 0, team: 0, x: 500, y: 790, z: 0, moving: 0, facing: 'up', action: 'idle', actionAt: 0, contactKind: null, contactAt: -10, landAt: -10, ...changes });

test('seven clips have 60 distinct articulated samples rather than repeated sprite poses', () => {
  assert.equal(Object.keys(MOTION_CLIPS).length, 7);
  for (const [name, frames] of Object.entries(MOTION_CLIPS)) {
    assert.equal(frames.length, 60, name);
    const fingerprints = frames.map(frame => JSON.stringify(frame.joints));
    assert.equal(new Set(fingerprints).size, 60, name);
    for (const frame of frames) for (const suffix of ['L', 'R']) {
      assert.ok(Math.abs(distance(frame.joints[`shoulder${suffix}`], frame.joints[`elbow${suffix}`]) - 70) < 1e-7, name);
      assert.ok(Math.abs(distance(frame.joints[`elbow${suffix}`], frame.joints[`wrist${suffix}`]) - 80) < 1e-7, name);
      assert.ok(Math.abs(distance(frame.joints[`hip${suffix}`], frame.joints[`knee${suffix}`]) - 46) < 1e-7, name);
      assert.ok(Math.abs(distance(frame.joints[`knee${suffix}`], frame.joints[`ankle${suffix}`]) - 51) < 1e-7, name);
    }
  }
});

test('run phase advances with distance and remains still when time passes without movement', () => {
  const animator = new CharacterAnimator({ transition: 0, stride: 180 }), player = actor({ moving: 1 });
  animator.pose(player, { time: 0 });
  player.x += 45;
  const walked = animator.pose(player, { time: .2 });
  assert.equal(walked.runPhase, .25);
  const waiting = animator.pose(player, { time: 20 });
  assert.equal(waiting.runPhase, walked.runPhase);
  assert.deepEqual(waiting.joints, walked.joints);
});

test('up and down have opposite world directions; four facing frames preserve depth', () => {
  const player = actor(), forward = { x: 0, y: 30, z: 285 };
  assert.ok(Math.abs(localToWorld(forward, player, 'up').y - 785.2) < 1e-7);
  assert.ok(Math.abs(localToWorld(forward, player, 'down').y - 794.8) < 1e-7);
  assert.equal(localToWorld(forward, player, 'left').x, 470);
  assert.equal(localToWorld(forward, player, 'right').x, 530);
  assert.equal(localToWorld(forward, player, 'up').z, 285);
});

test('two-bone contact solver reaches natural targets and clamps distant ones without stretching', () => {
  const root = { x: 37, y: 0, z: 181 }, target = { x: 27, y: 5, z: 330 };
  const solved = solveTwoBone(root, target, 70, 80, { x: 100, y: -12, z: 190 });
  assert.equal(solved.reachable, true);
  assert.ok(distance(solved.end, target) < 1e-7);
  const distant = solveTwoBone(root, { x: 400, y: 0, z: 500 }, 70, 80);
  assert.equal(distant.reachable, false);
  assert.ok(distance(root, distant.end) < 150);
  assert.ok(Math.abs(distance(root, distant.joint) - 70) < 1e-7);
  assert.ok(Math.abs(distance(distant.joint, distant.end) - 80) < 1e-7);
});

test('actual hit timestamp drives contact pose and reachable hand position, never an automatic swing', () => {
  const animator = new CharacterAnimator({ transition: 0 }), player = actor({ z: 160, jumpKind: 'attack', action: 'attack-jump' });
  const preparing = animator.pose(player, { time: .8 });
  assert.ok(preparing.phase < CONTACT_PHASE.spike);
  player.contactKind = 'spike'; player.contactAt = 1;
  const target = localToWorld({ x: 23, y: 25, z: 330 }, player, 'up');
  animator.hit({ type: 'hit', actor: 0, kind: 'spike', ...target }, 1);
  const contact = animator.pose(player, { time: 1 });
  assert.equal(contact.phase, CONTACT_PHASE.spike);
  assert.ok(distance(localToWorld(contact.joints.wristR, player, 'up'), target) < 1e-7);
  animator.hit({ type: 'hit', actor: 0, kind: 'spike', x: 900, y: 790, z: 490 }, 1.1);
  const distant = animator.pose(player, { time: 1.1 });
  assert.ok(distance(distant.joints.shoulderR, distant.joints.wristR) <= 150);
  assert.ok(distance(localToWorld(distant.joints.wristR, player, 'up'), { x: 900, y: 790, z: 490 }) > 200);
});

test('reduced motion removes decorative breathing and hair while keeping volleyball articulation', () => {
  assert.deepEqual(sampleMotion('idle', .2, { reducedMotion: true }), sampleMotion('idle', .7, { reducedMotion: true }));
  const ready = sampleMotion('block', .1, { reducedMotion: true }), raised = sampleMotion('block', .48, { reducedMotion: true });
  assert.equal(raised.hair, 0);
  assert.ok(raised.joints.wristR.z - ready.joints.wristR.z > 80);
});

test('clip changes begin from the existing pose and transition continuously over 120ms', () => {
  const animator = new CharacterAnimator(), player = actor();
  const idle = animator.pose(player, { time: 0 });
  player.moving = 1; player.y -= 8;
  const first = animator.pose(player, { time: .02 });
  assert.ok(distance(first.joints.wristR, idle.joints.wristR) < 1e-7);
  player.y -= 20;
  const halfway = animator.pose(player, { time: .08 });
  player.y -= 20;
  const complete = animator.pose(player, { time: .15 });
  assert.ok(distance(halfway.joints.wristR, complete.joints.wristR) > 1);
  assert.ok(distance(complete.joints.wristR, idle.joints.wristR) > 1);
});

test('generated SD anatomy keeps the head, body and grounded legs close to equal thirds', () => {
  const { joints } = sampleMotion('idle', 0, { reducedMotion: true });
  assert.equal(joints.pelvis.z, 97);
  assert.equal(joints.neck.z, 191);
  assert.equal(joints.headTop.z, 285);
  assert.ok(Math.abs(joints.ankleL.z) < 1e-7);
  assert.equal(joints.headTop.z - joints.neck.z, 94);
});

test('hair crown stays above the neck when packed metadata identifies the real top as tip', () => {
  for (const hairLengthWorld of [110, 175, 190]) {
    const drawn = { translations: [], rotations: [], scales: [] };
    const ctx = {
      save() {}, restore() {},
      translate(x, y) { drawn.translations.push([x, y]); },
      rotate(angle) { drawn.rotations.push(angle); },
      scale(x, y) { drawn.scales.push([x, y]); },
      drawImage() {},
    };
    const pivotY = 200 * (95 / hairLengthWorld);
    const animator = new CharacterAnimator({ transition: 0 });
    const top = animator.draw(ctx, actor({ facing: 'down' }), { time: 0 }, {
      image: {}, reducedMotion: true, project: (x, y, z) => ({ x, y: -z, scale: 1 }),
      view: { hairLengthWorld, parts: { hair: { rect: [0, 0, 100, 200], pivot: [50, pivotY], tip: [50, 0] } } },
    });
    assert.ok(Math.abs(drawn.rotations[0]) < 1e-7, 'hair must not rotate 180 degrees');
    const drawnCrown = drawn.translations[0][1] - pivotY * drawn.scales[0][1];
    assert.ok(Math.abs(drawnCrown - top.y) < 1e-7, 'crown aligns with the anatomical head top');
  }
});

test('relaxed idle and counter-swing run keep both elbows below the shoulders throughout a cycle', () => {
  for (const clip of ['idle', 'run']) for (let frame = 0; frame < 360; frame++) {
    const { joints } = sampleMotion(clip, frame / 360);
    for (const side of ['L', 'R']) {
      assert.ok(joints[`elbow${side}`].z < joints[`shoulder${side}`].z - 8, `${clip} ${frame} ${side}`);
      assert.ok(joints[`wrist${side}`].z < joints[`shoulder${side}`].z - 50, `${clip} ${frame} ${side}`);
    }
  }
  assert.ok(Math.abs(sampleMotion('spike', CONTACT_PHASE.spike).joints.wristR.z - 330) < 1);
  assert.ok(Math.abs(sampleMotion('toss', CONTACT_PHASE.toss).joints.wristR.z - 295) < 1);
});

test('side profiles use shallow lateral depth while keeping exact inverse IK at contact', () => {
  for (const facing of ['left', 'right']) {
    const player = actor({ facing, z: 180, contactKind: 'spike', contactAt: 1 });
    const local = { x: 23, y: 25, z: 330 }, target = localToWorld(local, player, facing);
    assert.ok(Math.abs(target.y - player.y) < 4);
    assert.equal(Math.abs(target.x - player.x), 25);
    const animator = new CharacterAnimator({ transition: 0 });
    animator.hit({ type: 'hit', actor: 0, kind: 'spike', ...target }, 1);
    const contact = animator.pose(player, { time: 1, phase: 'rally' });
    assert.ok(distance(localToWorld(contact.joints.wristR, player, facing), target) < 1e-7);
  }
});

test('relaxed elbow poles keep an athletic narrow stance without altering overhead reach', () => {
  for (const clip of ['idle', 'run']) for (let frame = 0; frame < 360; frame++) {
    const { joints } = sampleMotion(clip, frame / 360);
    // The run counter-swing opens one elbow briefly; both stay narrower than
    // the former outward pole, whose elbow x approached 100 world units.
    const limit = clip === 'idle' ? 68 : 85;
    for (const side of ['L', 'R']) assert.ok(Math.abs(joints[`elbow${side}`].x) < limit, `${clip} ${frame} ${side}`);
  }
  const { joints } = sampleMotion('block', CONTACT_PHASE.block);
  assert.ok(joints.wristL.z > 329);
  assert.ok(joints.wristR.z > 329);
  for (const side of ['L', 'R']) assert.ok(Math.abs(distance(joints[`shoulder${side}`], joints[`elbow${side}`]) - 70) < 1e-7);
});

test('server prepares before the actual hit and continues the same clip directly into contact', () => {
  for (const serving of [0, 1]) {
    const animator = new CharacterAnimator(), serverIndex = serving === 0 ? 0 : 2;
    const player = actor({ index: serverIndex, actionAt: 1 }), state = { phase: 'serve', time: 1, serving };
    const initial = animator.pose(player, state);
    assert.equal(initial.clip, 'serve');
    state.time = 1.8;
    const prepared = animator.pose(player, state);
    assert.equal(prepared.phase, CONTACT_PHASE.serve - .05);
    const changedAt = animator.actors.get(serverIndex).changedAt;
    player.contactKind = 'serve'; player.contactAt = 1.85;
    state.phase = 'rally'; state.time = 1.85;
    const target = localToWorld({ x: 23, y: 27, z: 330 }, player, player.facing);
    animator.hit({ type: 'hit', actor: serverIndex, kind: 'serve', ...target }, state.time);
    const contact = animator.pose(player, state);
    assert.equal(contact.clip, 'serve');
    assert.equal(contact.phase, CONTACT_PHASE.serve);
    assert.equal(animator.actors.get(serverIndex).changedAt, changedAt, 'hit must not restart an idle-to-serve transition');
    assert.ok(distance(localToWorld(contact.joints.wristR, player, player.facing), target) < 1e-7);
    const nonServer = actor({ index: serverIndex === 0 ? 1 : 3 });
    assert.equal(animator.pose(nonServer, { phase: 'serve', time: 1.8, serving }).clip, 'idle');
  }
});

test('front and back billboard depth keeps screen elbows below shoulders and crown with the real stadium camera', () => {
  for (const facing of ['down', 'up']) for (const clip of ['idle', 'run']) for (let frame = 0; frame < 360; frame++) {
    const player = actor({ facing }), { joints } = sampleMotion(clip, frame / 360);
    const projectJoint = name => {
      const world = localToWorld(joints[name], player, facing);
      return projectCourtPoint(world.x, world.y, world.z, 960, 1440);
    };
    const crown = projectJoint('headTop');
    for (const side of ['L', 'R']) {
      const elbow = projectJoint(`elbow${side}`), shoulder = projectJoint(`shoulder${side}`);
      // Less than a tenth of a pixel is below canvas raster precision. The
      // former depth deformation lifted rear elbows many visible pixels.
      assert.ok(elbow.y >= shoulder.y - .1, `${facing} ${clip} ${frame} ${side}: elbow must appear below shoulder`);
      assert.ok(elbow.y > crown.y + 20, `${facing} ${clip} ${frame} ${side}: elbow must not rise above crown`);
    }
  }
  for (const facing of ['down', 'up']) {
    const player = actor({ facing, z: 180, contactKind: 'spike', contactAt: 1 }), animator = new CharacterAnimator({ transition: 0 });
    const target = localToWorld({ x: 23, y: 25, z: 330 }, player, facing);
    assert.ok(Math.abs(target.y - player.y) <= 4);
    animator.hit({ type: 'hit', actor: 0, kind: 'spike', ...target }, 1);
    const contact = animator.pose(player, { time: 1, phase: 'rally' });
    assert.ok(distance(localToWorld(contact.joints.wristR, player, facing), target) < 1e-7);
  }
});
