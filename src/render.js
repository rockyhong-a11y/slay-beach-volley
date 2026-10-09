import { COURTS, characterFor } from './roster.js';
import { playerCue, predictLanding } from './engine.js';
import { COURT_SCENE } from './court-scene.js';
import { ImpactEffects } from './impact-effects.js';

const TAU = Math.PI * 2;
export async function loadCourtImages() {
  const load = path => new Promise((resolve, reject) => {
    const image = new Image(); image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load stadium: ${path}`));
    image.src = new URL(path, import.meta.url).href;
  });
  return Promise.all(COURT_SCENE.courts.map(async court => {
    const [background, net] = await Promise.all([load(court.background), load(court.net)]);
    return { background, net };
  }));
}
export function projectCourtPoint(x, y, z, width, height) {
  const [mx, my, mw] = COURT_SCENE.projection;
  const dot = row => row[0] * x + row[1] * y + row[2] * z + row[3];
  const depth = dot(mw);
  return { x: dot(mx) / depth / COURT_SCENE.width * width, y: dot(my) / depth / COURT_SCENE.height * height, scale: Math.max(.6, Math.min(1.32, COURT_SCENE.referenceDepth / depth)) };
}
export class Renderer {
  constructor(canvas, images, manifest, { reducedMotion = false, shake = true, courtImages = [] } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.images = images;
    this.manifest = manifest;
    this.courtImages = courtImages;
    this.effects = new ImpactEffects({ reducedMotion });
    this.reducedMotion = reducedMotion;
    this.allowShake = shake;
    this.courtIndex = 0;
    this.particles = [];
    this.trail = [];
    this.shake = 0;
    this.netWobble = 0;
    this.lastTime = 0;
    this.canvas.dataset.scene = COURT_SCENE.id;
    this.resize();
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(100, rect.width);
    this.h = Math.max(100, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.background = document.createElement('canvas');
    this.background.width = this.canvas.width;
    this.background.height = this.canvas.height;
    this.bctx = this.background.getContext('2d');
    this.bctx.scale(this.dpr, this.dpr);
    this.drawBackground(this.bctx);
    if (this.state) this.draw(this.state, this.lastTime);
  }
  setCourt(index) {
    this.courtIndex = index;
    this.drawBackground(this.bctx);
    this.effects.clear(); this.trail.length = 0; this.particles.length = 0;
  }
  project(x, y, z = 0) {
    return projectCourtPoint(x, y, z, this.w, this.h);
  }
  polygon(ctx, points, fill, stroke, width = 1) {
    ctx.beginPath();
    points.forEach((point, i) => i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  ellipse(ctx, x, y, rx, ry, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  }
  drawBackground(ctx) {
    const w = this.w, h = this.h, background = this.courtImages[this.courtIndex]?.background;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = COURTS[this.courtIndex].sand; ctx.fillRect(0, 0, w, h);
    if (background?.naturalWidth) ctx.drawImage(background, 0, 0, w, h);
  }
  actor(ctx,actor,time,state){
    const im=this.images[actor.id],meta=this.manifest[actor.id];if(!im?.complete||!im.naturalWidth||!meta)return;
    const p=this.project(actor.x,actor.y,actor.z),base=this.project(actor.x,actor.y);
    let frame=actor.pose===1?1:0;
    if(state.phase==='point'&&state.lastPoint?.team!==actor.team)frame=2;
    const f=meta.frames[frame];
    const height=(this.w*.178)*p.scale*(actor.id==='atlas'?1.06:1),width=height*f.width/f.height;
    const bob=this.reducedMotion?0:actor.z>0?0:actor.moving?Math.sin(time*19+actor.index)*2:Math.sin(time*2.2+actor.index)*.8;
    ctx.save();ctx.translate(p.x,p.y+bob);
    if(!this.reducedMotion)ctx.rotate(actor.moving?Math.sin(time*10+actor.index)*.035:actor.z>0?-.035:Math.sin(time*2+actor.index)*.015);
    if(actor.z>0&&!this.reducedMotion)ctx.scale(.97,1.03);
    if(actor.index>=2)ctx.scale(-1,1);
    const imageScale=im.naturalWidth/meta.width;
    ctx.drawImage(im,f.x*imageScale,f.y*imageScale,f.width*imageScale,f.height*imageScale,-width/2,-height,width,height);
    ctx.restore();
    if(actor.index===0){ctx.strokeStyle='#147a6580';ctx.lineWidth=1.3;ctx.beginPath();ctx.ellipse(base.x,base.y+2,13,4,0,0,TAU);ctx.stroke();}
    if(actor.index===1){ctx.fillStyle='#467f7299';ctx.font=`600 ${Math.max(6,this.w*.016)}px Outfit`;ctx.textAlign='center';ctx.fillText('PARTNER',p.x,p.y-height-6);}
  }
  net(ctx, time) {
    const plate = this.courtImages[this.courtIndex]?.net;
    if (!plate?.naturalWidth) return;
    ctx.save();
    if (!this.reducedMotion && this.netWobble > .05) ctx.translate(Math.sin(time * 42) * this.netWobble * .35, 0);
    ctx.drawImage(plate, 0, 0, this.w, this.h); ctx.restore();
  }
  ball(ctx,ball,ready=false){
    const p=this.project(ball.x,ball.y,ball.z),r=Math.max(5.5,this.w*.017)*p.scale;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ball.spin);
    this.ellipse(ctx,0,0,r+1,r+1,'#a4866255');this.ellipse(ctx,0,0,r,r,'#fff6d7');
    ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.clip();
    ctx.fillStyle=ball.hot>.3?'#ed885b':'#e6be60';ctx.beginPath();ctx.moveTo(-r,-r);ctx.bezierCurveTo(r,-r,r,r,-r,r);ctx.lineTo(-r*.3,r*.2);ctx.quadraticCurveTo(r*.4,-r*.6,-r,-r);ctx.fill();
    ctx.strokeStyle='#689d95';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-r,-r*.2);ctx.bezierCurveTo(r*.9,-r*.9,r*.7,r*.9,0,r);ctx.stroke();ctx.restore();
    this.ellipse(ctx,-r*.35,-r*.35,r*.27,r*.18,'#fffdefd9');
    if(ready){ctx.strokeStyle='#fff8ce';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(0,0,r+5,0,TAU);ctx.stroke();}
    ctx.restore();
  }
  burst(event) {
    this.effects.reducedMotion = this.reducedMotion;
    if (event.type === 'hit') {
      this.effects.burst(event);
      if ((event.kind === 'spike' || event.kind === 'block') && this.allowShake && !this.reducedMotion) this.shake = event.perfect ? 7 : event.kind === 'block' ? 4.5 : 5.5;
      if (event.kind === 'block') this.netWobble = 2.5;
    } else if (event.type === 'jump' || event.type === 'land' || event.type === 'point') {
      const count = this.reducedMotion ? 3 : event.type === 'point' ? 20 : event.type === 'land' ? 11 : 8;
      for (let i = 0; i < count; i++) this.particles.push({ x: event.x, y: event.y, ox: 0, oy: 0, vx: (i - count * .5) * 8, vy: -12 - (i % 4) * 9, age: 0, life: .4 + (i % 3) * .1, color: COURTS[this.courtIndex].night ? '#eddec0' : '#fff0cf', size: 1.3 + (i % 3) });
      if (this.particles.length > 96) this.particles.splice(0, this.particles.length - 96);
    } else if (event.type === 'net') this.netWobble = 3;
  }
  draw(state, time) {
    this.state = state;
    const ctx = this.ctx, w = this.w, h = this.h, dt = Math.min(.04, Math.max(0, time - this.lastTime)); this.lastTime = time;
    const project = (x, y, z = 0) => this.project(x, y, z);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.fillStyle = COURTS[this.courtIndex].sand; ctx.fillRect(0, 0, w, h); ctx.save();
    if (this.shake > .05) { if (this.allowShake && !this.reducedMotion) ctx.translate(Math.sin(time * 160) * this.shake, Math.cos(time * 143) * this.shake * .5); this.shake *= Math.exp(-dt * 20); }
    ctx.drawImage(this.background, 0, 0, w, h);
    const cue = playerCue(state);
    if (state.phase === 'rally') {
      const ground = project(state.ball.x, state.ball.y), fade = Math.max(.08, .3 - state.ball.z * .0003);
      this.ellipse(ctx, ground.x, ground.y, 7 + state.ball.z * .004, 2.5 + state.ball.z * .001, `rgba(61,47,25,${fade})`);
      if (state.possession === 0 && state.ball.vz < 0) {
        ctx.save(); ctx.strokeStyle = '#287a6890'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(ground.x, ground.y, 15, 5, 0, 0, TAU); ctx.stroke(); ctx.restore();
      }
      if (cue === 'approach' || cue === 'spike') {
        const target = predictLanding(state.ball, 350), p = project(target.x, target.y);
        this.ellipse(ctx, p.x, p.y, 28, 9, cue === 'spike' ? '#ffd2696b' : '#47bda839');
        ctx.strokeStyle = cue === 'spike' ? '#b17a25' : '#147866'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(p.x, p.y, 28, 9, 0, 0, TAU); ctx.stroke();
      }
    }
    for (const actor of state.actors) {
      const p = project(actor.x, actor.y), fade = Math.max(.08, .24 - actor.z * .0003);
      this.ellipse(ctx, p.x, p.y + 2, Math.max(8, w * .035) * p.scale, 3.4 * p.scale, `rgba(39,33,24,${fade})`);
    }
    if (state.phase === 'rally' && !this.reducedMotion) { this.trail.push({ x: state.ball.x, y: state.ball.y, z: state.ball.z, hot: state.ball.hot }); if (this.trail.length > 18) this.trail.shift(); }
    else this.trail.length = 0;
    this.effects.drawTrail(ctx, this.trail, { project, width: w, reducedMotion: this.reducedMotion });
    const layers = state.actors.map(actor => ({ y: actor.y, draw: () => this.actor(ctx, actor, time, state) }));
    layers.push({ y: 600, draw: () => this.net(ctx, time) }); layers.sort((a, b) => a.y - b.y).forEach(layer => layer.draw());
    this.netWobble *= Math.exp(-dt * 8);
    this.particles = this.particles.filter(p => {
      p.age += dt; if (p.age > p.life) return false;
      p.ox += p.vx * dt; p.oy += p.vy * dt; p.vy += 90 * dt;
      const base = project(p.x, p.y), size = Math.max(.75, w / 360);
      ctx.globalAlpha = 1 - p.age / p.life; this.ellipse(ctx, base.x + p.ox * size, base.y + p.oy * size, p.size * size, p.size * .7 * size, p.color); ctx.globalAlpha = 1; return true;
    });
    this.effects.draw(ctx, dt, { project, width: w, height: h, reducedMotion: this.reducedMotion });
    // Keep the ball readable through the contact spark's brightest frame.
    this.ball(ctx, state.ball, cue === 'spike');
    ctx.restore();
    const player = state.actors[0], p = project(player.x, player.y, player.z);
    return { ...p, y: p.y - w * .178 * p.scale * (player.id === 'atlas' ? 1.06 : 1) - 9 };
  }
}

export function drawPortrait(canvas,id,images,manifest,{full=false}={}) {
  const ctx=canvas.getContext('2d'),image=images[id],meta=manifest[id];ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!image?.naturalWidth||!meta)return;
  const f=meta.frames[0],scale=image.naturalWidth/meta.width;
  if(full){const height=canvas.height*.94,width=height*f.width/f.height;ctx.drawImage(image,f.x*scale,f.y*scale,f.width*scale,f.height*scale,(canvas.width-width)/2,canvas.height-height,width,height);}
  else {const cropHeight=f.height*.52,cropWidth=cropHeight;const x=f.x+f.width*.5-cropWidth*.5;ctx.drawImage(image,x*scale,f.y*scale,cropWidth*scale,cropHeight*scale,0,0,canvas.width,canvas.height);}
}
