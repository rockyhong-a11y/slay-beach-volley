// Contact sparks use short silhouettes and directional streaks rather than a
// screen flash. Anchors stay in world space so an orientation change is safe.
const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const PALETTE = Object.freeze({
  lift: { main: '#39e0bb', edge: '#075b59', light: '#effff1', accent: '#a7ffe0' },
  set: { main: '#ffd574', edge: '#79502a', light: '#fffbea', accent: '#43e9c4' },
  strike: { main: '#ffa148', edge: '#823820', light: '#fffce4', accent: '#ffcc70' },
  shield: { main: '#55ebef', edge: '#075975', light: '#edffff', accent: '#8ecaff' },
});

export const IMPACT_LIMITS = Object.freeze({ bursts: 12, particles: 128, trailPoints: 18, maximumLife: .55 });

function familyFor(kind) {
  if (kind === 'spike') return 'strike';
  if (kind === 'block') return 'shield';
  if (kind === 'set') return 'set';
  if (kind === 'serve' || kind === 'receive' || kind === 'return' || kind === 'toss') return 'lift';
  return null;
}

function polygon(ctx, points, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) i ? ctx.lineTo(...points[i]) : ctx.moveTo(...points[i]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function stroked(ctx, color, edge, width, trace) {
  ctx.beginPath(); trace();
  ctx.strokeStyle = edge; ctx.lineWidth = width + 1.7; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function direction(effect, point, project) {
  // First project the physical outgoing velocity; the renderer can have any
  // perspective, including a real 3D camera projecting sprites into Canvas2D.
  if (Math.hypot(effect.vx, effect.vy, effect.vz) > 1) {
    const next = project(effect.x + effect.vx * .05, effect.y + effect.vy * .05, effect.z + effect.vz * .05);
    if (Number.isFinite(next.x) && Number.isFinite(next.y) && Math.hypot(next.x - point.x, next.y - point.y) > .01) return Math.atan2(next.y - point.y, next.x - point.x);
  }
  return (effect.actor ?? 0) < 2 ? -Math.PI / 2 : Math.PI / 2;
}

function particlesFor(family, perfect, reducedMotion) {
  const count = reducedMotion ? (family === 'strike' || family === 'shield' ? 4 : 2) : family === 'strike' ? (perfect ? 22 : 17) : family === 'shield' ? 15 : family === 'set' ? 10 : 7;
  const palette = PALETTE[family];
  return Array.from({ length: count }, (_, i) => {
    const a = family === 'strike' ? (i / Math.max(1, count - 1) - .5) * 2.4 : family === 'shield' ? (i * 2.39996 + .7) : i * 2.39996;
    return { angle: a, speed: 55 + (i * 37 % 83), length: family === 'strike' ? 9 + i % 4 * 3 : 3 + i % 3 * 2, width: 1.2 + i % 3 * .55, color: i % 3 === 0 ? palette.light : i % 2 ? palette.main : palette.accent, delay: i % 4 * .008 };
  });
}

export class ImpactEffects {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.bursts = [];
  }

  get particleCount() { return this.bursts.reduce((sum, burst) => sum + burst.particles.length, 0); }

  burst(event) {
    if (event.type !== 'hit' || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return false;
    const family = familyFor(event.kind);
    if (!family) return false;
    const reducedMotion = this.reducedMotion;
    const effect = {
      kind: event.kind, family, perfect: Boolean(event.perfect), actor: event.actor,
      x: event.x, y: event.y, z: Number.isFinite(event.z) ? event.z : 0,
      vx: Number.isFinite(event.vx) ? event.vx : 0,
      vy: Number.isFinite(event.vy) ? event.vy : 0,
      vz: Number.isFinite(event.vz) ? event.vz : 0,
      age: 0, life: reducedMotion ? .24 : family === 'set' ? .55 : family === 'lift' ? .46 : family === 'shield' ? .44 : .42,
      particles: particlesFor(family, event.perfect, reducedMotion),
    };
    this.bursts.push(effect);
    while (this.bursts.length > IMPACT_LIMITS.bursts || this.particleCount > IMPACT_LIMITS.particles) this.bursts.shift();
    return true;
  }

  clear() { this.bursts.length = 0; }

  draw(ctx, dt, { project, width = 360, height = 580, reducedMotion = this.reducedMotion } = {}) {
    if (typeof project !== 'function') return;
    this.reducedMotion = reducedMotion;
    const delta = clamp(Number.isFinite(dt) ? dt : 0, 0, 1);
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const effect = this.bursts[i]; effect.age += delta;
      if (effect.age >= effect.life) { this.bursts.splice(i, 1); continue; }
      const p = project(effect.x, effect.y, effect.z);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const size = clamp(width / 360, .72, 1.9) * clamp(p.scale ?? 1, .8, 1.25);
      const extent = 145 * size;
      if (p.x < -extent || p.x > width + extent || p.y < -extent || p.y > height + extent) continue;
      const q = effect.age / effect.life;
      const motionQ = reducedMotion ? .3 : q;
      const palette = PALETTE[effect.family];
      const angle = direction(effect, p, project);
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(size, size); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = (1 - q) ** .7;
      if (effect.family === 'lift') this.lift(ctx, motionQ, palette, reducedMotion);
      else if (effect.family === 'set') this.set(ctx, motionQ, palette, reducedMotion);
      else if (effect.family === 'shield') this.shield(ctx, motionQ, palette, reducedMotion);
      else this.strike(ctx, effect.age, motionQ, palette, angle, effect.perfect, reducedMotion);
      this.drawParticles(ctx, effect, angle, reducedMotion);
      ctx.restore();
    }
  }

  lift(ctx, q, palette, reducedMotion) {
    const r = 17 + q * 27, lift = reducedMotion ? 4 : q * 24;
    // A broad lower crescent opens upward, visibly different from a spike.
    stroked(ctx, palette.main, palette.edge, 3.7 * (1 - q) + .8, () => {
      ctx.ellipse(0, -lift, r, r * .57, 0, .08, Math.PI - .08);
    });
    ctx.strokeStyle = palette.light; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(0, -lift + 2, r - 4, r * .38, 0, .18, Math.PI - .18); ctx.stroke();
    ctx.globalAlpha *= .65;
    for (let i = 0; i < (reducedMotion ? 1 : 2); i++) {
      const ry = 5 + q * 9 + i * 4;
      ctx.beginPath(); ctx.ellipse(0, 10 + i * 8 - lift * .25, 12 + q * 22 + i * 4, ry, 0, 0, TAU); ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.6 - i * .3; ctx.stroke();
    }
  }

  set(ctx, q, palette, reducedMotion) {
    const lift = reducedMotion ? 6 : q * 29, r = 19 + q * 18;
    // Opposed gold/teal ribbons form a helix that leads the eye into the toss.
    for (let i = 0; i < 2; i++) {
      ctx.save(); ctx.translate(0, -lift - i * 5); ctx.rotate((reducedMotion ? .25 : q * 2.2) + i * Math.PI);
      stroked(ctx, i ? palette.accent : palette.main, i ? '#076a60' : palette.edge, 3.8 * (1 - q) + 1, () => {
        ctx.ellipse(0, 0, r, r * .6, -.35, -.7, 2.7);
      }); ctx.restore();
    }
    ctx.strokeStyle = palette.light; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(-8, 10); ctx.quadraticCurveTo(-13, -7 - lift * .2, -4, -24 - lift); ctx.moveTo(8, 10); ctx.quadraticCurveTo(14, -6 - lift * .2, 6, -20 - lift); ctx.stroke();
  }

  strike(ctx, age, q, palette, angle, perfect, reducedMotion) {
    ctx.save(); ctx.rotate(angle);
    const peak = reducedMotion ? .7 : 1 + Math.sin(Math.min(1, age / .095) * Math.PI) * .2;
    if (age < (reducedMotion ? .24 : .19)) {
      const rays = perfect ? 9 : 7, reach = (perfect ? 43 : 33) * peak * (1 - q * .6);
      const points = [];
      for (let i = 0; i < rays * 2; i++) {
        const a = i / (rays * 2) * TAU, r = i % 2 ? 8 : reach * (i % 4 === 0 ? 1.5 : .82);
        points.push([Math.cos(a) * r * 1.22, Math.sin(a) * r * .82]);
      }
      polygon(ctx, points, palette.main, palette.edge, 1.4);
      ctx.scale(.7, .7); polygon(ctx, points, palette.light, null); ctx.scale(1 / .7, 1 / .7);
    }
    // Fast attack and release: a broken, skewed shockwave, then directional
    // speed lines. No whole-canvas compositing or full-screen flash.
    const ring = 11 + Math.sqrt(q) * (perfect ? 48 : 36);
    ctx.globalAlpha *= .8;
    stroked(ctx, palette.accent, palette.edge, 2.5 * (1 - q) + .3, () => {
      ctx.ellipse(5 + q * 11, 0, ring, ring * .53, -.18, -.3, 2.7);
      ctx.ellipse(5 + q * 11, 0, ring * .9, ring * .5, -.18, 3.15, 5.6);
    });
    if (!reducedMotion) {
      for (let i = -1; i <= 1; i++) {
        const start = 8 + q * 17, end = start + (perfect ? 68 : 51) * (1 - q), side = i * (8 + q * 10);
        polygon(ctx, [[start, side - 2], [end, side * 1.7], [start + 9, side + 2]], i === 0 ? palette.light : palette.main, null);
      }
      if (perfect && age < .075) {
        ctx.globalAlpha *= .6 * (1 - age / .075); ctx.strokeStyle = palette.light; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, 0, 24 + q * 24, 20 + q * 20, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
  }

  shield(ctx, q, palette, reducedMotion) {
    const radius = 22 + q * 24;
    for (let echo = 0; echo < (reducedMotion ? 1 : 2); echo++) {
      const r = radius + echo * 9;
      const hex = Array.from({ length: 6 }, (_, i) => { const a = i / 6 * TAU - Math.PI / 2; return [Math.cos(a) * r * .82, Math.sin(a) * r]; });
      ctx.globalAlpha *= echo ? .46 : .95;
      polygon(ctx, hex, null, palette.edge, echo ? 3.1 : 5);
      polygon(ctx, hex, null, echo ? palette.accent : palette.main, echo ? 1.2 : 3);
    }
    // A pair of crisp rebound arcs and a vertical bar read as a block rather
    // than a hit, while the open middle leaves the volleyball readable.
    ctx.strokeStyle = palette.light; ctx.lineWidth = 2.6 * (1 - q) + 1;
    ctx.beginPath(); ctx.moveTo(-10, -16); ctx.lineTo(-10, 16); ctx.moveTo(10, -16); ctx.lineTo(10, 16); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, radius * .63, -.55, .55); ctx.arc(0, 0, radius * .63, Math.PI - .55, Math.PI + .55); ctx.stroke();
  }

  drawParticles(ctx, effect, angle, reducedMotion) {
    const palette = PALETTE[effect.family], age = effect.age;
    const count = reducedMotion ? Math.min(4, effect.particles.length) : effect.particles.length;
    ctx.save();
    // Toss flecks lift vertically; strike streaks follow the outgoing ball.
    ctx.rotate(effect.family === 'strike' || effect.family === 'shield' ? angle : -Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const particle = effect.particles[i], t = Math.max(0, age - particle.delay), q = age / effect.life;
      const a = particle.angle, distance = reducedMotion ? 26 : 8 + particle.speed * t;
      let x = Math.cos(a) * distance, y = Math.sin(a) * distance;
      if (effect.family === 'lift' || effect.family === 'set') { x += reducedMotion ? 0 : t * 37; y *= .6; }
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha *= (1 - q) ** .6;
      const length = particle.length * (1 - q * .55);
      polygon(ctx, [[-length, 0], [1, -particle.width], [length * .55, 0], [1, particle.width]], particle.color, palette.edge, .5);
      ctx.restore();
    }
    ctx.restore();
  }

  drawTrail(ctx, points, { project, width = 360, reducedMotion = this.reducedMotion } = {}) {
    if (reducedMotion || typeof project !== 'function' || points.length < 2) return;
    const first = Math.max(0, points.length - IMPACT_LIMITS.trailPoints), count = points.length - first;
    const size = clamp(width / 360, .72, 1.9);
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = first + 1; i < points.length; i++) {
      const a = project(points[i - 1].x, points[i - 1].y, points[i - 1].z), b = project(points[i].x, points[i].y, points[i].z);
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
      const q = (i - first) / count, hot = points[i].hot > .3;
      ctx.globalAlpha = q * q * (hot ? .77 : .4);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = hot ? '#ff9750' : '#7ee9d3'; ctx.lineWidth = (hot ? 9 : 3.6) * q * size; ctx.stroke();
      if (hot) { ctx.globalAlpha *= .8; ctx.strokeStyle = '#fff9d4'; ctx.lineWidth = 3 * q * size; ctx.stroke(); }
    }
    ctx.restore();
  }
}
