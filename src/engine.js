import { characterFor } from './roster.js';

export const WORLD = Object.freeze({ width: 1000, depth: 1200, net: 600, netHeight: 460, gravity: 980 });
export const HAND_HEIGHT = Object.freeze({ attack: 330, toss: 295 });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const teamAt = y => y >= WORLD.net ? 0 : 1;

export function createMatch({ character = 'nova', partner = 'seraph', opponents = ['raven', 'valkyrie'], difficulty = 1, targetScore = 7, autoplay = false, training = false, seed = Date.now() } = {}) {
  const ids = [character, partner, ...opponents];
  const homes = [{ x: 335, y: 975 }, { x: 685, y: 790 }, { x: 685, y: 225 }, { x: 315, y: 410 }];
  return {
    phase: 'ready', phaseTimer: 1.5, time: 0, score: [0, 0], targetScore, difficulty, autoplay, training,
    remaining: 60, seed: seed >>> 0, serving: 0, possession: 0, touches: 0, lastActor: -1, receiver: 0,
    actors: ids.map((id, index) => ({ id, team: index < 2 ? 0 : 1, index, ...homes[index], home: { ...homes[index] }, z: 0, vz: 0, hang: 0, jumpKind: null, moving: 0, motionX: 0, motionY: 0, facing: index < 2 ? 'up' : 'down', action: 'idle', actionAt: 0, contactKind: null, contactAt: -10, landAt: -10, pose: 0, poseTime: 0, cooldown: 0, miss: false })),
    ball: { x: 335, y: 975, z: 170, vx: 0, vy: 0, vz: 0, gravity: WORLD.gravity, spin: 0, hot: 0 },
    events: [], rally: 0, freeze: 0, charge: 0, charging: false, swingBuffer: 0, blockBuffer: 0,
    stats: { spikes: 0, perfects: 0, longestRally: 0, points: 0, blocks: 0 }, winner: null, lastPoint: null,
    aiTimer: 0, handler: 0, bounce: 0,
  };
}

export function random(state) {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

export function predictLanding(ball, height = 0) {
  const gravity = ball.gravity ?? WORLD.gravity;
  const discriminant = ball.vz ** 2 + 2 * gravity * (ball.z - height);
  const time = Math.max(0, discriminant >= 0 ? (ball.vz + Math.sqrt(discriminant)) / gravity : ball.vz / gravity);
  return { x: ball.x + ball.vx * time, y: ball.y + ball.vy * time, time };
}

function aim(state, x, y, duration, endHeight = 115, gravity = WORLD.gravity) {
  const ball = state.ball;
  // A higher tape needs a real, longer flight arc when contact starts below it.
  // Solve the ballistic height at the net instead of lifting the ball mid-flight.
  if (teamAt(ball.y) !== teamAt(y)) {
    const fraction = (WORLD.net - ball.y) / (y - ball.y);
    if (fraction > 0 && fraction < 1) {
      const directHeight = ball.z * (1 - fraction) + endHeight * fraction;
      const clearance = WORLD.netHeight + 32;
      const arcTime = Math.sqrt(Math.max(0, 2 * (clearance - directHeight) / (gravity * fraction * (1 - fraction))));
      duration = Math.max(duration, arcTime);
    }
  }
  ball.gravity = gravity;
  ball.vx = (x - ball.x) / duration;
  ball.vy = (y - ball.y) / duration;
  ball.vz = (endHeight - ball.z + 0.5 * gravity * duration ** 2) / duration;
}

function jump(state, actor, kind = 'attack') {
  if (actor.z > 1 || actor.cooldown > 0.24 || state.phase !== 'rally') return false;
  actor.vz = kind === 'toss' ? 390 + characterFor(actor.id).jump * 12 : 760 + characterFor(actor.id).jump * 24;
  actor.hang = kind === 'attack' ? 0.32 + characterFor(actor.id).jump * .02 : kind === 'block' ? .22 : 0;
  actor.jumpKind = kind;
  actor.action = `${kind}-jump`;
  actor.actionAt = state.time;
  actor.pose = 1;
  actor.poseTime = kind === 'toss' ? .65 : 1.35;
  state.events.push({ type: 'jump', kind, actor: actor.index, x: actor.x, y: actor.y });
  return true;
}

export function requestBlock(state) {
  if (state.phase !== 'rally') return false;
  state.blockBuffer = .95;
  state.swingBuffer = 0;
  state.charging = false;
  state.charge = 0;
  jump(state, state.actors[0], 'block');
  return true;
}

export function beginCharge(state) {
  if (state.phase === 'serve') { serve(state); return; }
  if (state.phase !== 'rally') return;
  if (state.charging) return;
  state.charging = true;
  state.charge = 0;
}

export function releaseSpike(state) {
  state.charging = false;
  if (state.phase === 'serve') { serve(state); return; }
  if (state.phase !== 'rally') return;
  state.swingBuffer = 0.65;
  state.blockBuffer = 0;
  state.actors[0].pose = 1;
  state.actors[0].poseTime = 0.32;
}

function updateHandler(state) {
  const team = state.possession;
  const indices = team === 0 ? [0, 1] : [2, 3];
  if (state.touches === 0) {
    const landing = predictLanding(state.ball, HAND_HEIGHT.toss);
    // A receiver commits to an incoming ball; the partner covers the other lane.
    state.handler = indices.reduce((best, index) => distance(state.actors[index], landing) < distance(state.actors[best], landing) ? index : best, indices[0]);
    state.receiver = state.handler;
  } else if (state.touches === 1) state.handler = indices.find(index => index !== state.lastActor);
  else state.handler = state.receiver;
  state.actors.forEach(actor => { actor.miss = false; });
  if (!state.autoplay && !state.training) {
    // Longer rallies get harder. A manual swing can rescue a missed receive.
    const fatigue = Math.max(0, state.rally - 4) * 0.018;
    const base = state.handler >= 2 ? [0.16, 0.095, 0.04][clamp(state.difficulty, 0, 2)] : [0.03, 0.05, 0.075][clamp(state.difficulty, 0, 2)];
    const missChance = Math.min(0.45, base + fatigue);
    state.actors[state.handler].miss = state.handler !== 0 && random(state) < missChance;
  }
}

function serve(state) {
  const index = state.serving === 0 ? 0 : 2;
  const server = state.actors[index];
  state.ball.x = server.x;
  state.ball.y = server.y;
  state.ball.z = HAND_HEIGHT.attack;
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
  server.action = server.contactKind = 'serve';
  server.actionAt = server.contactAt = state.time;
  state.events.push({ type: 'hit', kind: 'serve', actor: index, x: server.x, y: server.y, z: HAND_HEIGHT.attack, vx: state.ball.vx, vy: state.ball.vy, vz: state.ball.vz });
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
  state.swingBuffer = state.blockBuffer = 0;
  if (!state.training && state.score[team] >= state.targetScore) {
    state.winner = team;
    state.phase = 'finished';
    state.events.push({ type: 'finish', winner: team });
  }
}

function canTouch(state, actor, { spike = false, manual = false, block = false } = {}) {
  const ball = state.ball;
  if (state.lastActor === actor.index && state.touches > 0) return false;
  if (actor.cooldown > 0 || actor.miss && !manual) return false;
  if (block) {
    const handHeight = actor.z + HAND_HEIGHT.attack;
    const lateralRange = actor.id === 'valkyrie' ? 64 : 58;
    const incoming = actor.team === 0 ? ball.vy >= 0 : ball.vy <= 0;
    return actor.z > 25 && handHeight >= WORLD.netHeight - 12
      && Math.abs(actor.y - WORLD.net) <= 75
      && Math.abs(ball.y - WORLD.net) <= 70
      && Math.abs(actor.x - ball.x) <= lateralRange
      && Math.abs(actor.y - ball.y) <= 75
      && Math.abs(ball.z - handHeight) <= 65
      && ball.z >= WORLD.netHeight - 12 && incoming
      && state.lastActor >= 0 && state.actors[state.lastActor].team !== actor.team;
  }
  const humanToss = actor.index === 0 && !state.autoplay && !spike;
  const range = manual ? actor.id === 'valkyrie' ? 270 : 240 : humanToss ? actor.id === 'lynx' ? 275 : 250 : actor.id === 'lynx' ? 185 : 165;
  const handHeight = actor.z + (spike ? HAND_HEIGHT.attack : HAND_HEIGHT.toss);
  if (distance(actor, ball) > range || ball.z > handHeight + (manual ? 155 : humanToss ? 95 : 45) || ball.z < actor.z - 75) return false;
  if (spike && ball.z < 95) return false;
  if (spike && ball.vz > 140) return false;
  if (!spike && ball.vz > 40) return false;
  return true;
}

function attackTurn(state) {
  return state.phase === 'rally' && state.possession === 0 && state.handler === 0 && state.touches >= 1 && state.lastActor === 1;
}

export function playerCue(state) {
  if (state.phase !== 'rally' || state.autoplay) return 'idle';
  const player = state.actors[0];
  if (state.blockBuffer > 0) return 'blocking';
  if (attackTurn(state)) return player.z > 25 && canTouch(state, player, { spike: true, manual: true }) ? 'spike' : 'approach';
  if (state.lastActor >= 2 && Math.abs(player.y - WORLD.net) <= 75 && Math.abs(player.x - predictLanding(state.ball, WORLD.netHeight).x) <= 100 && predictLanding(state.ball, WORLD.netHeight).time < .9) return 'block';
  return 'receive';
}

function touch(state, actor, { spike = false, manual = false, block = false } = {}) {
  if (!canTouch(state, actor, { spike, manual, block })) return false;
  const ball = state.ball;
  const handHeight = actor.z + (spike ? HAND_HEIGHT.attack : HAND_HEIGHT.toss);

  if (actor.team !== state.possession) {
    state.possession = actor.team;
    state.touches = 0;
  }
  state.touches++;
  if (state.touches === 1) state.receiver = actor.index;
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
    const targetX = clamp(state.ball.x * 0.25 + next.x * 0.75, 180, 820);
    const partnerFeed = actor.index === 1 && state.touches === 1;
    const high = kind === 'set' || partnerFeed || actor.index === 0 && !state.autoplay;
    const targetY = actor.team === 0 ? (high ? 775 : 845) : (kind === 'set' ? 425 : 355);
    // Float the toss so moving under it and choosing the attack timing are relaxed.
    aim(state, targetX, targetY, high ? 2.15 : 1.6, high ? WORLD.netHeight + 40 : 150, high ? 620 : 760);
    ball.hot = 0;
    updateHandler(state);
  }
  if (manual && actor.index === 0) {
    state.swingBuffer = state.blockBuffer = 0;
    state.charging = false;
    state.charge = 0;
  }
  actor.action = actor.contactKind = kind;
  actor.actionAt = actor.contactAt = state.time;
  state.events.push({ type: 'hit', kind, perfect, manual, actor: actor.index, x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz, rally: state.rally });
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
  } else if (!human) {
    let target = actor.home;
    if (actor.index === state.handler && actor.team === state.possession && state.phase === 'rally') {
      target = predictLanding(state.ball, state.touches === 2 ? WORLD.netHeight + 80 : HAND_HEIGHT.toss);
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
  actor.motionX = dx;
  actor.motionY = dy;
  if (actor.moving > .08) actor.facing = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 'left' : 'right' : dy < 0 ? 'up' : 'down';
  actor.cooldown = Math.max(0, actor.cooldown - dt);
  actor.poseTime = Math.max(0, actor.poseTime - dt);
  if (actor.poseTime === 0) actor.pose = 0;
  if (actor.z > 0 || actor.vz > 0) {
    if (actor.hang > 0 && actor.vz <= 55 && actor.vz >= -80) {
      actor.hang = Math.max(0, actor.hang - dt); actor.vz = 0;
    } else {
      actor.z += actor.vz * dt;
      actor.vz -= WORLD.gravity * dt;
    }
    if (actor.z <= 0) { actor.z = actor.vz = actor.hang = 0; actor.jumpKind = null; actor.action = 'land'; actor.actionAt = actor.landAt = state.time; state.events.push({ type: 'land', actor: actor.index, x: actor.x, y: actor.y }); }
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
  state.blockBuffer = Math.max(0, state.blockBuffer - dt);
  if (state.charging) state.charge = Math.min(1, state.charge + dt / 0.72);

  if (state.phase === 'ready' || state.phase === 'point') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) {
      state.phase = 'serve';
      state.phaseTimer = state.autoplay ? 0.55 : 1.1;
      state.actors.forEach(actor => { Object.assign(actor, actor.home, { z: 0, vz: 0, hang: 0, jumpKind: null, cooldown: 0, pose: 0, poseTime: 0, miss: false, moving: 0, motionX: 0, motionY: 0, facing: actor.team === 0 ? 'up' : 'down', action: 'idle', actionAt: state.time, contactKind: null, contactAt: -10, landAt: -10 }); });
      state.ball.x = state.actors[state.serving === 0 ? 0 : 2].x;
      state.ball.y = state.actors[state.serving === 0 ? 0 : 2].y;
      state.ball.z = 170;
    }
    return;
  }
  if (state.phase === 'serve') { state.phaseTimer -= dt; if (state.phaseTimer <= 0) serve(state); return; }

  const player = state.actors[0];
  const ball = state.ball;
  if (!state.autoplay && state.blockBuffer > 0) jump(state, player, 'block');
  if (!state.autoplay && state.blockBuffer === 0 && teamAt(ball.y) === 0 && distance(player, ball) < 290 && ball.vz < 30) {
    if ((attackTurn(state) || state.swingBuffer > 0) && ball.z > 235 && ball.z < WORLD.netHeight + 360) jump(state, player, 'attack');
    else if (!attackTurn(state) && state.touches < 2 && state.lastActor !== 0 && ball.z < HAND_HEIGHT.toss + 140 && ball.z > 80) jump(state, player, 'toss');
  }
  for (const actor of state.actors) moveActor(state, actor, dt, input);
  const oldY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  ball.vz -= (ball.gravity ?? WORLD.gravity) * dt;
  ball.spin += dt * (ball.hot ? 22 : 9);
  ball.hot = Math.max(0, ball.hot - dt * 0.08);

  if ((oldY < WORLD.net && ball.y >= WORLD.net || oldY >= WORLD.net && ball.y < WORLD.net) && ball.z < WORLD.netHeight) {
    state.events.push({ type: 'net', x: ball.x, y: WORLD.net, z: ball.z });
    awardPoint(state, 1 - state.actors[state.lastActor].team, 'net');
    return;
  }

  if (state.blockBuffer > 0) touch(state, player, { spike: true, manual: true, block: true });
  if (state.swingBuffer > 0 && teamAt(ball.y) === 0) touch(state, player, { spike: true, manual: true });
  if (!state.autoplay && teamAt(ball.y) === 0 && state.possession === 0 && state.touches < 2 && !attackTurn(state) && state.blockBuffer === 0) touch(state, player);

  for (const actor of state.actors) {
    if (actor.team !== teamAt(ball.y) || actor.team !== state.possession || actor.index !== state.handler) continue;
    const human = actor.index === 0 && !state.autoplay;
    if (human) continue;
    if (state.touches === 2 && distance(actor, ball) < 210 && ball.vz < 30 && ball.z < WORLD.netHeight + 320 && ball.z > WORLD.netHeight - 70 && actor.z === 0) jump(state, actor);
    else if (state.touches === 1 && distance(actor, ball) < 200 && ball.vz < 30 && ball.z < HAND_HEIGHT.toss + 140 && ball.z > 180 && actor.z === 0) jump(state, actor, 'toss');
    if (!human && state.touches === 2 && actor.z > 30) touch(state, actor, { spike: true });
    touch(state, actor);
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
