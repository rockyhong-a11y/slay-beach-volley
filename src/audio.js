export class GameAudio {
  constructor(settings){this.settings=settings;this.context=null;this.muted=false;this.timer=null;this.beat=0;this.ambient=null;}
  async unlock(){
    if(!this.context){
      const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
      this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.muted?0:.38;this.master.connect(this.context.destination);
      this.noiseBuffer=this.context.createBuffer(1,this.context.sampleRate*2,this.context.sampleRate);const channel=this.noiseBuffer.getChannelData(0);for(let i=0;i<channel.length;i++)channel[i]=Math.random()*2-1;
    }
    if(this.context.state==='suspended')await this.context.resume();
    this.update();
  }
  tone(frequency,time,duration=.15,volume=.2,type='sine',endFrequency){
    if(!this.context)return;const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,time);if(endFrequency)osc.frequency.exponentialRampToValueAtTime(endFrequency,time+duration);
    gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(Math.max(.001,volume),time+.003);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);osc.connect(gain);gain.connect(this.master);osc.start(time);osc.stop(time+duration+.03);
  }
  noise(time,duration,volume,frequency=1800){
    if(!this.context)return;const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),gain=this.context.createGain();source.buffer=this.noiseBuffer;filter.type='lowpass';filter.frequency.setValueAtTime(frequency,time);filter.frequency.exponentialRampToValueAtTime(160,time+duration);gain.gain.setValueAtTime(Math.max(.001,volume),time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(time);source.stop(time+duration+.01);
  }
  play(event){
    if(!this.context||this.context.state!=='running'||!this.settings.sfx||this.muted)return;const t=this.context.currentTime;
    if(event.type==='hit'){
      if(event.kind==='spike'||event.kind==='block'){this.tone(event.perfect?170:140,t,.16,event.perfect?.9:.6,'triangle',45);this.noise(t,.065,event.perfect?.8:.5,4200);this.tone(950,t+.012,.07,.13,'sine',260);if(event.perfect){this.tone(1320,t+.07,.16,.14);this.tone(1760,t+.1,.16,.1);}}
      else if(event.kind==='set'){this.tone(450,t,.09,.22,'sine',250);this.noise(t,.035,.1,1200);}
      else {this.tone(210,t,.12,.35,'triangle',75);this.noise(t,.055,.24,2100);}
    }else if(event.type==='jump'){this.noise(t,.08,.11,800);this.tone(190,t,.1,.09,'sine',360);}
    else if(event.type==='land')this.noise(t,.08,.12,900);
    else if(event.type==='net'){this.noise(t,.12,.25,900);this.tone(85,t,.11,.2,'sawtooth',60);}
    else if(event.type==='point')this.jingle(event.team===0?[523,659,784]:[392,330],.09);
    else if(event.type==='finish')this.jingle(event.winner===0?[523,659,784,1047,784,1047]:[392,349,330],.12);
  }
  click(){if(this.context&&this.settings.sfx&&!this.muted)this.tone(700,this.context.currentTime,.055,.1,'sine',450);}
  jingle(notes,step){const time=this.context.currentTime;notes.forEach((note,index)=>this.tone(note,time+index*step,.2,.2));}
  update(){
    if(!this.context)return;
    this.master.gain.setTargetAtTime(this.muted?0:.38,this.context.currentTime,.03);
    const shouldPlay=this.settings.music&&!this.muted&&this.context.state==='running';
    if(shouldPlay&&!this.timer){
      const melody=[523,0,659,784,0,659,587,0,523,659,0,880,784,0,659,0];
      this.timer=setInterval(()=>{if(!this.settings.music||this.muted||this.context.state!=='running')return;const note=melody[this.beat++%melody.length];if(note){this.tone(note,this.context.currentTime,.36,.045);this.tone(note*2,this.context.currentTime,.12,.012);}},265);
      const sea=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),gain=this.context.createGain();sea.buffer=this.noiseBuffer;sea.loop=true;filter.type='lowpass';filter.frequency.value=450;gain.gain.value=.055;sea.connect(filter);filter.connect(gain);gain.connect(this.master);sea.start();this.ambient={sea,gain};
    }else if(!shouldPlay&&this.timer){clearInterval(this.timer);this.timer=null;this.ambient?.sea.stop();this.ambient=null;}
  }
  async suspend(){if(this.context){await this.context.suspend();this.update();}}
  async resume(){if(this.context){await this.context.resume();this.update();}}
}
