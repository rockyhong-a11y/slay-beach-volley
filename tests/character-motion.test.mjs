import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CharacterAnimator, MOTION_CLIPS, CONTACT_PHASE, SD_ANATOMY, headCrownExtent, sampleMotion, solveTwoBone, localToWorld } from '../src/character-motion.js';
import { HAND_HEIGHT } from '../src/engine.js';
import { projectCourtPoint } from '../src/render.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const actor = changes => ({ id: 'nova', index: 0, team: 0, x: 500, y: 790, z: 0, moving: 0, facing: 'up', action: 'idle', actionAt: 0, contactKind: null, contactAt: -10, landAt: -10, ...changes });

// Record the final canvas transform, so tests observe the cutout geometry the
// renderer produces rather than its internal sequence of scale operations.
function affineCanvas() {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [], calls = [];
  const multiply = ([a, b, c, d, e, f]) => {
    const [ma, mb, mc, md, me, mf] = matrix;
    matrix = [ma * a + mc * b, mb * a + md * b, ma * c + mc * d, mb * c + md * d, ma * e + mc * f + me, mb * e + md * f + mf];
  };
  return {
    calls,
    save() { stack.push([...matrix]); },
    restore() { matrix = stack.pop(); },
    translate(x, y) { multiply([1, 0, 0, 1, x, y]); },
    rotate(angle) { const c = Math.cos(angle), s = Math.sin(angle); multiply([c, s, -s, c, 0, 0]); },
    scale(x, y) { multiply([x, 0, 0, y, 0, 0]); },
    drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) {
      const [a, b, c, d, e, f] = matrix;
      calls.push({ sx, sy, sourcePoint(x, y) {
        const px = dx + x * dw / sw, py = dy + y * dh / sh;
        return { x: a * px + c * py + e, y: b * px + d * py + f };
      } });
    },
  };
}

test('seven clips have 60 distinct articulated samples rather than repeated sprite poses', () => {
  assert.equal(Object.keys(MOTION_CLIPS).length, 7);
  for (const [name, frames] of Object.entries(MOTION_CLIPS)) {
    assert.equal(frames.length, 60, name);
    const fingerprints = frames.map(frame => JSON.stringify(frame.joints));
    assert.equal(new Set(fingerprints).size, 60, name);
    for (const frame of frames) for (const suffix of ['L', 'R']) {
      assert.ok(Math.abs(distance(frame.joints[`shoulder${suffix}`], frame.joints[`elbow${suffix}`]) - SD_ANATOMY.arm[0]) < 1e-7, name);
      assert.ok(Math.abs(distance(frame.joints[`elbow${suffix}`], frame.joints[`wrist${suffix}`]) - SD_ANATOMY.arm[1]) < 1e-7, name);
      assert.ok(Math.abs(distance(frame.joints[`hip${suffix}`], frame.joints[`knee${suffix}`]) - SD_ANATOMY.leg[0]) < 1e-7, name);
      assert.ok(Math.abs(distance(frame.joints[`knee${suffix}`], frame.joints[`ankle${suffix}`]) - SD_ANATOMY.leg[1]) < 1e-7, name);
      for (const facing of ['down', 'up', 'left', 'right']) {
        const world = joint => localToWorld(frame.joints[joint], actor({ facing }), facing);
        for (const joint of [`shoulder${suffix}`, `elbow${suffix}`, `wrist${suffix}`, `hip${suffix}`, `knee${suffix}`, `ankle${suffix}`]) {
          const transformed = world(joint);
          assert.ok(Object.values(transformed).every(Number.isFinite), `${name} ${facing} ${joint}`);
          assert.equal(transformed.z, frame.joints[joint].z, 'facing preserves anatomical height');
        }
      }
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
  const player = actor(), forward = { x: 0, y: 30, z: SD_ANATOMY.height };
  assert.ok(Math.abs(localToWorld(forward, player, 'up').y - 785.2) < 1e-7);
  assert.ok(Math.abs(localToWorld(forward, player, 'down').y - 794.8) < 1e-7);
  assert.equal(localToWorld(forward, player, 'left').x, 470);
  assert.equal(localToWorld(forward, player, 'right').x, 530);
  assert.equal(localToWorld(forward, player, 'up').z, SD_ANATOMY.height);
});

test('two-bone contact solver reaches natural targets and clamps distant ones without stretching', () => {
  const root = { x: 28, y: 0, z: 188 }, target = { x: 23, y: 5, z: HAND_HEIGHT.attack };
  const solved = solveTwoBone(root, target, ...SD_ANATOMY.arm, { x: 80, y: -12, z: 190 });
  assert.equal(solved.reachable, true);
  assert.ok(distance(solved.end, target) < 1e-7);
  const distant = solveTwoBone(root, { x: 400, y: 0, z: 500 }, ...SD_ANATOMY.arm);
  assert.equal(distant.reachable, false);
  assert.ok(distance(root, distant.end) < SD_ANATOMY.arm[0] + SD_ANATOMY.arm[1]);
  assert.ok(Math.abs(distance(root, distant.joint) - SD_ANATOMY.arm[0]) < 1e-7);
  assert.ok(Math.abs(distance(distant.joint, distant.end) - SD_ANATOMY.arm[1]) < 1e-7);
});

test('actual hit timestamp drives contact pose and reachable hand position, never an automatic swing', () => {
  const animator = new CharacterAnimator({ transition: 0 }), player = actor({ z: 160, jumpKind: 'attack', action: 'attack-jump' });
  const preparing = animator.pose(player, { time: .8 });
  assert.ok(preparing.phase < CONTACT_PHASE.spike);
  player.contactKind = 'spike'; player.contactAt = 1;
  const target = localToWorld({ x: 23, y: 25, z: HAND_HEIGHT.attack }, player, 'up');
  animator.hit({ type: 'hit', actor: 0, kind: 'spike', ...target }, 1);
  const contact = animator.pose(player, { time: 1 });
  assert.equal(contact.phase, CONTACT_PHASE.spike);
  assert.ok(distance(localToWorld(contact.joints.wristR, player, 'up'), target) < 1e-7);
  animator.hit({ type: 'hit', actor: 0, kind: 'spike', x: 900, y: 790, z: 490 }, 1.1);
  const distant = animator.pose(player, { time: 1.1 });
  assert.ok(distance(distant.joints.shoulderR, distant.joints.wristR) <= SD_ANATOMY.arm[0] + SD_ANATOMY.arm[1]);
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

test('grounded SD anatomy uses a large skull and compact torso and limbs at 2.6 to 2.8 heads tall', () => {
  const { joints } = sampleMotion('idle', 0, { reducedMotion: true });
  const head = joints.headTop.z - joints.neck.z, torso = joints.neck.z - joints.pelvis.z;
  assert.equal(joints.pelvis.z, SD_ANATOMY.pelvis);
  assert.equal(joints.headTop.z, SD_ANATOMY.height);
  assert.ok(joints.headTop.z / head >= 2.6 && joints.headTop.z / head <= 2.8);
  assert.ok(head > torso, 'SD skull is larger than the torso');
  assert.ok(torso / head >= .7 && torso / head <= .85);
  assert.ok((SD_ANATOMY.arm[0] + SD_ANATOMY.arm[1]) / head < 1.2, 'arms stay compact');
  assert.ok((SD_ANATOMY.leg[0] + SD_ANATOMY.leg[1]) / head < 1, 'legs stay shorter than a head');
  assert.ok(Math.abs(joints.ankleL.z) < 1e-7);
  assert.ok(Math.abs(joints.ankleR.z) < 1e-7);
});

test('hair crown stays aligned with the skull when packed metadata identifies the real top as tip', () => {
  for (const hairLengthWorld of [130, 175, 190]) {
    const ctx = affineCanvas();
    const pivotY = 200 * (SD_ANATOMY.head / hairLengthWorld);
    const animator = new CharacterAnimator({ transition: 0 });
    const top = animator.draw(ctx, actor({ facing: 'down' }), { time: 0 }, {
      image: {}, reducedMotion: true, project: (x, y, z) => ({ x, y: -z, scale: 1 }),
      view: { hairLengthWorld, parts: { hair: { rect: [0, 0, 100, 200], pivot: [50, pivotY], tip: [50, 0] } } },
    });
    const drawnCrown = ctx.calls[0].sourcePoint(50, 0);
    assert.ok(Math.hypot(drawnCrown.x - top.x, drawnCrown.y - top.y) < 1e-7, 'crown aligns with the anatomical head top');
    const drawnBottom = ctx.calls[0].sourcePoint(50, 200);
    assert.ok(drawnBottom.y > drawnCrown.y, 'hair falls down instead of rotating upside down');
  }
});

test('name anchors clear the actual painted crown for all ten characters and four directions', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/motions/manifest.json', import.meta.url), 'utf8'));
  assert.equal(headCrownExtent(), SD_ANATOMY.head, 'missing artwork keeps the anatomical crown fallback');
  assert.equal(headCrownExtent({ parts: { hair: {} } }), SD_ANATOMY.head);
  for (const [id, character] of Object.entries(manifest.characters)) for (const [facing, view] of Object.entries(character.views)) {
    const head = view.parts.head, extent = headCrownExtent(view), label = `${id}/${facing}`;
    assert.ok(Number.isFinite(extent) && extent >= SD_ANATOMY.head && extent < SD_ANATOMY.head * 1.55, `${label}: decorative crown has a bounded extent`);
    if (['atlas', 'seraph', 'tempest', 'onyx'].includes(id)) assert.ok(extent > SD_ANATOMY.head + 15, `${label}: labels clear the bun above the skull axis`);
    for (const clip of Object.keys(MOTION_CLIPS)) for (const frame of [0, 15, 30, 45, 59]) {
      const player = actor({ id, facing }), pose = sampleMotion(clip, frame / 60), ctx = affineCanvas(), animator = new CharacterAnimator({ transition: 0 });
      animator.pose = () => ({ ...pose, facing });
      const anchor = animator.draw(ctx, player, {}, {
        image: {}, view,
        project: (x, y, z) => projectCourtPoint(x, y, z, 960, 1440),
      });
      // The source top along the skull axis includes decorative hair that is
      // deliberately outside the 112-unit skull size.
      const headDraw = ctx.calls.find(call => call.sx === head.rect[0] && call.sy === head.rect[1]);
      assert.ok(headDraw, `${label}: the head cutout is rendered`);
      const paintedTop = headDraw.sourcePoint(head.pivot[0], 0);
      assert.ok(Math.hypot(paintedTop.x - anchor.x, paintedTop.y - anchor.y) < 1e-7, `${label} ${clip}/${frame}: anchor follows the rendered crown`);
      const skullCrown = headDraw.sourcePoint(...head.tip);
      assert.ok(anchor.y <= skullCrown.y, `${label} ${clip}/${frame}: decorative clearance stays above the skull`);
    }
  }
});

test('overhead contact remains reachable with shoulders inside the torso and gloves visible in front of the head', () => {
  const manifest = JSON.parse(readFileSync(new URL('../assets/motions/manifest.json', import.meta.url), 'utf8'));
  for (const [id, character] of Object.entries(manifest.characters)) for (const [facing, view] of Object.entries(character.views)) for (const clip of ['toss', 'spike', 'block', 'serve']) {
    const player = actor({ id, facing }), pose = sampleMotion(clip, CONTACT_PHASE[clip]), ctx = affineCanvas(), animator = new CharacterAnimator({ transition: 0 });
    animator.pose = () => ({ ...pose, facing });
    animator.draw(ctx, player, {}, { image: {}, view, project: (x, y, z) => projectCourtPoint(x, y, z, 960, 1440) });
    const drawIndex = name => ctx.calls.findIndex(call => call.sx === view.parts[name].rect[0] && call.sy === view.parts[name].rect[1]);
    const headIndex = drawIndex('head');
    for (const side of ['L', 'R']) {
      assert.ok(drawIndex(`upperArm${side}`) < headIndex, `${id}/${facing}/${clip}: upper arms retain torso depth`);
      assert.ok(drawIndex(`forearm${side}`) > headIndex, `${id}/${facing}/${clip}: raised gloves remain readable in front of the large SD head`);
    }
    for (const side of clip === 'toss' || clip === 'block' ? ['L', 'R'] : ['R']) {
      const shoulder = pose.joints[`shoulder${side}`], wrist = pose.joints[`wrist${side}`];
      assert.ok(shoulder.z <= pose.joints.neck.z, `${clip}/${side}: shoulder does not float above the torso cap`);
      assert.ok(distance(shoulder, wrist) < SD_ANATOMY.arm[0] + SD_ANATOMY.arm[1], `${clip}/${side}: contact stays within natural reach`);
      assert.ok(Math.abs(wrist.z - HAND_HEIGHT[clip === 'toss' ? 'toss' : 'attack']) < 1, `${clip}/${side}: hand reaches the game contact height`);
    }
  }
});

test('drawn cutout widths remain stable through every clip and facing while bone endpoints stay registered', () => {
  const bones = {
    head: ['neck', 'headTop'], body: ['pelvis', 'neck'],
    upperArmL: ['shoulderL', 'elbowL'], forearmL: ['elbowL', 'wristL'],
    upperArmR: ['shoulderR', 'elbowR'], forearmR: ['elbowR', 'wristR'],
    thighL: ['hipL', 'kneeL'], shinL: ['kneeL', 'ankleL'],
    thighR: ['hipR', 'kneeR'], shinR: ['kneeR', 'ankleR'],
  };
  // A slanted source axis also detects incorrect anisotropic rotation or
  // reflection, which can move joints even when a width happens to be stable.
  const parts = Object.fromEntries(Object.keys(bones).map((name, index) => [name, { rect: [index * 100, 0, 40, 110], pivot: [15, 100], tip: [23, 5] }]));
  const namesBySource = new Map(Object.entries(parts).map(([name, part]) => [part.rect[0], name]));
  const expectedWidths = new Map();
  for (const [width, height, y] of [[960, 1440, 790], [480, 720, 790], [960, 1440, 260]]) {
    const project = (x, depth, z) => projectCourtPoint(x, depth, z, width, height);
    for (const facing of ['down', 'up', 'left', 'right']) for (const [clip, frames] of Object.entries(MOTION_CLIPS)) for (let frame = 0; frame < frames.length; frame++) {
      const player = actor({ facing, y }), pose = sampleMotion(clip, frame / 60), ctx = affineCanvas();
      const animator = new CharacterAnimator({ transition: 0 });
      animator.pose = () => ({ ...pose, facing });
      animator.draw(ctx, player, {}, { image: {}, view: { mirror: facing === 'left', parts }, project });
      assert.equal(ctx.calls.length, Object.keys(bones).length);
      const base = project(player.x, player.y, 0), crown = project(player.x, player.y, SD_ANATOMY.height);
      const cameraUnit = Math.hypot(crown.x - base.x, crown.y - base.y) / SD_ANATOMY.height;
      for (const call of ctx.calls) {
        const name = namesBySource.get(call.sx), part = parts[name], label = `${clip} ${frame} ${facing} ${name}`;
        for (const [source, joint] of [[part.pivot, bones[name][0]], [part.tip, bones[name][1]]]) {
          const drawn = call.sourcePoint(...source), world = localToWorld(pose.joints[joint], player, facing), target = project(world.x, world.y, world.z);
          assert.ok(Math.hypot(drawn.x - target.x, drawn.y - target.y) < 1e-7, `${label}: painted axis endpoint follows its joint`);
        }
        const vx = part.tip[0] - part.pivot[0], vy = part.tip[1] - part.pivot[1], axisLength = Math.hypot(vx, vy);
        const crossA = call.sourcePoint(part.pivot[0] - vy / axisLength * 20, part.pivot[1] + vx / axisLength * 20);
        const crossB = call.sourcePoint(part.pivot[0] + vy / axisLength * 20, part.pivot[1] - vx / axisLength * 20);
        const drawnWidth = Math.hypot(crossB.x - crossA.x, crossB.y - crossA.y) / cameraUnit;
        if (!expectedWidths.has(name)) expectedWidths.set(name, drawnWidth);
        assert.ok(Math.abs(drawnWidth / expectedWidths.get(name) - 1) < 1e-8, `${label}: turning or bending cannot inflate transverse width`);
      }
    }
  }
});

test('relaxed idle and counter-swing run keep both elbows below the shoulders throughout a cycle', () => {
  for (const clip of ['idle', 'run']) for (let frame = 0; frame < 360; frame++) {
    const { joints } = sampleMotion(clip, frame / 360);
    for (const [side, sign] of [['L', -1], ['R', 1]]) {
      assert.ok(joints[`elbow${side}`].z < joints[`shoulder${side}`].z - 8, `${clip} ${frame} ${side}`);
      assert.ok(joints[`wrist${side}`].z < joints[`shoulder${side}`].z - 35, `${clip} ${frame} ${side}`);
      assert.ok(sign * joints[`elbow${side}`].x > sign * joints[`hip${side}`].x, `${clip} ${frame} ${side}: relaxed elbows stay outside their own hips instead of crossing the torso`);
    }
  }
  assert.ok(Math.abs(sampleMotion('spike', CONTACT_PHASE.spike).joints.wristR.z - HAND_HEIGHT.attack) < 1);
  assert.ok(Math.abs(sampleMotion('toss', CONTACT_PHASE.toss).joints.wristR.z - HAND_HEIGHT.toss) < 1);
});

test('side profiles use shallow lateral depth while keeping exact inverse IK at contact', () => {
  for (const facing of ['left', 'right']) {
    const player = actor({ facing, z: 180, contactKind: 'spike', contactAt: 1 });
    const local = { x: 23, y: 25, z: HAND_HEIGHT.attack }, target = localToWorld(local, player, facing);
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
  assert.ok(joints.wristL.z > HAND_HEIGHT.attack - 1);
  assert.ok(joints.wristR.z > HAND_HEIGHT.attack - 1);
  for (const side of ['L', 'R']) assert.ok(Math.abs(distance(joints[`shoulder${side}`], joints[`elbow${side}`]) - SD_ANATOMY.arm[0]) < 1e-7);
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
    const target = localToWorld({ x: 23, y: 27, z: HAND_HEIGHT.attack }, player, player.facing);
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
    const target = localToWorld({ x: 23, y: 25, z: HAND_HEIGHT.attack }, player, facing);
    assert.ok(Math.abs(target.y - player.y) <= 4);
    animator.hit({ type: 'hit', actor: 0, kind: 'spike', ...target }, 1);
    const contact = animator.pose(player, { time: 1, phase: 'rally' });
    assert.ok(distance(localToWorld(contact.joints.wristR, player, facing), target) < 1e-7);
  }
});
