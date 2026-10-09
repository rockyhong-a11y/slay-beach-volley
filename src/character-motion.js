// Authored volleyball joint poses, sampled at 60 poses per clip. Artwork is
// directional, articulated anatomy; no legacy fighting sprite is transformed.
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
const point = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => point(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => point(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, t) => point(a.x * t, a.y * t, a.z * t);
const length = a => Math.hypot(a.x, a.y, a.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const blendPoint = (a, b, t) => point(mix(a.x, b.x, t), mix(a.y, b.y, t), mix(a.z, b.z, t));
const smooth = t => t * t * (3 - 2 * t);
export const SD_ANATOMY = Object.freeze({ head: 112, torso: 86, pelvis: 100, height: 298, arm: Object.freeze([60, 72]), leg: Object.freeze([48, 52]) });
const ARM = SD_ANATOMY.arm, LEG = SD_ANATOMY.leg;

export const MOTION_TIMING = Object.freeze({ idle: 2, run: .72, toss: .65, spike: .72, block: .85, serve: .8, land: .28 });
export const CONTACT_PHASE = Object.freeze({ toss: .48, spike: .56, block: .48, serve: .52 });
export const FACING_BASIS = Object.freeze({
  down: { side: [1, 0], forward: [0, 1] },
  up: { side: [-1, 0], forward: [0, -1] },
  left: { side: [0, -1], forward: [-1, 0] },
  right: { side: [0, 1], forward: [1, 0] },
});

// Decorative buns stay outside the skull size axis, but labels must clear them.
export function headCrownExtent(view) {
  const head = view?.parts?.head;
  if (!head?.pivot || !head?.tip) return SD_ANATOMY.head;
  const axis = head.pivot[1] - head.tip[1];
  return axis > 0 ? SD_ANATOMY.head * head.pivot[1] / axis : SD_ANATOMY.head;
}

// The end is clamped to the anatomical reach. This solver never stretches a
// limb or translates the body to force a distant contact.
export function solveTwoBone(root, target, upper, lower, pole = add(root, point(0, 1, 0))) {
  const delta = sub(target, root), requestedDistance = length(delta);
  const direction = requestedDistance > 1e-8 ? mul(delta, 1 / requestedDistance) : point(0, 0, -1);
  const minimum = Math.abs(upper - lower) + 1e-5, maximum = upper + lower - 1e-5;
  const distance = clamp(requestedDistance, minimum, maximum);
  let perpendicular = sub(sub(pole, root), mul(direction, dot(sub(pole, root), direction)));
  if (length(perpendicular) < 1e-7) {
    const axis = Math.abs(direction.y) < .9 ? point(0, 1, 0) : point(1, 0, 0);
    perpendicular = sub(axis, mul(direction, dot(axis, direction)));
  }
  perpendicular = mul(perpendicular, 1 / length(perpendicular));
  const along = (upper * upper + distance * distance - lower * lower) / (2 * distance);
  const across = Math.sqrt(Math.max(0, upper * upper - along * along));
  return {
    joint: add(root, add(mul(direction, along), mul(perpendicular, across))),
    end: add(root, mul(direction, distance)),
    reachable: requestedDistance >= minimum && requestedDistance <= maximum,
    requestedDistance,
  };
}

const REST = { pelvis: 124, lean: 0, twist: 0, lx: 0, head: 0, wl: [-39, 8, 90], wr: [39, 8, 90], fl: [-24, 0, 0], fr: [24, 0, 0] };
const k = (at, changes) => ({ at, ...REST, ...changes });
// Each sequence has its own anatomical preparation, contact and recovery.
const KEYS = {
  toss: [k(0, { pelvis: 113, wl: [-34, 12, 175], wr: [34, 12, 175] }), k(.2, { pelvis: 117, lean: 4, wl: [-22, 9, 247], wr: [22, 9, 247] }), k(.48, { pelvis: 124, lean: 6, wl: [-13, 8, 305], wr: [13, 8, 305], fl: [-24, -12, 14], fr: [24, -12, 14] }), k(.65, { pelvis: 125, lean: 8, wl: [-19, 13, 308], wr: [19, 13, 308], fl: [-25, -8, 12], fr: [25, -8, 12] }), k(1, {})],
  spike: [k(0, { pelvis: 113, lean: 8, wl: [-34, 20, 183], wr: [46, -14, 213] }), k(.24, { pelvis: 122, lean: -8, twist: -.22, wl: [-32, 22, 256], wr: [42, -22, 269], fl: [-24, -20, 25], fr: [24, -28, 30] }), k(.42, { pelvis: 126, lean: -5, twist: -.32, wl: [-27, 26, 235], wr: [32, -20, 298], fl: [-24, -28, 26], fr: [24, -20, 35] }), k(.56, { pelvis: 125, lean: 10, twist: .2, wl: [-34, 20, 222], wr: [23, 25, 310], fl: [-27, -20, 20], fr: [27, -30, 26] }), k(.72, { pelvis: 121, lean: 18, twist: .32, wl: [-32, 2, 181], wr: [28, 45, 205], fl: [-25, -13, 16], fr: [25, -15, 20] }), k(1, {})],
  block: [k(0, { pelvis: 112, wl: [-29, 4, 200], wr: [29, 4, 200] }), k(.24, { pelvis: 121, wl: [-29, 10, 268], wr: [29, 10, 268], fl: [-23, -13, 17], fr: [23, -13, 17] }), k(.48, { pelvis: 125, lean: 5, wl: [-29, 12, 310], wr: [29, 12, 310], fl: [-25, -18, 21], fr: [25, -18, 21] }), k(.72, { pelvis: 124, lean: 8, wl: [-30, 16, 307], wr: [30, 16, 307], fl: [-25, -10, 13], fr: [25, -10, 13] }), k(1, { pelvis: 120, wl: [-34, 12, 169], wr: [34, 12, 169] })],
  serve: [k(0, { pelvis: 120, lean: -3, wl: [-26, 30, 215], wr: [38, -20, 202] }), k(.23, { pelvis: 124, twist: -.2, wl: [-19, 22, 273], wr: [35, -24, 262] }), k(.52, { pelvis: 125, lean: 10, twist: .2, wl: [-34, 14, 222], wr: [23, 27, 310] }), k(.73, { pelvis: 121, lean: 18, twist: .27, wl: [-36, 12, 169], wr: [28, 42, 190] }), k(1, {})],
  land: [k(0, { pelvis: 122, lean: 8, wl: [-42, 8, 140], wr: [42, 8, 140], fl: [-28, -8, 5], fr: [28, -8, 5] }), k(.27, { pelvis: 95, lean: 14, wl: [-42, 15, 108], wr: [42, 15, 108], fl: [-31, 5, 0], fr: [31, 5, 0] }), k(.62, { pelvis: 112, lean: 8, wl: [-40, 11, 123], wr: [40, 11, 123] }), k(1, {})],
};

function interpolateKeys(keys, phase) {
  let index = 0;
  while (index < keys.length - 2 && phase > keys[index + 1].at) index++;
  const a = keys[index], b = keys[index + 1], t = smooth(clamp((phase - a.at) / (b.at - a.at), 0, 1));
  const result = {};
  for (const name of Object.keys(REST)) result[name] = Array.isArray(a[name]) ? a[name].map((value, i) => mix(value, b[name][i], t)) : mix(a[name], b[name], t);
  return result;
}

function articulate(joints) {
  for (const [suffix, sign] of [['L', -1], ['R', 1]]) {
    const shoulder = joints[`shoulder${suffix}`], wrist = joints[`wrist${suffix}`];
    // Relaxed arms bend forward beside the torso instead of flaring outward.
    // Blend continuously into the wider overhead pole as the hands rise.
    const relaxed = smooth(clamp((shoulder.z - wrist.z - 20) / 25, 0, 1));
    const armPole = point(sign * mix(65, 16, relaxed), mix(-12, 35, relaxed), mix(-18, -48, relaxed));
    const arm = solveTwoBone(shoulder, wrist, ...ARM, add(shoulder, armPole));
    joints[`elbow${suffix}`] = arm.joint; joints[`wrist${suffix}`] = arm.end;
    const leg = solveTwoBone(joints[`hip${suffix}`], joints[`ankle${suffix}`], ...LEG, add(joints[`hip${suffix}`], point(sign * 5, 80, -30)));
    joints[`knee${suffix}`] = leg.joint; joints[`ankle${suffix}`] = leg.end;
  }
  return joints;
}

function evaluateAuthored(name, phase) {
  let settings;
  if (name === 'run') {
    const foot = (p, x) => {
      p = (p + 1) % 1;
      if (p < .5) return [x, 45 - 180 * p, 0];
      const swing = (p - .5) * 2;
      return [x, -45 + 90 * smooth(swing), 36 * Math.sin(Math.PI * swing)];
    };
    const swing = Math.sin(phase * TAU);
    settings = { ...REST, pelvis: 116 + Math.cos(phase * TAU * 2) * 2, lean: 10, twist: swing * .12, wl: [-39, -28 * swing, 100 + swing * 12], wr: [39, 28 * swing, 100 - swing * 12], fl: foot(phase, -24), fr: foot(phase + .5, 24) };
  } else if (name === 'idle') {
    const breath = Math.sin(phase * TAU);
    settings = { ...REST, pelvis: 124 + breath * .8, lean: Math.cos(phase * TAU) * .7, wl: [-39, 8, 90 + breath * .8], wr: [39, 8, 90 + breath * .8] };
  } else settings = interpolateKeys(KEYS[name] || KEYS.toss, phase);
  // A large skull, short torso and compact limbs form a 2.66-head SD figure.
  // Hair length is cosmetic and does not participate in body proportions.
  const { lean, twist, lx, head } = settings, pelvis = settings.pelvis - 24;
  const joints = { pelvis: point(lx, 0, pelvis), neck: point(lx, lean, pelvis + SD_ANATOMY.torso), headTop: point(lx + head, lean, pelvis + SD_ANATOMY.torso + SD_ANATOMY.head) };
  for (const [suffix, sign, hand, foot] of [['L', -1, settings.wl, settings.fl], ['R', 1, settings.wr, settings.fr]]) {
    const shrug = 5 * smooth(clamp((hand[2] - 240) / 55, 0, 1));
    joints[`shoulder${suffix}`] = point(lx + sign * 28 * Math.cos(twist), lean + sign * 28 * Math.sin(twist), pelvis + 79 + shrug);
    joints[`hip${suffix}`] = point(lx + sign * 24, 0, pelvis - 1);
    joints[`wrist${suffix}`] = point(...hand); joints[`ankle${suffix}`] = point(...foot);
  }
  return { joints: articulate(joints), hair: Math.sin(phase * TAU + .45) * (name === 'run' ? .11 : .025) };
}

export const MOTION_CLIPS = Object.freeze(Object.fromEntries(Object.keys(MOTION_TIMING).map(name => [name, Object.freeze(Array.from({ length: 60 }, (_, frame) => evaluateAuthored(name, frame / 60)))])));
export function buildClip(name) { return MOTION_CLIPS[name] || MOTION_CLIPS.idle; }
function blendPose(a, b, weight) {
  const joints = {};
  for (const name of Object.keys(b.joints)) joints[name] = blendPoint(a.joints[name], b.joints[name], weight);
  return { joints: articulate(joints), hair: mix(a.hair, b.hair, weight) };
}
export function sampleMotion(name, phase, { reducedMotion = false } = {}) {
  const clip = buildClip(name), loop = name === 'idle' || name === 'run';
  phase = loop ? ((phase % 1) + 1) % 1 : clamp(phase, 0, 1);
  if (reducedMotion && name === 'idle') phase = 0;
  const position = phase * 60, index = Math.min(59, Math.floor(position));
  const result = blendPose(clip[index], clip[loop ? (index + 1) % 60 : Math.min(59, index + 1)], position - Math.floor(position));
  if (reducedMotion) result.hair = 0;
  return result;
}

export function localToWorld(local, actor, facing = actor.facing || (actor.team === 0 ? 'up' : 'down')) {
  const basis = FACING_BASIS[facing] || FACING_BASIS.down;
  // All four painted directions are a shallow 2D billboard rig. Keep screen
  // lateral movement full size, but compress stadium depth for every direction.
  // Full world-Y excursions distort cutout proportions under the high camera.
  return point(actor.x + local.x * basis.side[0] + local.y * basis.forward[0], actor.y + (local.x * basis.side[1] + local.y * basis.forward[1]) * .16, actor.z + local.z);
}
function worldToLocal(world, actor, facing) {
  const basis = FACING_BASIS[facing] || FACING_BASIS.down, x = world.x - actor.x, y = (world.y - actor.y) / .16;
  return point(x * basis.side[0] + y * basis.side[1], x * basis.forward[0] + y * basis.forward[1], world.z - actor.z);
}

function drawPart(ctx, image, part, a, b, mirror = false, transverseLength = 1) {
  if (!part?.rect || !image) return;
  mirror = part.mirror ?? mirror;
  const [sx, sy, width, height] = part.rect;
  const pivot = part.pivot || [width / 2, height * .97], tip = part.tip || [width / 2, height * .03];
  const sourceX = (tip[0] - pivot[0]) * (mirror ? -1 : 1), sourceY = tip[1] - pivot[1];
  const sourceLength = Math.max(1, Math.hypot(sourceX, sourceY));
  const along = Math.hypot(b.x - a.x, b.y - a.y) / sourceLength;
  const across = transverseLength / sourceLength;
  ctx.save(); ctx.translate(a.x, a.y);
  // Only the bone axis follows projected joint distance. Turning, bending or
  // pointing toward the camera cannot inflate the arm or shrink its thickness.
  ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2);
  ctx.scale(across, along);
  ctx.rotate(Math.PI / 2 - Math.atan2(sourceY, sourceX));
  ctx.scale(mirror ? -1 : 1, 1);
  ctx.drawImage(image, sx, sy, width, height, -pivot[0], -pivot[1], width, height); ctx.restore();
}

export class CharacterAnimator {
  constructor({ transition = .12, stride = 180 } = {}) { this.transition = transition; this.stride = stride; this.actors = new Map(); this.contacts = new Map(); }
  clear() { this.actors.clear(); this.contacts.clear(); }
  hit(event, stateTime) {
    if (event.type !== 'hit' || !Number.isFinite(event.actor)) return;
    this.contacts.set(event.actor, { point: point(event.x, event.y, event.z), kind: event.kind, time: stateTime });
  }
  pose(actor, state, { reducedMotion = false } = {}) {
    const now = state.time || 0, index = actor.index ?? actor.id;
    let record = this.actors.get(index);
    if (!record || record.id !== actor.id || now < record.time) {
      record = { id: actor.id, x: actor.x, y: actor.y, time: now, runPhase: 0, clip: null, pose: null, from: null, changedAt: now };
      this.actors.set(index, record);
    }
    const distance = Math.hypot(actor.x - record.x, actor.y - record.y);
    if (actor.moving > .08 && distance < 160) record.runPhase = (record.runPhase + distance / this.stride) % 1;
    record.x = actor.x; record.y = actor.y; record.time = now;
    const contactAge = now - (actor.contactAt ?? -10), landAge = now - (actor.landAt ?? -10);
    const actionAge = Math.max(0, now - (actor.actionAt ?? now));
    const contactName = ({ receive: 'toss', set: 'toss', return: 'spike', serve: 'serve', spike: 'spike', block: 'block' })[actor.contactKind];
    const active = state.phase === undefined || state.phase === 'rally' || state.phase === 'serve';
    let clip = active && actor.moving > .08 ? 'run' : 'idle', phase = clip === 'run' ? record.runPhase : now / MOTION_TIMING.idle;
    if (active && landAge >= 0 && landAge < MOTION_TIMING.land && (actor.action === 'land' || landAge < contactAge)) { clip = 'land'; phase = landAge / MOTION_TIMING.land; }
    else if (active && contactName && contactAge >= 0 && contactAge < MOTION_TIMING[contactName] * (1 - CONTACT_PHASE[contactName])) { clip = contactName; phase = CONTACT_PHASE[clip] + contactAge / MOTION_TIMING[clip]; }
    else if (active && state.phase === 'serve' && actor.index === (state.serving === 0 ? 0 : 2)) {
      clip = 'serve'; phase = Math.min(CONTACT_PHASE.serve - .05, actionAge / MOTION_TIMING.serve);
    }
    else if (active && (actor.z > 1 || actor.jumpKind)) {
      clip = actor.jumpKind === 'block' ? 'block' : actor.jumpKind === 'toss' ? 'toss' : 'spike';
      // Wind-up is held until an actual hit; jumping does not swing by itself.
      phase = Math.min(CONTACT_PHASE[clip] - .07, actionAge / MOTION_TIMING[clip]);
    } else if (active && state.charging && actor.index === 0) { clip = 'spike'; phase = Math.min(.42, actionAge / .72); }
    const changed = clip !== record.clip;
    if (changed) { record.from = record.pose; record.changedAt = now; record.clip = clip; }
    let pose = sampleMotion(clip, phase, { reducedMotion });
    if (record.from && now - record.changedAt < this.transition) pose = blendPose(record.from, pose, smooth(clamp((now - record.changedAt) / this.transition, 0, 1)));
    const facing = actor.facing || (actor.team === 0 ? 'up' : 'down');
    const contact = this.contacts.get(index);
    if (contact && now >= contact.time && now - contact.time <= .09) {
      const local = worldToLocal(contact.point, actor, facing);
      const arms = contact.kind === 'receive' || contact.kind === 'set' || contact.kind === 'block' ? ['L', 'R'] : ['R'];
      for (const suffix of arms) {
        const shoulder = pose.joints[`shoulder${suffix}`];
        const target = arms.length === 2 ? add(local, point(suffix === 'L' ? -7 : 7, 0, 0)) : local;
        const solution = solveTwoBone(shoulder, target, ...ARM, pose.joints[`elbow${suffix}`]);
        if (solution.reachable) { pose.joints[`elbow${suffix}`] = solution.joint; pose.joints[`wrist${suffix}`] = solution.end; }
      }
    } else if (contact && now - contact.time > .09) this.contacts.delete(index);
    record.pose = pose;
    return { ...pose, clip, phase, facing, runPhase: record.runPhase };
  }
  draw(ctx, actor, state, { image, view, project, reducedMotion = false }) {
    const pose = this.pose(actor, state, { reducedMotion }), joints = pose.joints;
    const projected = {};
    const projectLocal = local => { const world = localToWorld(local, actor, pose.facing); return project(world.x, world.y, world.z); };
    for (const [name, local] of Object.entries(joints)) projected[name] = projectLocal(local);
    const parts = view?.parts || {}, mirror = Boolean(view?.mirror);
    const base = projectLocal(point()), crown = projectLocal(point(0, 0, SD_ANATOMY.height));
    const pixelUnit = Math.hypot(crown.x - base.x, crown.y - base.y) / SD_ANATOMY.height;
    const lengths = { head: SD_ANATOMY.head, body: SD_ANATOMY.torso, upperArmL: ARM[0] * .8, upperArmR: ARM[0] * .8, forearmL: ARM[1] * .8, forearmR: ARM[1] * .8, thighL: LEG[0], thighR: LEG[0], shinL: LEG[1], shinR: LEG[1] };
    const bone = (name, start, end) => drawPart(ctx, image, parts[name], projected[start], projected[end], mirror, lengths[name] * pixelUnit);
    const arm = suffix => bone(`upperArm${suffix}`, `shoulder${suffix}`, `elbow${suffix}`);
    const leg = suffix => { bone(`thigh${suffix}`, `hip${suffix}`, `knee${suffix}`); bone(`shin${suffix}`, `knee${suffix}`, `ankle${suffix}`); };
    const hair = () => {
      const part = parts.hair;
      if (!part) return;
      const hairLength = view.hairLengthWorld || view.hairLength || part.hairLengthWorld || 180;
      const anchor = joints.neck;
      const tip = add(anchor, point(Math.sin(pose.hair) * hairLength, 0, -hairLength));
      const pivot = part.pivot || [part.rect[2] / 2, part.rect[3] * (SD_ANATOMY.head / hairLength)];
      // Hair metadata's real tip is its crown. A virtual downward endpoint
      // keeps the crown above the neck instead of rotating the hair upside down.
      const sourceTip = [pivot[0], part.rect[3] + pivot[1]];
      drawPart(ctx, image, { ...part, pivot, tip: sourceTip }, projectLocal(anchor), projectLocal(tip), mirror, hairLength * pixelUnit);
    };
    const far = pose.facing === 'right' ? 'R' : 'L', near = far === 'R' ? 'L' : 'R';
    if (pose.facing !== 'up') hair();
    leg(far); arm(far); leg(near);
    bone('body', 'pelvis', 'neck');
    arm(near);
    if (pose.facing === 'up') hair();
    bone('head', 'neck', 'headTop');
    // Large SD hair must not hide the toss hands or the spike/block gesture.
    // Hands keep this foreground layer throughout the clip, avoiding a switch
    // in draw order during the raise. Their dimensions still follow the rig.
    bone(`forearm${far}`, `elbow${far}`, `wrist${far}`);
    bone(`forearm${near}`, `elbow${near}`, `wrist${near}`);
    const crownRatio = headCrownExtent(view) / SD_ANATOMY.head;
    return { x: mix(projected.neck.x, projected.headTop.x, crownRatio), y: mix(projected.neck.y, projected.headTop.y, crownRatio) };
  }
}
