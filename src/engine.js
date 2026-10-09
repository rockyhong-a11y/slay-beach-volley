import { characterFor } from './roster.js';

export const WORLD = Object.freeze({ width: 1000, depth: 1200, net: 600, netHeight: 230, gravity: 980 });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const teamAt = y => y >= WORLD.net ? 0 : 1;

export function createMatch({ character = 'nova', partner = 'seraph', opponents = ['raven', 'valkyrie'], difficulty = 1, targetScore = 7, assist = true, autoplay = false, training = false, seed = Date.now() } = {}) {
  const ids = [character, partner, ...opponents];
  const homes = [{ x: 335, y: 975 }, { x: 685, y: 790 }, { x: 685, y: 225 }, { x: 315, y: 410 }];
  return {
    phase: 'ready', phaseTimer: 1.5, time: 0, score: [0, 0], targetScore, difficulty, assist, autoplay, training,
    remaining: 60, seed: seed >>> 0, serving: 0, possession: 0, touches: 0, lastActor: -1, receiver: 0,
    actors: ids.map((id, index) => ({ id, team: index < 2 ? 0 : 1, index, ...homes[index], home: { ...homes[index] }, z: 0, vz: 0, moving: 0, pose: 0, poseTime: 0, cooldown: 0, miss: false })),
    ball: { x: 335, y: 975, z: 170, vx: 0, vy: 0, vz: 0, spin: 0, hot: 0 },
    events: [], rally: 0, freeze: 0, charge: 0, charging: false, swingBuffer: 0, jumpBuffer: 0, manualUntil: 0,
    stats: { spikes: 0, perfects: 0, longestRally: 0, points: 0, blocks: 0 }, winner: null, lastPoint: null,
    aiTimer: 0, handler: 0, bounce: 0,
  };
}

export function random(state) {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

export function predictLanding(ball, height = 0) {
  const discriminant = ball.vz ** 2 + 2 * WORLD.gravity * (ball.z - height);
  const time = Math.max(0, discriminant >= 0 ? (ball.vz + Math.sqrt(discriminant)) / WORLD.gravity : ball.vz / WORLD.gravity);
  return { x: ball.x + ball.vx * time, y: ball.y + ball.vy * time, time };
}

function aim(state, x, y, duration, endHeight = 115) {
  const ball = state.ball;
  ball.vx = (x - ball.x) / duration;
  ball.vy = (y - ball.y) / duration;
  ball.vz = (endHeight - ball.z + 0.5 * WORLD.gravity * duration ** 2) / duration;
}

function jump(state, actor) {
  if (actor.z > 1 || actor.cooldown > 0.24 || state.phase !== 'rally') return false;
  actor.vz = 560 + characterFor(actor.id).jump * 28;
  actor.pose = 1;
  actor.poseTime = 0.8;
  state.events.push({ type: 'jump', actor: actor.index, x: actor.x, y: actor.y });
  return true;
}

export function requestJump(state) {
  if (state.phase !== 'rally') return false;
  state.jumpBuffer = 0.18;
  return true;
}

export function beginCharge(state) {
  if (state.phase === 'serve') { serve(state); return; }
  if (state.phase !== 'rally') return;
  state.charging = true;
  state.charge = 0;
}

export function releaseSpike(state) {
  state.charging = false;
  if (state.phase === 'serve') { serve(state); return; }
  if (state.phase !== 'rally') return;
  state.swingBuffer = 0.3;
  state.actors[0].pose = 1;
  state.actors[0].poseTime = 0.32;
}

function updateHandler(state) {
  const team = state.possession;
  const indices = team === 0 ? [0, 1] : [2, 3];
  if (state.touches === 0) {
    const landing = predictLanding(state.ball, 130);
    // A receiver commits to an incoming ball; the partner covers the other lane.
    state.handler = indices.reduce((best, index) => distance(state.actors[index], landing) < distance(state.actors[best], landing) ? index : best, indices[0]);
    state.receiver = state.handler;
  } else if (state.touches === 1) state.handler = indices.find(index => index !== state.lastActor);
  else state.handler = state.receiver;
  state.actors.forEach(actor => { actor.miss = false; });
  if (!state.autoplay && !state.training) {
    // Longer rallies get harder. A manual swing can rescue a missed assisted receive.
    const fatigue = Math.max(0, state.rally - 4) * 0.018;
    const base = state.handler >= 2 ? [0.16, 0.095, 0.04][clamp(state.difficulty, 0, 2)] : [0.03, 0.05, 0.075][clamp(state.difficulty, 0, 2)];
    const missChance = Math.min(0.45, base + fatigue);
    state.actors[state.handler].miss = random(state) < missChance;
  }
}

function serve(state) {
  const index = state.serving === 0 ? 0 : 2;
  const server = state.actors[index];
  state.ball.x = server.x;
  state.ball.y = server.y;
  state.ball.z = 185;
  const targetX = 200 + random(state) * 600;
  const targetY = state.serving === 0 ? 260 + random(state) * 150 : 800 + random(state) * 180;
  aim(state, targetX, targetY, 1.5, 100);
  state.ball.hot = 0;
  state.possession = 1 - state.serving;
  state.touches = 0;
  state.lastActor = index;
  state.phase = 'rally';
  state.rally = 0;
  server.pose = 1;
  server.poseTime = 0.45;
  state.events.push({ type: 'hit', kind: 'serve', actor: index, x: server.x, y: server.y, z: 185 });
  updateHandler(state);
}

export function awardPoint(state, team, reason = 'ground') {
  if (state.phase !== 'rally') return;
  if (!state.training) state.score[team]++;
  if (team === 0) state.stats.points++;
  state.stats.longestRally = Math.max(state.stats.longestRally, state.rally);
  state.lastPoint = { team, reason };
  state.events.push({ type: 'point', team, reason, x: state.ball.x, y: state.ball.y, z: state.ball.z });
  state.phase = 'point';
  state.phaseTimer = 1.65;
  state.serving = team;
  state.ball.vx = state.ball.vy = state.ball.vz = 0;
  state.charging = false;
  state.charge = 0;
  if (!state.training && state.score[team] >= state.targetScore) {
    state.winner = team;
    state.phase = 'finished';
    state.events.push({ type: 'finish', winner: team });
  }
}

function touch(state, actor, { spike = false, manual = false } = {}) {
  const ball = state.ball;
  if (state.lastActor === actor.index && state.touches > 0) return false;
  if (actor.cooldown > 0 || actor.miss && !manual) return false;
  const range = manual ? actor.id === 'valkyrie' ? 230 : 205 : actor.id === 'lynx' ? 165 : 145;
  const handHeight = actor.z + (spike ? 205 : 160);
  if (distance(actor, ball) > range || ball.z > handHeight + (manual ? 115 : 35) || ball.z < actor.z - 50) return false;
  if (spike && ball.z < 95) return false;
  if (!spike && ball.vz > 40) return false;

  const block = manual && spike && actor.z > 25 && Math.abs(actor.y - WORLD.net) < 155 && state.touches === 0 && state.lastActor >= 0 && state.actors[state.lastActor].team !== actor.team;
  if (actor.team !== state.possession) {
    state.possession = actor.team;
    state.touches = 0;
  }
  state.touches++;
  state.lastActor = actor.index;
  state.rally++;
  state.stats.longestRally = Math.max(state.stats.longestRally, state.rally);
  actor.cooldown = 0.48;
  actor.pose = 1;
  actor.poseTime = 0.42;
  let kind;
  let perfect = false;
  if (spike || state.touches >= 3) {
    const air = actor.z > 25;
    perfect = manual && air && Math.abs(ball.z - handHeight) < 90 && ball.vz < 0;
    const power = characterFor(actor.id).power;
    kind = block ? 'block' : spike && air ? 'spike' : 'return';
    const opponent = state.actors.filter(other => other.team !== actor.team);
    // Aim at an open lateral lane, with a little seed-controlled variation.
    const leftCoverage = Math.min(...opponent.map(other => Math.abs(other.x - 170)));
    const rightCoverage = Math.min(...opponent.map(other => Math.abs(other.x - 830)));
    let targetX = leftCoverage > rightCoverage ? 180 : 820;
    targetX += (random(state) - 0.5) * (actor.id === 'viper' ? 35 : 110);
    const targetY = actor.team === 0 ? 120 + random(state) * 230 : 920 + random(state) * 170;
    let duration = kind === 'spike' || block ? Math.max(0.48, 0.94 - power * 0.035 - (perfect ? 0.1 : 0) - (manual ? state.charge * .1 : 0)) : 1.65;
    aim(state, targetX, targetY, duration, kind === 'spike' || block ? 15 : 100);
    ball.hot = kind === 'spike' || block ? perfect ? 1 : 0.6 : 0;
    if (manual && (kind === 'spike' || block)) {
      if (block) state.stats.blocks++; else state.stats.spikes++;
      if (perfect) state.stats.perfects++;
      state.freeze = perfect ? 0.065 : 0.04;
    }
    state.possession = 1 - actor.team;
    state.touches = 0;
    updateHandler(state);
  } else {
    kind = state.touches === 1 ? 'receive' : 'set';
    const nextIndex = state.touches === 1 ? state.actors.find(other => other.team === actor.team && other.index !== actor.index).index : state.receiver;
    const next = state.actors[nextIndex];
    const targetX = clamp(state.ball.x * 0.5 + next.x * 0.5, 220, 780);
    const partnerFeed = actor.index === 1 && state.touches === 1;
    const high = kind === 'set' || partnerFeed;
    const targetY = actor.team === 0 ? (high ? 775 : 845) : (kind === 'set' ? 425 : 355);
    aim(state, targetX, targetY, high ? 1.65 : 1.28, high ? 300 : 125);
    ball.hot = 0;
    updateHandler(state);
  }
  state.swingBuffer = 0;
  state.charging = false;
  state.events.push({ type: 'hit', kind, perfect, manual, actor: actor.index, x: ball.x, y: ball.y, z: ball.z, rally: state.rally });
  state.charge = 0;
  return true;
}

function moveActor(state, actor, dt, input) {
  const human = actor.index === 0 && !state.autoplay;
  const manual = human && Math.hypot(input.x || 0, input.y || 0) > 0.08;
  let dx = 0, dy = 0;
  if (manual) {
    const length = Math.max(1, Math.hypot(input.x, input.y));
    dx = input.x / length;
    dy = input.y / length;
    state.manualUntil = state.time + 0.65;
  } else if ((!human || state.assist) && state.time >= (human ? state.manualUntil : 0)) {
    let target = actor.home;
    if (actor.index === state.handler && actor.team === state.possession && state.phase === 'rally') {
      target = predictLanding(state.ball, state.touches === 2 ? 300 : 145);
      target.y = clamp(target.y, actor.team === 0 ? 675 : 80, actor.team === 0 ? 1120 : 525);
      target.x = clamp(target.x, 95, 905);
    } else if (actor.team === state.possession && state.touches > 0) {
      target = { x: actor.home.x, y: actor.team === 0 ? 785 : 415 };
    }
    const length = distance(actor, target);
    if (length > 10) { dx = (target.x - actor.x) / length; dy = (target.y - actor.y) / length; }
  }
  const speed = 315 + characterFor(actor.id).speed * 47;
  actor.x = clamp(actor.x + dx * speed * dt, 70, 930);
  actor.y = clamp(actor.y + dy * speed * dt, actor.team === 0 ? 645 : 75, actor.team === 0 ? 1125 : 555);
  actor.moving = Math.hypot(dx, dy);
  actor.cooldown = Math.max(0, actor.cooldown - dt);
  actor.poseTime = Math.max(0, actor.poseTime - dt);
  if (actor.poseTime === 0) actor.pose = 0;
  if (actor.z > 0 || actor.vz > 0) {
    actor.z += actor.vz * dt;
    actor.vz -= WORLD.gravity * dt;
    if (actor.z <= 0) { actor.z = actor.vz = 0; state.events.push({ type: 'land', actor: actor.index, x: actor.x, y: actor.y }); }
  }
}

export function step(state, dt, input = { x: 0, y: 0 }) {
  dt = clamp(dt, 0, 1 / 30);
  if (state.phase === 'finished') return;
  state.time += dt;
  if (state.training && !state.autoplay) {
    state.remaining = Math.max(0, state.remaining - dt);
    if (state.remaining === 0) { state.phase = 'finished'; state.winner = 0; state.events.push({ type: 'finish', winner: 0 }); return; }
  }
  state.freeze = Math.max(0, state.freeze - dt);
  if (state.freeze > 0) return;
  state.swingBuffer = Math.max(0, state.swingBuffer - dt);
  state.jumpBuffer = Math.max(0, state.jumpBuffer - dt);
  if (state.charging) state.charge = Math.min(1, state.charge + dt / 0.72);

  if (state.phase === 'ready' || state.phase === 'point') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      state.phase = 'serve';
      state.phaseTimer = state.autoplay ? 0.55 : 1.1;
      state.actors.forEach(actor => { Object.assign(actor, actor.home, { z: 0, vz: 0, cooldown: 0, pose: 0, miss: false }); });
      state.ball.x = state.actors[state.serving === 0 ? 0 : 2].x;
      state.ball.y = state.actors[state.serving === 0 ? 0 : 2].y;
      state.ball.z = 170;
    }
    return;
  }
  if (state.phase === 'serve') { state.phaseTimer -= dt; if (state.phaseTimer <= 0) serve(state); return; }

  if (state.jumpBuffer > 0 && jump(state, state.actors[0])) state.jumpBuffer = 0;
  for (const actor of state.actors) moveActor(state, actor, dt, input);
  const ball = state.ball;
  const oldY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  ball.vz -= WORLD.gravity * dt;
  ball.spin += dt * (ball.hot ? 22 : 9);
  ball.hot = Math.max(0, ball.hot - dt * 0.08);

  if ((oldY < WORLD.net && ball.y >= WORLD.net || oldY >= WORLD.net && ball.y < WORLD.net) && ball.z < WORLD.netHeight) {
    state.events.push({ type: 'net', x: ball.x, y: WORLD.net, z: ball.z });
    awardPoint(state, 1 - state.actors[state.lastActor].team, 'net');
    return;
  }

  if (state.swingBuffer > 0 && teamAt(ball.y) === 0) touch(state, state.actors[0], { spike: true, manual: true });

  for (const actor of state.actors) {
    if (actor.team !== teamAt(ball.y) || actor.team !== state.possession || actor.index !== state.handler) continue;
    const human = actor.index === 0 && !state.autoplay;
    if (state.touches === 2 && !human && distance(actor, ball) < 185 && ball.vz < 30 && ball.z < 500 && ball.z > 300 && actor.z === 0) jump(state, actor);
    if (!human && state.touches === 2 && actor.z > 30) touch(state, actor, { spike: true });
    if (!human || state.assist) touch(state, actor);
  }
  if (ball.z <= 0) {
    ball.z = 0;
    const inBounds = ball.x >= 35 && ball.x <= 965 && ball.y >= 40 && ball.y <= 1160;
    const winner = inBounds ? 1 - teamAt(ball.y) : 1 - state.actors[state.lastActor].team;
    awardPoint(state, winner, inBounds ? 'ground' : 'out');
  }
}

export function drainEvents(state) {
  const events = state.events;
  state.events = [];
  return events;
}
