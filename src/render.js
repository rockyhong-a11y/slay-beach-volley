import { COURTS, characterFor } from './roster.js';

const TAU = Math.PI * 2;
export class Renderer {
  constructor(canvas, images, manifest, { reducedMotion = false, shake = true } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.images = images;
    this.manifest = manifest;
    this.reducedMotion = reducedMotion;
    this.allowShake = shake;
    this.courtIndex = 0;
    this.particles = [];
    this.rings = [];
    this.trail = [];
    this.shake = 0;
    this.netWobble = 0;
    this.lastTime = 0;
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
  }
  setCourt(index) {
    this.courtIndex = index;
    this.drawBackground(this.bctx);
  }
  project(x, y, z = 0) {
    const depth = y / 1200;
    const perspective = 0.78 + depth * 0.3;
    const half = this.w * (0.28 + depth * 0.135);
    return { x: this.w * 0.5 + (x - 500) / 500 * half, y: this.h * (0.31 + depth * 0.54) - z * 0.245 * this.h / 580 * perspective, scale: perspective };
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
  palm(ctx, x, y, height, flip = 1) {
    const c = COURTS[this.courtIndex];
    ctx.save();ctx.translate(x,y);ctx.scale(flip,1);
    ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(8,-height*.3,5,-height*.65,22,-height);ctx.strokeStyle=c.night?'#775e4e':'#ab8761';ctx.lineWidth=9;ctx.stroke();
    ctx.beginPath();ctx.moveTo(1,-5);ctx.bezierCurveTo(9,-height*.3,8,-height*.65,24,-height);ctx.strokeStyle=c.night?'#a18762':'#c6a178';ctx.lineWidth=3;ctx.stroke();
    const leaves=[[-68,-12],[-66,25],[-36,43],[58,-17],[69,13],[46,38],[12,-40]];
    for(const [dx,dy] of leaves){ctx.beginPath();ctx.moveTo(22,-height);ctx.quadraticCurveTo(22+dx*.7,-height+dy-24,22+dx,-height+dy+17);ctx.quadraticCurveTo(22+dx*.55,-height+dy-4,22,-height);ctx.fillStyle=c.night?'#34554c':dx<0?'#3f8a67':'#5f9d70';ctx.fill();ctx.beginPath();ctx.moveTo(22,-height);ctx.quadraticCurveTo(22+dx*.65,-height+dy-15,22+dx,-height+dy+17);ctx.strokeStyle=c.night?'#47705b':'#80b277';ctx.lineWidth=.8;ctx.stroke();}
    ctx.restore();
  }
  umbrella(ctx,x,y,r,color){
    ctx.save();ctx.translate(x,y);ctx.strokeStyle='#a08465';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-r*.15);ctx.lineTo(0,r*.9);ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,r,Math.PI,0);ctx.closePath();ctx.fillStyle=color;ctx.fill();
    this.polygon(ctx,[{x:-r*.6,y:0},{x:0,y:-r},{x:r*.55,y:0}],'#fbefd8');
    this.ellipse(ctx,0,r*.97,r*.75,r*.16,'#856b4330');ctx.restore();
  }
  drawBackground(ctx) {
    const w=this.w,h=this.h,c=COURTS[this.courtIndex];
    ctx.clearRect(0,0,w,h);
    const sky=ctx.createLinearGradient(0,0,0,h*.32);sky.addColorStop(0,c.sky);sky.addColorStop(1,c.night?'#738294':c.evening?'#ffe2ba':'#d9eeea');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h*.35);
    if(c.night){for(let i=0;i<28;i++)this.ellipse(ctx,(i*97.3)%w,17+(i*41)%Math.max(20,h*.23),i%4===0?1.2:.6,i%4===0?1.2:.6,'#fff3daaa');this.ellipse(ctx,w*.79,h*.19,15,15,'#fff2cc');this.ellipse(ctx,w*.805,h*.177,13,13,c.sky);}
    else {this.ellipse(ctx,w*.82,h*.18,23,23,c.evening?'#ffe8b1':'#fff7da');this.ellipse(ctx,w*.82,h*.18,32,32,c.evening?'#ffebc51c':'#fffbe219');}
    ctx.fillStyle=c.night?'#506576':c.evening?'#d0afa0':'#96bbb4';ctx.beginPath();ctx.moveTo(0,h*.238);ctx.quadraticCurveTo(w*.12,h*.183,w*.24,h*.233);ctx.quadraticCurveTo(w*.29,h*.21,w*.36,h*.25);ctx.lineTo(0,h*.26);ctx.fill();
    const sea=ctx.createLinearGradient(0,h*.24,0,h*.36);sea.addColorStop(0,c.sea);sea.addColorStop(1,c.night?'#56929b':c.evening?'#bdd7c8':'#89d4c9');ctx.fillStyle=sea;ctx.fillRect(0,h*.24,w,h*.145);
    ctx.fillStyle=c.sand;ctx.beginPath();ctx.moveTo(0,h*.35);ctx.bezierCurveTo(w*.28,h*.34,w*.7,h*.39,w,h*.335);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fill();
    ctx.strokeStyle=c.night?'#a6c6bf77':'#f5fff6b0';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,h*.343);ctx.bezierCurveTo(w*.28,h*.333,w*.7,h*.379,w,h*.328);ctx.stroke();
    const sand=ctx.createLinearGradient(0,h*.35,0,h);sand.addColorStop(0,c.sand);sand.addColorStop(1,c.night?'#b3aa95':c.evening?'#f4d3a5':'#f8e5ba');ctx.fillStyle=sand;ctx.globalAlpha=.6;ctx.fillRect(0,h*.385,w,h*.615);ctx.globalAlpha=1;
    for(let i=0;i<190;i++){const x=((i*73.197)%w),y=h*.39+((i*37.517)%(h*.61));this.ellipse(ctx,x,y,i%3===0?1.2:.65,.55,c.night?'#968d7438':'#af906a27');}
    // Footprints, towels, surfboards and palms are cached 2D scenery.
    for(let i=0;i<7;i++){this.ellipse(ctx,w*.92-i*2,h*.61+i*7,1.5,3,'#ad926149');this.ellipse(ctx,w*.955-i*2,h*.61+i*7+4,1.5,3,'#ad926149');}
    this.palm(ctx,w*.015,h*.44,h*.245,1);this.palm(ctx,w*.99,h*.42,h*.2,-1);
    this.umbrella(ctx,w*.08,h*.74,w*.065,'#de8c73');this.umbrella(ctx,w*.915,h*.7,w*.075,c.night?'#7a97a5':'#79b5ba');
    ctx.save();ctx.translate(w*.895,h*.83);ctx.rotate(.17);ctx.fillStyle=c.night?'#8b7c80':'#dc9c8d';ctx.fillRect(-8,-17,16,32);ctx.fillStyle='#f4e5ce';ctx.fillRect(-8,-11,16,4);ctx.fillRect(-8,4,16,4);ctx.restore();
    ctx.save();ctx.translate(w*.10,h*.90);ctx.rotate(-.24);ctx.fillStyle='#a9c7ab';ctx.fillRect(-12,-10,24,20);ctx.fillStyle='#ededd1';ctx.fillRect(-12,-7,24,3);ctx.fillRect(-12,4,24,3);ctx.restore();
    ctx.fillStyle=c.night?'#efc686':'#c77c58';ctx.beginPath();ctx.roundRect(w*.875,h*.46,w*.029,h*.13,w*.023);ctx.fill();ctx.fillStyle='#ffecd099';ctx.fillRect(w*.887,h*.48,1.5,h*.10);
    const corners=[this.project(0,0),this.project(1000,0),this.project(1000,1200),this.project(0,1200)];
    this.polygon(ctx,corners,c.night?'#d4c9a129':'#fff0c12c','#fdf8e3c9',2.1);
    // Teal perimeter ropes and corner pegs make the perspective legible.
    this.polygon(ctx,[this.project(-25,-20),this.project(1025,-20),this.project(1025,1220),this.project(-25,1220)],null,c.night?'#607a7266':'#5b9b8666',1.2);
    for(const p of corners){this.ellipse(ctx,p.x,p.y,2.5,1.4,'#6f9581');}
    ctx.save();ctx.globalAlpha=.22;ctx.fillStyle='#a98850';ctx.font=`700 ${w*.058}px Outfit, sans-serif`;ctx.textAlign='center';ctx.translate(w*.5,h*.918);ctx.scale(1,.7);ctx.fillText('SLAY BEACH CLUB',0,0);ctx.restore();
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
  net(ctx,time){
    const left=this.project(-50,600),right=this.project(1050,600),topLeft=this.project(-50,600,230),topRight=this.project(1050,600,230);
    const wobble=this.netWobble?Math.sin(time*45)*this.netWobble:0;
    ctx.save();
    ctx.strokeStyle='#627973b0';ctx.lineWidth=1;
    for(let i=0;i<=23;i++){const x=left.x+(right.x-left.x)*i/23;ctx.beginPath();ctx.moveTo(x,topLeft.y+wobble*(i%3)*.4);ctx.lineTo(x,left.y-4);ctx.stroke();}
    for(let i=0;i<=5;i++){const y=topLeft.y+(left.y-4-topLeft.y)*i/5;ctx.beginPath();ctx.moveTo(left.x,y);ctx.quadraticCurveTo(this.w*.5,y+2+wobble,right.x,y);ctx.stroke();}
    ctx.strokeStyle='#fff5ddeb';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(topLeft.x,topLeft.y);ctx.quadraticCurveTo(this.w*.5,topLeft.y+3+wobble,topRight.x,topRight.y);ctx.stroke();
    for(const p of [left,right]){ctx.strokeStyle='#4d8b80';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(p.x,p.y+6);ctx.lineTo(p.x,topLeft.y-9);ctx.stroke();ctx.strokeStyle='#82b7a1';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(p.x-1,p.y+6);ctx.lineTo(p.x-1,topLeft.y-9);ctx.stroke();this.ellipse(ctx,p.x,topLeft.y-9,3.2,1.9,'#fff1d6');}
    ctx.fillStyle='#e4ecda';ctx.beginPath();ctx.roundRect(this.w*.5-21,topLeft.y-3,42,10,2);ctx.fill();ctx.fillStyle='#4a8175';ctx.font='700 6px Outfit';ctx.textAlign='center';ctx.fillText('SLAY VOLLEY',this.w*.5,topLeft.y+4);ctx.restore();
  }
  ball(ctx,ball){
    const p=this.project(ball.x,ball.y,ball.z),r=Math.max(5.5,this.w*.017)*p.scale;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(ball.spin);
    this.ellipse(ctx,0,0,r+1,r+1,'#a4866255');this.ellipse(ctx,0,0,r,r,'#fff6d7');
    ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.clip();
    ctx.fillStyle=ball.hot>.3?'#ed885b':'#e6be60';ctx.beginPath();ctx.moveTo(-r,-r);ctx.bezierCurveTo(r,-r,r,r,-r,r);ctx.lineTo(-r*.3,r*.2);ctx.quadraticCurveTo(r*.4,-r*.6,-r,-r);ctx.fill();
    ctx.strokeStyle='#689d95';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-r,-r*.2);ctx.bezierCurveTo(r*.9,-r*.9,r*.7,r*.9,0,r);ctx.stroke();ctx.restore();
    this.ellipse(ctx,-r*.35,-r*.35,r*.27,r*.18,'#fffdefd9');ctx.restore();
  }
  burst(event){
    const p=this.project(event.x,event.y,event.z||0);
    if(event.type==='hit'){
      const strong=event.kind==='spike'||event.kind==='block';this.rings.push({x:p.x,y:p.y,age:0,life:strong?.38:.2,color:strong?'#fff8dd':'#f4fff0',strong});
      if(strong){if(this.allowShake&&!this.reducedMotion)this.shake=event.perfect?5:3;for(let i=0;i<(this.reducedMotion?4:15);i++){const a=i*2.39996;this.particles.push({x:p.x,y:p.y,vx:Math.cos(a)*(35+i*5),vy:Math.sin(a)*(35+i*5),age:0,life:.35+i*.013,color:i%2?'#fff5d3':'#ef9c5b',size:i%3+1});}}
    }else if(event.type==='jump'||event.type==='land'||event.type==='point'){
      const base=this.project(event.x,event.y);const count=event.type==='point'?18:7;
      for(let i=0;i<(this.reducedMotion?3:count);i++)this.particles.push({x:base.x,y:base.y,vx:(i-count*.5)*8,vy:-12-(i%4)*9,age:0,life:.4+(i%3)*.1,color:'#fff0cf',size:1.2+(i%3)});
    }else if(event.type==='net')this.netWobble=3;
  }
  draw(state,time){
    const ctx=this.ctx,w=this.w,h=this.h,dt=Math.min(.04,Math.max(0,time-this.lastTime));this.lastTime=time;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle=COURTS[this.courtIndex].sand;ctx.fillRect(0,0,w,h);ctx.save();
    if(this.shake>.05){ctx.translate(Math.sin(time*160)*this.shake,Math.cos(time*143)*this.shake*.5);this.shake*=Math.exp(-dt*17);}
    ctx.drawImage(this.background,0,0,w,h);
    if(!this.reducedMotion){ctx.strokeStyle=COURTS[this.courtIndex].night?'#b5cbd249':'#eef9e67b';ctx.lineWidth=1.4;for(let i=0;i<4;i++){ctx.beginPath();const y=h*(.258+i*.018)+Math.sin(time*.9+i)*2;for(let x=0;x<=w;x+=12){const yy=y+Math.sin(x*.03+time*.6+i)*2;x===0?ctx.moveTo(x,yy):ctx.lineTo(x,yy);}ctx.stroke();}}
    if(state.phase==='rally'){
      const ground=this.project(state.ball.x,state.ball.y);const fade=Math.max(.1,.32-state.ball.z*.0003);this.ellipse(ctx,ground.x,ground.y,7+state.ball.z*.005,2.5+state.ball.z*.0015,`rgba(86,76,53,${fade})`);
      // The descending-ball marker helps judge depth on a portrait screen.
      if(state.possession===0&&state.ball.vz<0){ctx.save();ctx.strokeStyle='#438c7180';ctx.setLineDash([3,3]);ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(ground.x,ground.y,15,5,0,0,TAU);ctx.stroke();ctx.restore();}
    }
    for(const actor of state.actors){const p=this.project(actor.x,actor.y);this.ellipse(ctx,p.x,p.y+2,Math.max(8,w*.038)*(1-actor.z*.001),3.5,p.scale>1?'#755d4535':'#755d452c');}
    if(state.phase==='rally'&&!this.reducedMotion){const p=this.project(state.ball.x,state.ball.y,state.ball.z);this.trail.push({...p,hot:state.ball.hot});if(this.trail.length>12)this.trail.shift();}
    else this.trail.length=0;
    if(this.trail.length>1){for(let i=1;i<this.trail.length;i++){ctx.beginPath();ctx.moveTo(this.trail[i-1].x,this.trail[i-1].y);ctx.lineTo(this.trail[i].x,this.trail[i].y);ctx.strokeStyle=this.trail[i].hot>.3?`rgba(238,125,74,${i/this.trail.length*.7})`:`rgba(255,247,207,${i/this.trail.length*.4})`;ctx.lineWidth=(this.trail[i].hot>.3?5:2)*i/this.trail.length;ctx.lineCap='round';ctx.stroke();}}
    const layers=state.actors.map(actor=>({y:actor.y,draw:()=>this.actor(ctx,actor,time,state)}));layers.push({y:600,draw:()=>this.net(ctx,time)});layers.push({y:state.ball.y,draw:()=>this.ball(ctx,state.ball)});layers.sort((a,b)=>a.y-b.y).forEach(layer=>layer.draw());
    this.netWobble*=Math.exp(-dt*8);
    this.rings=this.rings.filter(ring=>{ring.age+=dt;if(ring.age>ring.life)return false;const q=ring.age/ring.life;ctx.strokeStyle=ring.color;ctx.globalAlpha=(1-q)*.9;ctx.lineWidth=ring.strong?3*(1-q)+1:1.8;ctx.beginPath();ctx.arc(ring.x,ring.y,(ring.strong?8:4)+q*(ring.strong?31:13),0,TAU);ctx.stroke();ctx.globalAlpha=1;return true;});
    this.particles=this.particles.filter(p=>{p.age+=dt;if(p.age>p.life)return false;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=90*dt;ctx.globalAlpha=1-p.age/p.life;this.ellipse(ctx,p.x,p.y,p.size,p.size*.75,p.color);ctx.globalAlpha=1;return true;});
    ctx.restore();
    return this.project(state.actors[0].x,state.actors[0].y,state.actors[0].z+340);
  }
}

export function drawPortrait(canvas,id,images,manifest,{full=false}={}) {
  const ctx=canvas.getContext('2d'),image=images[id],meta=manifest[id];ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!image?.naturalWidth||!meta)return;
  const f=meta.frames[0],scale=image.naturalWidth/meta.width;
  if(full){const height=canvas.height*.94,width=height*f.width/f.height;ctx.drawImage(image,f.x*scale,f.y*scale,f.width*scale,f.height*scale,(canvas.width-width)/2,canvas.height-height,width,height);}
  else {const cropHeight=f.height*.52,cropWidth=cropHeight;const x=f.x+f.width*.5-cropWidth*.5;ctx.drawImage(image,x*scale,f.y*scale,cropWidth*scale,cropHeight*scale,0,0,canvas.width,canvas.height);}
}
