// Animation draws complete authored SD poses. No body part is rotated,
// stretched, repositioned or solved independently from the original drawing.
export const SPRITE_HEIGHT = 298;
export const SPRITE_TIMING = Object.freeze({ idle: 2, run: .72, toss: .65, spike: .72, block: .85, serve: .8, land: .28 });
export const SPRITE_CONTACT_PHASE = Object.freeze({ toss: .48, spike: .56, block: .48, serve: .52 });
export const CONTACT_PHASE = SPRITE_CONTACT_PHASE;
const ART_CLIPS = Object.freeze(['run', 'toss', 'spike', 'block']);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const smooth = value => value * value * (3 - 2 * value);
const contactClip = kind => ({ receive: 'toss', set: 'toss', return: 'spike', serve: 'serve', spike: 'spike', block: 'block' })[kind];

const animationURL = new URL('../assets/animation/manifest.json', import.meta.url);
let manifestPromise;
export function loadAnimationManifest() {
  if (!manifestPromise) manifestPromise = fetch(animationURL).then(async response => {
    if (!response.ok) throw new Error(`Animation manifest failed: ${response.status}`);
    const manifest = await response.json();
    if (!manifest.characters || !Object.keys(manifest.characters).length) throw new Error('Animation manifest has no characters');
    return manifest;
  }).catch(error => { manifestPromise = null; throw error; });
  return manifestPromise;
}

// The game requests just its current four players. This loader owns no decoded
// image cache; callers release outgoing sheets and abort superseded requests.
export async function loadAnimationAssets({ ids, manifest, signal } = {}) {
  manifest ||= await loadAnimationManifest();
  if (signal?.aborted) throw new DOMException('Animation loading cancelled', 'AbortError');
  const selected = [...new Set(ids ?? Object.keys(manifest.characters))];
  const allocated = [], pending = new Set(), images = {};
  const dispose = () => allocated.forEach(image => { image.onload = image.onerror = null; image.removeAttribute('src'); });
  const cancel = () => {
    dispose();
    for (const reject of pending) reject(new DOMException('Animation loading cancelled', 'AbortError'));
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    await Promise.all(selected.map(async id => {
      const character = manifest.characters[id];
      if (!character) throw new Error(`Animation character missing: ${id}`);
      const entries = await Promise.all(ART_CLIPS.map(clip => new Promise((resolve, reject) => {
        const metadata = character.clips[clip];
        if (!metadata) { reject(new Error(`Animation clip missing: ${id}/${clip}`)); return; }
        const image = new Image(); image.decoding = 'async'; allocated.push(image); pending.add(reject);
        const finish = (error) => {
          pending.delete(reject); image.onload = image.onerror = null;
          if (error) reject(error); else resolve([clip, image]);
        };
        image.onload = async () => {
          try {
            await image.decode();
            if (signal?.aborted) throw new DOMException('Animation loading cancelled', 'AbortError');
            finish();
          } catch (error) { finish(error); }
        };
        image.onerror = () => finish(new Error(`Animation sheet failed: ${id}/${clip}`));
        image.src = new URL(metadata.image, animationURL).href;
      })));
      images[id] = Object.fromEntries(entries);
    }));
    return { images, manifest };
  } catch (error) {
    dispose();
    for (const reject of pending) reject(error);
    throw error;
  } finally { signal?.removeEventListener('abort', cancel); }
}

function artClipFor(pose) {
  if (pose.clip === 'idle') return 'run';
  if (pose.clip === 'serve') return 'spike';
  if (pose.clip === 'land') return ART_CLIPS.includes(pose.recoveryClip) ? pose.recoveryClip : 'spike';
  return pose.clip;
}
function frameTimes(frames, clip) {
  if (clip === 'run') return frames.map((_, index) => index / frames.length);
  const contact = SPRITE_CONTACT_PHASE[clip] || SPRITE_CONTACT_PHASE.spike;
  const authored = [0, contact * .32, contact * .72, contact, contact + (1 - contact) * .45, contact + (1 - contact) * .82];
  return frames.map((frame, index) => Number.isFinite(frame.at) ? frame.at : authored[index] ?? index / Math.max(1, frames.length - 1));
}

// Keyframe times preserve the real contact pose at the moment the engine emits
// a hit. The short blend at other cut boundaries lasts at most 25 milliseconds.
export function sampleSpriteFrames(character, pose, { reducedMotion = false, frameFade = .025, frameElapsed } = {}) {
  const artClip = artClipFor(pose), sheet = character?.clips?.[artClip];
  const view = sheet?.views?.[pose.facing];
  const frames = Array.isArray(view) ? view : view?.frames;
  if (!frames?.length) return { artClip, frameIndex: -1, layers: [] };
  if (pose.clip === 'idle') return { artClip, frameIndex: 0, layers: [{ frame: frames[0], frameIndex: 0, artClip, weight: 1 }] };
  if (pose.clip === 'land') {
    const frameIndex = frames.length - 1;
    return { artClip, frameIndex, layers: [{ frame: frames[frameIndex], frameIndex, artClip, weight: 1 }] };
  }
  const phase = pose.clip === 'run' ? ((pose.phase % 1) + 1) % 1 : clamp(pose.phase, 0, 1);
  const times = frameTimes(frames, pose.clip);
  let frameIndex = 0;
  while (frameIndex < frames.length - 1 && phase >= times[frameIndex + 1]) frameIndex++;
  const frame = frames[frameIndex], previousIndex = frameIndex > 0 ? frameIndex - 1 : pose.clip === 'run' ? frames.length - 1 : 0;
  const elapsed = Number.isFinite(frameElapsed) ? Math.max(0, frameElapsed) : (phase - times[frameIndex]) * SPRITE_TIMING[pose.clip];
  const contact = SPRITE_CONTACT_PHASE[pose.clip];
  const atContact = contact !== undefined && Math.abs(times[frameIndex] - contact) < .00001;
  const weight = reducedMotion || frameFade <= 0 || previousIndex === frameIndex || atContact ? 1 : smooth(clamp(elapsed / frameFade, 0, 1));
  const layers = [];
  if (weight < 1) layers.push({ frame: frames[previousIndex], frameIndex: previousIndex, artClip, weight: 1 - weight });
  if (weight > 0) layers.push({ frame, frameIndex, artClip, weight });
  return { artClip, frameIndex, layers };
}

export class SpriteAnimator {
  constructor({ transition = .12, frameFade = .025, stride = 180 } = {}) {
    this.transition = transition; this.frameFade = frameFade; this.stride = stride;
    this.actors = new Map(); this.contacts = new Map(); this.composites = new Map();
  }
  clear() { this.actors.clear(); this.contacts.clear(); this.composites.clear(); }
  hit(event, stateTime) {
    if (event.type !== 'hit' || !Number.isFinite(event.actor) || !Number.isFinite(stateTime)) return;
    this.contacts.set(event.actor, { kind: event.kind, time: stateTime });
  }
  pose(actor, state, { reducedMotion = false } = {}) {
    const now = state.time || 0, index = actor.index ?? actor.id;
    let record = this.actors.get(index);
    if (!record || record.id !== actor.id || now < record.time) {
      record = { id: actor.id, x: actor.x, y: actor.y, time: now, runPhase: 0, clip: null, facing: null, phase: 0, changedAt: now, from: null, recoveryClip: 'spike' };
      this.actors.set(index, record);
    }
    const distance = Math.hypot(actor.x - record.x, actor.y - record.y);
    if (actor.moving > .08 && distance < 160) record.runPhase = (record.runPhase + distance / this.stride) % 1;
    record.x = actor.x; record.y = actor.y; record.time = now;
    const cached = this.contacts.get(index);
    const useCached = cached && cached.time > (actor.contactAt ?? -10);
    const contactAt = useCached ? cached.time : actor.contactAt ?? -10;
    const contactName = contactClip(useCached ? cached.kind : actor.contactKind);
    const contactAge = now - contactAt, landAge = now - (actor.landAt ?? -10);
    const actionAge = Math.max(0, now - (actor.actionAt ?? now));
    const active = state.phase === undefined || state.phase === 'rally' || state.phase === 'serve';
    let clip = active && actor.moving > .08 ? 'run' : 'idle';
    let phase = clip === 'run' ? record.runPhase : now / SPRITE_TIMING.idle;
    let confirmedContact = false;
    if (active && landAge >= 0 && landAge < SPRITE_TIMING.land && (actor.action === 'land' || landAge < contactAge)) {
      clip = 'land'; phase = landAge / SPRITE_TIMING.land;
    } else if (active && contactName && contactAge >= 0 && contactAge < SPRITE_TIMING[contactName] * (1 - SPRITE_CONTACT_PHASE[contactName])) {
      clip = contactName; phase = SPRITE_CONTACT_PHASE[clip] + contactAge / SPRITE_TIMING[clip];
      confirmedContact = true;
    } else if (active && state.phase === 'serve' && actor.index === (state.serving === 0 ? 0 : 2)) {
      clip = 'serve'; phase = Math.min(SPRITE_CONTACT_PHASE.serve - .05, actionAge / SPRITE_TIMING.serve);
    } else if (active && (actor.z > 1 || actor.jumpKind)) {
      clip = actor.jumpKind === 'block' ? 'block' : actor.jumpKind === 'toss' ? 'toss' : 'spike';
      if (contactName && contactAge >= 0 && contactAt >= (actor.actionAt ?? now) - .000001) {
        // This jump already connected. Its recovery ends in the final drawing
        // until landing; remaining airtime must not restart the preparation.
        clip = contactName; phase = 1;
      } else {
        // A newer jump's actionAt is later than the preceding contact, so its
        // preparation waits for its own real hit rather than reusing that hit.
        phase = Math.min(SPRITE_CONTACT_PHASE[clip] - .07, actionAge / SPRITE_TIMING[clip]);
      }
    } else if (active && state.charging && actor.index === 0) {
      clip = 'spike'; phase = Math.min(.42, actionAge / SPRITE_TIMING.spike);
    }
    const facing = actor.facing || (actor.team === 0 ? 'up' : 'down');
    if (clip !== record.clip || facing !== record.facing) {
      record.from = record.clip ? { clip: record.clip, phase: record.phase, facing: record.facing, recoveryClip: record.recoveryClip } : null;
      record.changedAt = now;
    }
    if (ART_CLIPS.includes(clip) && clip !== 'run') record.recoveryClip = clip;
    else if (clip === 'serve') record.recoveryClip = 'spike';
    record.clip = clip; record.facing = facing; record.phase = phase;
    // A confirmed contact shows the contact drawing on this very frame, even
    // when the engine receives the ball straight from a neutral/moving pose.
    if (confirmedContact) { record.from = null; record.changedAt = now - this.transition; }
    const transitionWeight = confirmedContact || reducedMotion || this.transition <= 0 ? 1 : smooth(clamp((now - record.changedAt) / this.transition, 0, 1));
    if (cached && now - cached.time > 1) this.contacts.delete(index);
    return { clip, phase, facing, runPhase: record.runPhase, recoveryClip: record.recoveryClip, previous: transitionWeight < 1 ? record.from : null, transitionWeight };
  }
  draw(ctx, actor, state, { images, character, project, reducedMotion = false }) {
    const pose = this.pose(actor, state, { reducedMotion });
    let current = sampleSpriteFrames(character, pose, { reducedMotion, frameFade: this.frameFade });
    const record = this.actors.get(actor.index ?? actor.id);
    if (record && pose.clip === 'run') {
      const key = `${pose.facing}/${current.frameIndex}`, now = state.time || 0;
      if (record.runFadeKey !== key) { record.runFadeKey = key; record.runFadeAt = now; }
      // Travel chooses the drawing; elapsed simulation time completes its
      // blend even when a held stick reaches the court boundary and stops.
      current = sampleSpriteFrames(character, pose, { reducedMotion, frameFade: this.frameFade, frameElapsed: now - record.runFadeAt });
    } else if (record) record.runFadeKey = null;
    let layers = current.layers;
    if (pose.previous && pose.transitionWeight < 1) {
      // During a clip/direction change, blend exactly two complete poses.
      // Suppress the cut blend here to avoid three/four-body ghost trails.
      const previous = sampleSpriteFrames(character, pose.previous, { reducedMotion: true });
      const from = previous.layers.at(-1), to = sampleSpriteFrames(character, pose, { reducedMotion: true }).layers.at(-1);
      layers = [];
      if (from && pose.transitionWeight < 1) layers.push({ ...from, weight: 1 - pose.transitionWeight });
      if (to && pose.transitionWeight > 0) layers.push({ ...to, weight: pose.transitionWeight });
    }
    const base = project(actor.x, actor.y, actor.z || 0);
    const crown = project(actor.x, actor.y, (actor.z || 0) + SPRITE_HEIGHT);
    const bodyHeightPx = Math.hypot(crown.x - base.x, crown.y - base.y);
    const breath = !reducedMotion && pose.clip === 'idle' ? Math.sin((state.time || 0) * Math.PI) * Math.min(.45, bodyHeightPx * .003) : 0;
    let lastScale = 0;
    const parentAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
    const draws = [];
    for (const layer of layers) {
      const image = images?.[layer.artClip], frame = layer.frame;
      if (!image?.naturalWidth || !frame?.rect || !frame?.pivot || !(frame.bodyHeight > 0) || layer.weight <= 0) continue;
      const [sx, sy, sw, sh] = frame.rect, [px, py] = frame.pivot;
      const scale = bodyHeightPx / frame.bodyHeight;
      draws.push({ image, weight: layer.weight, args: [sx, sy, sw, sh, base.x - px * scale, base.y - py * scale + breath, sw * scale, sh * scale] });
      lastScale = scale;
    }
    const drawCount = draws.length;
    const compositeDrawCount = drawCount > 1 && this.drawComposite(ctx, actor.index ?? actor.id, draws, parentAlpha) ? 1 : 0;
    if (!compositeDrawCount) for (const draw of draws) {
      ctx.save(); ctx.globalAlpha = parentAlpha * draw.weight;
      ctx.drawImage(draw.image, ...draw.args); ctx.restore();
    }
    return { x: crown.x, y: crown.y + breath, clip: pose.clip, phase: pose.phase, frameIndex: current.frameIndex, drawCount, compositeDrawCount, bodyHeightPx, scale: lastScale };
  }
  drawComposite(ctx, index, draws, parentAlpha) {
    let entry = this.composites.get(index);
    if (!entry) {
      const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : typeof document !== 'undefined' ? document.createElement('canvas') : null;
      const context = canvas?.getContext('2d');
      // Pure Node fixtures deliberately have no browser canvas implementation.
      if (!context?.setTransform || !context.clearRect || !context.drawImage) return false;
      entry = { canvas, context }; this.composites.set(index, entry);
    }
    const minX = Math.floor(Math.min(...draws.map(draw => draw.args[4]))), minY = Math.floor(Math.min(...draws.map(draw => draw.args[5])));
    const maxX = Math.ceil(Math.max(...draws.map(draw => draw.args[4] + draw.args[6]))), maxY = Math.ceil(Math.max(...draws.map(draw => draw.args[5] + draw.args[7])));
    const transform = ctx.getTransform?.();
    const transformedRatio = Number.isFinite(transform?.a) && Number.isFinite(transform?.b) ? Math.hypot(transform.a, transform.b) : globalThis.devicePixelRatio || 1;
    const ratio = Math.max(1, Math.min(2, transformedRatio));
    const width = Math.max(1, Math.ceil((maxX - minX) * ratio / 32) * 32), height = Math.max(1, Math.ceil((maxY - minY) * ratio / 32) * 32);
    const { canvas, context } = entry;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, width, height);
    context.setTransform(ratio, 0, 0, ratio, -minX * ratio, -minY * ratio);
    for (let index = 0; index < draws.length; index++) {
      const draw = draws[index];
      // Premultiplied addition produces a true weighted crossfade. Overlapping
      // opaque face/eye pixels stay opaque rather than dipping to 75% at .5/.5.
      context.globalCompositeOperation = index === 0 ? 'source-over' : 'lighter';
      context.globalAlpha = draw.weight; context.drawImage(draw.image, ...draw.args);
    }
    context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1;
    ctx.save(); ctx.globalAlpha = parentAlpha;
    ctx.drawImage(canvas, 0, 0, width, height, minX, minY, width / ratio, height / ratio); ctx.restore();
    return true;
  }
}
