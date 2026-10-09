// Recorded CC0 volleyball contacts and sand foley. See assets/audio/SOURCES.md.
const AUDIO_FILES = {
  outdoor: 'volleyball-outdoor.mp3', spike: 'volleyball-spike.mp3',
  whistle: 'referee-whistle.mp3', sand: 'sand-footsteps.mp3',
};
const MAX_VOICES = 24;

export class GameAudio {
  constructor(settings) {
    this.settings = settings; this.context = null; this.muted = false;
    this.timer = null; this.beat = 0; this.ambient = null;
    this.buffers = new Map(); this.voices = new Set(); this.ready = null;
    this.loadErrors = []; this.pendingHit = null; this.loadingSamples = false;
    this.preload();
  }

  preload() {
    if (!this.preloaded) {
      this.fileLoads = Object.entries(AUDIO_FILES).map(async ([key, file]) => {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(new URL(`../assets/audio/${file}`, import.meta.url), { signal: controller.signal });
        if (!response.ok) throw new Error(`Audio ${file}: ${response.status}`);
        return [key, await response.arrayBuffer()];
      } catch (error) { this.loadErrors.push(String(error)); return [key, null]; }
      finally { clearTimeout(timeout); }
      });
      this.preloaded = Promise.all(this.fileLoads);
    }
    return this.preloaded;
  }

  async unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain(); this.master.gain.value = this.muted ? 0 : .85;
      this.effects = this.context.createGain(); this.music = this.context.createGain();
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -10; compressor.knee.value = 8; compressor.ratio.value = 5;
      compressor.attack.value = .003; compressor.release.value = .12;
      // A bounded final transfer function leaves headroom during overlapping hits.
      const limiter = this.context.createWaveShaper(), curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / (curve.length - 1) * 2 - 1) * .95) * .94;
      limiter.curve = curve; limiter.oversample = '2x';
      this.effects.connect(compressor); this.music.connect(compressor);
      compressor.connect(limiter); limiter.connect(this.master); this.master.connect(this.context.destination);
      this.noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const channel = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
      this.loadingSamples = true;
      this.ready = this.decodeSamples().finally(() => { this.loadingSamples = false; });
    }
    // Resume during the gesture, before waiting for network or decoding work.
    if (this.context.state === 'suspended') await this.context.resume();
    this.update();
    await this.ready;
    // A dialog may have suspended the context while loading; never resume it here.
    this.flushPending();
  }

  async decodeSamples() {
    this.preload();
    // Decode each bank as soon as its bytes arrive; sand must not delay a serve.
    await Promise.all(this.fileLoads.map(async load => {
      const [key, bytes] = await load;
      if (!bytes) return;
      try {
        const source = await this.context.decodeAudioData(bytes.slice(0));
        if (key === 'whistle') this.buffers.set(key, [this.trim(source, .85)]);
        else this.buffers.set(key, this.contacts(source, key === 'spike' ? 1 : 3, key === 'sand' ? .32 : .29));
        this.flushPending();
      } catch (error) { this.loadErrors.push(`${key}: ${error}`); }
    }));
    return this.buffers;
  }

  flushPending() {
    if (!this.pendingHit || this.context.state !== 'running') return;
    const { event, at } = this.pendingHit, key = event.kind === 'spike' ? 'spike' : 'outdoor';
    if (this.loadingSamples && !this.buffers.has(key)) return;
    this.pendingHit = null;
    if (this.context.currentTime - at < .3) this.play(event);
  }

  contacts(source, count, duration) {
    // Isolate impacts in public recordings, leaving out the speech/room bed.
    const mono = this.mono(source), stride = Math.max(1, Math.round(source.sampleRate * .015));
    const peaks = [];
    for (let i = 0; i < mono.length; i += stride) {
      let energy = 0;
      for (let n = i; n < Math.min(mono.length, i + stride); n++) energy += mono[n] * mono[n];
      peaks.push({ frame: i, energy: energy / stride });
    }
    peaks.sort((a, b) => b.energy - a.energy);
    const chosen = [];
    for (const peak of peaks) {
      if (chosen.every(other => Math.abs(other.frame - peak.frame) > source.sampleRate * .42)) chosen.push(peak);
      if (chosen.length === count) break;
    }
    return chosen.map(peak => this.cut(mono, source.sampleRate, Math.max(0, peak.frame - source.sampleRate * .027), duration));
  }

  mono(source) {
    const mono = new Float32Array(source.length);
    for (let channel = 0; channel < source.numberOfChannels; channel++) {
      const data = source.getChannelData(channel);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / source.numberOfChannels;
    }
    return mono;
  }

  trim(source, duration) {
    const mono = this.mono(source); let peak = .0001;
    for (const sample of mono) peak = Math.max(peak, Math.abs(sample));
    let start = 0;
    while (start < mono.length && Math.abs(mono[start]) < peak * .035) start++;
    return this.cut(mono, source.sampleRate, Math.max(0, start - source.sampleRate * .008), duration);
  }

  cut(mono, sampleRate, start, duration) {
    start = Math.floor(start);
    const length = Math.max(1, Math.min(mono.length - start, Math.round(sampleRate * duration)));
    const buffer = this.context.createBuffer(1, length, sampleRate), data = buffer.getChannelData(0);
    // Remove DC/low room rumble, normalize with headroom, then fade tails.
    const pole = Math.exp(-2 * Math.PI * 65 / sampleRate);
    let previous = mono[start] || 0, filtered = 0, peak = .0001;
    for (let i = 0; i < length; i++) {
      const value = mono[start + i]; filtered = value - previous + pole * filtered; previous = value;
      data[i] = filtered; peak = Math.max(peak, Math.abs(filtered));
    }
    const scale = .72 / peak, attack = Math.max(1, sampleRate * .0015), tail = Math.max(1, sampleRate * .075);
    for (let i = 0; i < length; i++) data[i] *= scale * Math.min(1, i / attack, (length - 1 - i) / tail);
    return buffer;
  }

  track(source, nodes = []) {
    if (this.voices.size >= MAX_VOICES) { const oldest = this.voices.values().next().value; oldest.stop(); this.voices.delete(oldest); }
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); nodes.forEach(node => node.disconnect()); };
    return source;
  }

  sample(key, volume, { rate = 1, pan = 0, delay = 0, lowpass = 0 } = {}) {
    const clips = this.buffers.get(key);
    if (!clips?.length || !this.context || this.context.state !== 'running') return false;
    const source = this.context.createBufferSource(), gain = this.context.createGain(), nodes = [gain];
    source.buffer = clips[Math.floor(Math.random() * clips.length)];
    source.playbackRate.value = rate * (.97 + Math.random() * .06); gain.gain.value = volume;
    let output = source;
    if (lowpass) { const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = lowpass; output.connect(filter); output = filter; nodes.push(filter); }
    if (this.context.createStereoPanner) { const panner = this.context.createStereoPanner(); panner.pan.value = Math.max(-.55, Math.min(.55, pan)); output.connect(panner); output = panner; nodes.push(panner); }
    output.connect(gain); gain.connect(this.effects); this.track(source, nodes);
    source.start(this.context.currentTime + delay); return true;
  }

  tone(frequency, time, duration = .15, volume = .2, type = 'sine', endFrequency, bus = this.effects) {
    if (!this.context) return;
    const osc = this.context.createOscillator(), gain = this.context.createGain(); osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(Math.max(.001, volume), time + .003);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    osc.connect(gain); gain.connect(bus); this.track(osc, [gain]); osc.start(time); osc.stop(time + duration + .03);
  }

  noise(time, duration, volume, frequency = 1800) {
    if (!this.context) return;
    const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
    source.buffer = this.noiseBuffer; filter.type = 'lowpass'; filter.frequency.setValueAtTime(frequency, time);
    filter.frequency.exponentialRampToValueAtTime(160, time + duration); gain.gain.setValueAtTime(Math.max(.001, volume), time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.effects); this.track(source, [filter, gain]);
    source.start(time); source.stop(time + duration + .01);
  }

  play(event) {
    if (!this.context || this.context.state !== 'running' || !this.settings.sfx || this.muted) return;
    const t = this.context.currentTime, pan = ((event.x ?? 500) - 500) / 950;
    if (event.type === 'hit') {
      const key = event.kind === 'spike' ? 'spike' : 'outdoor';
      if (!this.buffers.has(key) && this.loadingSamples) { this.pendingHit = { event, at: t }; return; }
      let played;
      if (event.kind === 'spike') played = this.sample(key, event.perfect ? .96 : .78, { pan, rate: event.perfect ? .96 : 1 });
      else if (event.kind === 'block') {
        played = this.sample(key, .68, { pan, rate: 1.08 });
        this.sample(key, .24, { pan, rate: .9, delay: .025, lowpass: 2500 });
      } else if (event.kind === 'set') played = this.sample(key, .42, { pan, rate: 1.12, lowpass: 2700 });
      else played = this.sample(key, event.kind === 'serve' ? .62 : .52, { pan, lowpass: 5700 });
      // Leather/hand slap leads; a quiet low accent adds weight to strong contacts.
      if (played && (event.kind === 'spike' || event.kind === 'block')) this.tone(event.perfect ? 100 : 86, t, .075, event.perfect ? .055 : .025, 'sine', 43);
      if (!played) { this.tone(event.kind === 'set' ? 180 : 120, t, .09, .15, 'triangle', 65); this.noise(t, .045, .12, 2400); }
    } else if (event.type === 'jump' || event.type === 'land') {
      if (!this.sample('sand', event.type === 'land' ? .23 : .13, { pan, rate: event.type === 'land' ? .86 : 1.14 })) this.noise(t, .09, .09, 950);
    } else if (event.type === 'net') {
      if (!this.sample('outdoor', .25, { pan, rate: .78, lowpass: 1400 })) this.noise(t, .12, .12, 900);
    } else if (event.type === 'point') {
      this.sample('whistle', .3, { rate: 1 });
      this.jingle(event.team === 0 ? [523, 659, 784] : [392, 330], .09);
    } else if (event.type === 'finish') {
      this.sample('whistle', .28);
      this.jingle(event.winner === 0 ? [523, 659, 784, 1047, 784, 1047] : [392, 349, 330], .12);
    }
  }

  click() { if (this.context?.state === 'running' && this.settings.sfx && !this.muted) this.tone(700, this.context.currentTime, .045, .045, 'sine', 450); }
  jingle(notes, step) { const time = this.context.currentTime; notes.forEach((note, index) => this.tone(note, time + index * step, .16, .065)); }

  update() {
    if (!this.context) return;
    const t = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : .85, t, .025);
    this.effects.gain.setTargetAtTime(this.settings.sfx ? 1 : 0, t, .015);
    this.music.gain.setTargetAtTime(this.settings.music ? 1 : 0, t, .025);
    const shouldPlay = this.settings.music && !this.muted && this.context.state === 'running';
    if (shouldPlay && !this.timer) {
      const melody = [523, 0, 659, 784, 0, 659, 587, 0, 523, 659, 0, 880, 784, 0, 659, 0];
      this.timer = setInterval(() => {
        if (!this.settings.music || this.muted || this.context.state !== 'running') return;
        const note = melody[this.beat++ % melody.length];
        if (note) { this.tone(note, this.context.currentTime, .36, .018, 'sine', undefined, this.music); this.tone(note * 2, this.context.currentTime, .12, .005, 'sine', undefined, this.music); }
      }, 265);
      const sea = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
      sea.buffer = this.noiseBuffer; sea.loop = true; filter.type = 'lowpass'; filter.frequency.value = 450; gain.gain.value = .022;
      sea.connect(filter); filter.connect(gain); gain.connect(this.music); sea.start(); this.ambient = { sea, gain, filter };
    } else if (!shouldPlay && this.timer) {
      clearInterval(this.timer); this.timer = null;
      this.ambient?.sea.stop(); this.ambient?.sea.disconnect(); this.ambient?.gain.disconnect(); this.ambient?.filter.disconnect(); this.ambient = null;
    }
  }

  async suspend() { if (this.context) { this.pendingHit = null; await this.context.suspend(); this.update(); } }
  async resume() { if (this.context) { await this.context.resume(); this.update(); } }
}
