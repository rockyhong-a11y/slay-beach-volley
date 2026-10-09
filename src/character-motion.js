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
const ARM = [70, 80], LEG = [46, 51];

export const MOTION_TIMING = Object.freeze({ idle: 2, run: .72, toss: .65, spike: .72, block: .85, serve: .8, land: .28 });
export const CONTACT_PHASE = Object.freeze({ toss: .48, spike: .56, block: .48, serve: .52 });
export const FACING_BASIS = Object.freeze({
  down: { side: [1, 0], forward: [0, 1] },
  up: { side: [-1, 0], forward: [0, -1] },
  left: { side: [0, -1], forward: [-1, 0] },
  right: { side: [0, 1], forward: [1, 0] },
});

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

const REST = { pelvis: 124, lean: 0, twist: 0, lx: 0, head: 0, wl: [-50, 8, 95], wr: [50, 8, 95], fl: [-22, 0, 0], fr: [22, 0, 0] };
const k = (at, changes) => ({ at, ...REST, ...changes });
// Each sequence has its own anatomical preparation, contact and recovery.
const KEYS = {
  toss: [k(0, { pelvis: 113, wl: [-42, 16, 176], wr: [42, 16, 176] }), k(.2, { pelvis: 117, lean: 4, wl: [-22, 9, 238], wr: [22, 9, 238] }), k(.48, { pelvis: 124, lean: 6, wl: [-13, 8, 295], wr: [13, 8, 295], fl: [-24, -12, 14], fr: [24, -12, 14] }), k(.65, { pelvis: 125, lean: 8, wl: [-19, 13, 309], wr: [19, 13, 309], fl: [-25, -8, 12], fr: [25, -8, 12] }), k(1, {})],
  spike: [k(0, { pelvis: 113, lean: 8, wl: [-45, 20, 188], wr: [61, -14, 219] }), k(.24, { pelvis: 122, lean: -8, twist: -.22, wl: [-40, 26, 268], wr: [58, -30, 281], fl: [-24, -20, 25], fr: [24, -28, 30] }), k(.42, { pelvis: 126, lean: -5, twist: -.32, wl: [-33, 30, 248], wr: [46, -38, 305], fl: [-24, -28, 26], fr: [24, -20, 35] }), k(.56, { pelvis: 125, lean: 10, twist: .2, wl: [-44, 20, 229], wr: [23, 25, 330], fl: [-27, -20, 20], fr: [27, -30, 26] }), k(.72, { pelvis: 121, lean: 22, twist: .32, wl: [-39, 2, 197], wr: [32, 62, 228], fl: [-25, -13, 16], fr: [25, -15, 20] }), k(1, {})],
  block: [k(0, { pelvis: 112, wl: [-34, 4, 215], wr: [34, 4, 215] }), k(.24, { pelvis: 121, wl: [-31, 10, 278], wr: [31, 10, 278], fl: [-23, -13, 17], fr: [23, -13, 17] }), k(.48, { pelvis: 125, lean: 5, wl: [-34, 12, 330], wr: [34, 12, 330], fl: [-25, -18, 21], fr: [25, -18, 21] }), k(.72, { pelvis: 124, lean: 8, wl: [-35, 16, 326], wr: [35, 16, 326], fl: [-25, -10, 13], fr: [25, -10, 13] }), k(1, { pelvis: 120, wl: [-43, 12, 170], wr: [43, 12, 170] })],
  serve: [k(0, { pelvis: 120, lean: -3, wl: [-28, 37, 219], wr: [49, -25, 206] }), k(.23, { pelvis: 124, twist: -.2, wl: [-19, 26, 286], wr: [45, -30, 274] }), k(.52, { pelvis: 125, lean: 10, twist: .2, wl: [-44, 14, 229], wr: [23, 27, 330] }), k(.73, { pelvis: 121, lean: 20, twist: .27, wl: [-48, 12, 170], wr: [33, 56, 204] }), k(1, {})],
  land: [k(0, { pelvis: 122, lean: 8, wl: [-56, 8, 140], wr: [56, 8, 140], fl: [-28, -8, 5], fr: [28, -8, 5] }), k(.27, { pelvis: 95, lean: 14, wl: [-56, 15, 105], wr: [56, 15, 105], fl: [-31, 5, 0], fr: [31, 5, 0] }), k(.62, { pelvis: 112, lean: 8, wl: [-52, 11, 120], wr: [52, 11, 120] }), k(1, {})],
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
    const relaxed = smooth(clamp((shoulder.z - wrist.z - 40) / 20, 0, 1));
    const armPole = point(sign * mix(90, 26, relaxed), mix(-12, 52, relaxed), mix(-18, -30, relaxed));
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
    settings = { ...REST, pelvis: 116 + Math.cos(phase * TAU * 2) * 2, lean: 10, twist: swing * .12, wl: [-47, -32 * swing, 105 + swing * 12], wr: [47, 32 * swing, 105 - swing * 12], fl: foot(phase, -23), fr: foot(phase + .5, 23) };
  } else if (name === 'idle') {
    const breath = Math.sin(phase * TAU);
    settings = { ...REST, pelvis: 124 + breath * .8, lean: Math.cos(phase * TAU) * .7, wl: [-50, 8, 95 + breath * .8], wr: [50, 8, 95 + breath * .8] };
  } else settings = interpolateKeys(KEYS[name] || KEYS.toss, phase);
  // Equal head / torso / leg proportions match the generated SD anatomy.
  // The authored preparations remain relative to their original pelvis keys.
  const { lean, twist, lx, head } = settings, pelvis = settings.pelvis - 27;
  const joints = { pelvis: point(lx, 0, pelvis), neck: point(lx, lean, pelvis + 94), headTop: point(lx + head, lean, pelvis + 188) };
  for (const [suffix, sign, hand, foot] of [['L', -1, settings.wl, settings.fl], ['R', 1, settings.wr, settings.fr]]) {
    joints[`shoulder${suffix}`] = point(lx + sign * 37 * Math.cos(twist), lean + sign * 37 * Math.sin(twist), pelvis + 84);
    joints[`hip${suffix}`] = point(lx + sign * 20, 0, pelvis - 1);
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

function drawPart(ctx, image, part, a, b, mirror = false) {
  if (!part?.rect || !image) return;
  mirror = part.mirror ?? mirror;
  const [sx, sy, width, height] = part.rect;
  const pivot = part.pivot || [width / 2, height * .97], tip = part.tip || [width / 2, height * .03];
  const sourceX = (tip[0] - pivot[0]) * (mirror ? -1 : 1), sourceY = tip[1] - pivot[1];
  const scale = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, Math.hypot(sourceX, sourceY));
  ctx.save(); ctx.translate(a.x, a.y);
  ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(sourceY, sourceX));
  ctx.scale(mirror ? -scale : scale, scale);
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
    const bone = (name, start, end) => drawPart(ctx, image, parts[name], projected[start], projected[end], mirror);
    const arm = suffix => { bone(`upperArm${suffix}`, `shoulder${suffix}`, `elbow${suffix}`); bone(`forearm${suffix}`, `elbow${suffix}`, `wrist${suffix}`); };
    const leg = suffix => { bone(`thigh${suffix}`, `hip${suffix}`, `knee${suffix}`); bone(`shin${suffix}`, `knee${suffix}`, `ankle${suffix}`); };
    const hair = () => {
      const part = parts.hair;
      if (!part) return;
      const hairLength = view.hairLengthWorld || view.hairLength || part.hairLengthWorld || 180;
      const anchor = point(joints.neck.x, joints.neck.y, 190 + joints.pelvis.z - 97);
      const tip = add(anchor, point(Math.sin(pose.hair) * hairLength, 0, -hairLength));
      const pivot = part.pivot || [part.rect[2] / 2, part.rect[3] * (95 / hairLength)];
      // Hair metadata's real tip is its crown. A virtual downward endpoint
      // keeps the crown above the neck instead of rotating the hair upside down.
      const sourceTip = [pivot[0], part.rect[3] + pivot[1]];
      drawPart(ctx, image, { ...part, pivot, tip: sourceTip }, projectLocal(anchor), projectLocal(tip), mirror);
    };
    const far = pose.facing === 'right' ? 'R' : 'L', near = far === 'R' ? 'L' : 'R';
    if (pose.facing !== 'up') hair();
    leg(far); arm(far); leg(near);
    bone('body', 'pelvis', 'neck');
    arm(near);
    if (pose.facing === 'up') hair();
    bone('head', 'neck', 'headTop');
    return projected.headTop;
  }
}
