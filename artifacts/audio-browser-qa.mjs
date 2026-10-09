// Optional digital WebAudio probe; NOT executed successfully for the v5 release.
// Default Chrome launch was sandbox-blocked; the escalated launch was user-aborted.
// Run explicitly in an authorized fresh browser environment. No fake clock or subjective listening.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { writeFile, readdir } from 'node:fs/promises';

const urlIndex = process.argv.indexOf('--url');
const gameURL = urlIndex < 0 ? 'http://localhost:5173/' : process.argv[urlIndex + 1];
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: existsSync(chromePath) ? chromePath : undefined });
const output = { gameURL, method: 'Fresh headless Chrome; trusted click unlock; real WebAudio clocks; actual decoded PCM and final-bus analyser readings. No subjective listening.', checks: [], effects: [], errors: [], failures: [] };

async function analyzeSources() {
  const names = (await readdir('assets/audio')).filter(name => /\.(mp3|wav)$/i.test(name)).sort();
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(gameURL);
  await page.evaluate(({ gameURL, names }) => {
    const button = document.createElement('button'); button.id = 'qa-source-unlock'; button.textContent = 'Decode original sport samples';
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:10000';
    button.onclick = async () => {
      try {
        const audio = new AudioContext(); await audio.resume();
        const results = [];
        for (const name of names) {
          const response = await fetch(new URL('assets/audio/' + name, gameURL));
          if (!response.ok) throw new Error(`${name} HTTP ${response.status}`);
          const bytes = await response.arrayBuffer(), buffer = await audio.decodeAudioData(bytes);
          const size = Math.floor(buffer.sampleRate * .02), windows = [];
          let peak = 0, energy = 0, total = 0;
          for (let start = 0; start < buffer.length; start += size) {
            let e = 0, count = 0, localPeak = 0;
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
              const pcm = buffer.getChannelData(channel);
              for (let i = start; i < Math.min(start + size, buffer.length); i++) {
                const value = pcm[i]; e += value * value; count++; localPeak = Math.max(localPeak, Math.abs(value));
              }
            }
            peak = Math.max(peak, localPeak); energy += e; total += count;
            windows.push({ time: start / buffer.sampleRate, rms: Math.sqrt(e / Math.max(1, count)), peak: localPeak });
          }
          const separated = [];
          for (const item of windows.sort((a, b) => b.rms - a.rms)) {
            if (separated.every(other => Math.abs(item.time - other.time) >= .18)) separated.push(item);
            if (separated.length >= 12) break;
          }
          results.push({ name, bytes: bytes.byteLength, duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, peak, rms: Math.sqrt(energy / total), strongestSeparated20msWindows: separated });
        }
        window.qaSourceAnalysis = results; await audio.close();
      } catch (error) { window.qaSourceError = String(error); }
    };
    document.body.append(button);
  }, { gameURL, names });
  await page.locator('#qa-source-unlock').click();
  await page.waitForFunction(() => window.qaSourceAnalysis || window.qaSourceError, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.qaSourceError || null), null);
  const result = await page.evaluate(() => window.qaSourceAnalysis);
  await context.close(); return result;
}

function nativeInstrumentation() {
  window.__audioQA = { contexts: [], decoded: [], errors: [] };
  const constructors = [...new Set([window.AudioContext, window.webkitAudioContext].filter(Boolean))];
  for (const Audio of constructors) {
    const prototype = Audio.prototype;
    const originalDecode = prototype.decodeAudioData;
    prototype.decodeAudioData = function(data, success, failure) {
      const context = this;
      return originalDecode.call(this, data, buffer => {
        let peak = 0, energy = 0, samples = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const pcm = buffer.getChannelData(channel);
          for (let i = 0; i < pcm.length; i++) { peak = Math.max(peak, Math.abs(pcm[i])); energy += pcm[i] ** 2; samples++; }
        }
        window.__audioQA.decoded.push({ context, duration: buffer.duration, channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, frames: buffer.length, peak, rms: Math.sqrt(energy / samples) });
        success?.(buffer);
      }, error => { window.__audioQA.errors.push(String(error)); failure?.(error); });
    };
    for (const method of ['createBufferSource', 'createOscillator']) {
      const original = prototype[method];
      prototype[method] = function(...args) {
        let metrics = window.__audioQA.contexts.find(item => item.context === this);
        if (!metrics) { metrics = { context: this, active: new Set(), maximum: 0, starts: 0, stops: 0 }; window.__audioQA.contexts.push(metrics); }
        const context = this;
        const source = original.apply(this, args), start = source.start, stop = source.stop;
        source.start = function(...values) {
          const result = start.apply(this, values);
          metrics.active.add(source); metrics.maximum = Math.max(metrics.maximum, metrics.active.size); metrics.starts++;
          return result;
        };
        source.stop = function(...values) {
          const result = stop.apply(this, values);
          // Voice stealing stops immediately; its native ended callback arrives later.
          // Future scheduled oscillator stops remain active until their ended event.
          if (!values.length || values[0] <= context.currentTime) metrics.active.delete(source);
          return result;
        };
        source.addEventListener('ended', () => { metrics.active.delete(source); metrics.stops++; });
        return source;
      };
    }
  }
}

async function measure(page, { event, duration = 280, repetitions = 1 } = {}) {
  return page.evaluate(async ({ event, duration, repetitions }) => {
    const audio = window.qaAudio, analyser = window.qaAnalyser;
    const samples = new Float32Array(analyser.fftSize);
    let maximumScheduledVoices = audio.voices?.size || 0;
    for (let i = 0; i < repetitions; i++) if (event) {
      audio.play({ x: 500, y: 600, z: 230, ...event });
      maximumScheduledVoices = Math.max(maximumScheduledVoices, audio.voices?.size || 0);
    }
    const stop = performance.now() + duration;
    let peak = 0, energy = 0, count = 0, snapshots = 0;
    while (performance.now() < stop) {
      analyser.getFloatTimeDomainData(samples);
      for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; count++; }
      snapshots++; await new Promise(resolve => setTimeout(resolve, 8));
    }
    return { peak, rms: Math.sqrt(energy / Math.max(1, count)), snapshots, state: audio.context.state, maximumScheduledVoices };
  }, { event, duration, repetitions });
}

async function settings(page, changes, muted) {
  await page.evaluate(({ changes, muted }) => { Object.assign(window.qaSettings, changes); if (muted !== undefined) window.qaAudio.muted = muted; window.qaAudio.update(); }, { changes, muted });
  await page.waitForTimeout(160);
}

try {
  if (process.argv.includes('--analyze-sources')) {
    output.sourceAnalysis = await analyzeSources();
    output.passed = true; output.checks.push('original local sport samples decoded; separated strongest 20ms RMS windows located');
    console.log(JSON.stringify(output.sourceAnalysis));
  } else {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  await context.addInitScript(nativeInstrumentation);
  const page = await context.newPage();
  const requests = [], responseFailures = [];
  page.on('pageerror', error => output.errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) responseFailures.push({ status: response.status(), url: response.url() });
    if (/\.(?:mp3|wav)(?:\?|$)/i.test(response.url())) requests.push({ status: response.status(), url: response.url() });
  });
  await page.goto(gameURL);
  await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
  await page.evaluate(async gameURL => {
    const { GameAudio } = await import(new URL('src/audio.js', gameURL).href);
    window.qaSettings = { sfx: true, music: false, muted: false };
    window.qaAudio = new GameAudio(window.qaSettings);
    const button = document.createElement('button'); button.id = 'qa-unlock'; button.textContent = 'Unlock audio QA';
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:10000';
    button.onclick = async () => {
      try { await window.qaAudio.unlock(); window.qaUnlocked = true; }
      catch (error) { window.qaUnlockError = String(error); }
    };
    document.body.append(button);
  }, gameURL);
  await page.locator('#qa-unlock').click();
  await page.waitForFunction(() => window.qaUnlocked || window.qaUnlockError, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.qaUnlockError || null), null);
  await page.evaluate(async () => {
    const audio = window.qaAudio;
    if (audio.ready?.then) await audio.ready;
    if (audio.loading?.then) await audio.loading;
    const output = audio.output || audio.limiter || audio.master;
    window.qaAnalyser = audio.context.createAnalyser(); window.qaAnalyser.fftSize = 2048;
    window.qaProbeSink = audio.context.createGain(); window.qaProbeSink.gain.value = 0;
    output.connect(window.qaAnalyser); window.qaAnalyser.connect(window.qaProbeSink); window.qaProbeSink.connect(audio.context.destination);
  });
  await page.waitForFunction(() => window.__audioQA.decoded.some(item => item.context === window.qaAudio.context), { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.qaAudio.context.state), 'running');
  output.checks.push('trusted click unlock starts a real running AudioContext');
  output.decoded = await page.evaluate(() => window.__audioQA.decoded.filter(item => item.context === window.qaAudio.context).map(({ context, ...item }) => item));
  assert.ok(output.decoded.length > 0);
  for (const clip of output.decoded) { assert.ok(clip.duration > 0 && clip.frames > 0 && clip.rms > .0001); assert.ok(Number.isFinite(clip.peak)); }
  output.checks.push('sampled originals decode with finite, nonzero PCM');
  assert.deepEqual(await page.evaluate(() => window.qaAudio.loadErrors), []);
  output.runtimeBuffers = await page.evaluate(() => [...window.qaAudio.buffers].flatMap(([bank, buffers]) => buffers.map((buffer, index) => {
    let peak = 0, energy = 0, frames = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) for (const sample of buffer.getChannelData(channel)) {
      peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; frames++;
    }
    return { bank, index, duration: buffer.duration, channels: buffer.numberOfChannels, frames: buffer.length, peak, rms: Math.sqrt(energy / frames) };
  })));
  assert.equal(output.runtimeBuffers.length, 8);
  for (const clip of output.runtimeBuffers) { assert.ok(clip.frames > 0 && clip.duration > 0 && clip.rms > .0001); assert.ok(clip.peak <= .720001, `Runtime ${clip.bank}/${clip.index} exceeds normalized headroom: ${clip.peak}`); }
  output.checks.push('eight isolated runtime contact clips have nonzero PCM and normalized headroom');

  for (const event of [{ type: 'hit', kind: 'set' }, { type: 'hit', kind: 'receive' }, { type: 'hit', kind: 'serve' }, { type: 'hit', kind: 'spike', perfect: true }, { type: 'hit', kind: 'block', perfect: true }, { type: 'jump' }, { type: 'land' }, { type: 'net' }, { type: 'point', team: 0 }, { type: 'finish', winner: 0 }]) {
    const measured = await measure(page, { event, duration: 350 });
    assert.ok(measured.rms > .0001, `${event.type}/${event.kind || ''} has silent output`);
    assert.ok(measured.peak < 1, `${event.type}/${event.kind || ''} clips at ${measured.peak}`);
    output.effects.push({ event, ...measured });
    await page.waitForTimeout(500);
  }
  output.checks.push('toss, receive, serve, spike, block, jump, sand landing, net, point and finish produce real audible-range digital output without clipping');

  await settings(page, { sfx: false, music: false });
  const disabled = await measure(page, { event: { type: 'hit', kind: 'spike', perfect: true }, duration: 250 });
  assert.ok(disabled.rms < .00005, `Disabled SFX leaks output (${disabled.rms})`);
  output.sfxDisabled = disabled;
  await settings(page, { music: true });
  const ambience = await measure(page, { duration: 700 });
  assert.ok(ambience.rms > .0001, 'Music/ambience should work while SFX are disabled');
  output.musicWithSfxOff = ambience;
  await settings(page, {}, true);
  const muted = await measure(page, { event: { type: 'hit', kind: 'spike' }, duration: 300 });
  assert.ok(muted.rms < .00005, `Mute leaks output (${muted.rms})`);
  output.muted = muted;
  await settings(page, { music: false, sfx: true }, false);
  const effectOnly = await measure(page, { event: { type: 'hit', kind: 'block' }, duration: 300 });
  assert.ok(effectOnly.rms > .0001, 'SFX should work while music/ambience are disabled');
  output.sfxWithMusicOff = effectOnly;
  output.checks.push('SFX, music/ambience and global mute control their buses independently');

  await page.evaluate(() => window.qaAudio.suspend());
  assert.equal(await page.evaluate(() => window.qaAudio.context.state), 'suspended');
  await page.evaluate(() => window.qaAudio.resume());
  assert.equal(await page.evaluate(() => window.qaAudio.context.state), 'running');
  const resumed = await measure(page, { event: { type: 'hit', kind: 'spike' } });
  assert.ok(resumed.rms > .0001);
  output.checks.push('suspend and resume preserve decoded clips and restore effects');

  output.stress = await measure(page, { event: { type: 'hit', kind: 'spike', perfect: true }, repetitions: 100, duration: 500 });
  assert.ok(output.stress.rms > .0001); assert.ok(output.stress.peak < 1, `Repeated impacts clip (${output.stress.peak})`);
  assert.ok(output.stress.maximumScheduledVoices <= 24, `Scheduler exceeded its 24-voice cap: ${output.stress.maximumScheduledVoices}`);
  output.voices = await page.evaluate(() => {
    const metrics = window.__audioQA.contexts.find(item => item.context === window.qaAudio.context);
    return { active: metrics?.active.size || 0, maximum: metrics?.maximum || 0, starts: metrics?.starts || 0, stops: metrics?.stops || 0, scheduled: window.qaAudio.voices.size };
  });
  assert.ok(output.voices.scheduled <= 24);
  assert.ok(output.voices.maximum <= 40, `Voices grow without a useful bound: ${output.voices.maximum}`);
  output.checks.push('100 repeated impacts keep native voices bounded and final mix unclipped');
  assert.deepEqual(responseFailures, []); assert.deepEqual(output.errors, []);
  assert.deepEqual(await page.evaluate(() => window.__audioQA.errors), []);
  output.sampleRequests = requests;
  await page.evaluate(() => window.qaAudio.context.close());
  await context.close();

  // A second fresh context tests the normal game path without the standalone probe.
  const gameContext = await browser.newContext({ viewport: { width: 393, height: 852 } });
  await gameContext.addInitScript(nativeInstrumentation);
  const gamePage = await gameContext.newPage();
  const gameSamples = [];
  gamePage.on('pageerror', error => output.errors.push(error.message));
  gamePage.on('response', response => {
    if (response.status() >= 400) output.failures.push({ status: response.status(), url: response.url() });
    if (/\.(?:mp3|wav)(?:\?|$)/i.test(response.url())) gameSamples.push({ status: response.status(), url: response.url() });
  });
  await gamePage.goto(gameURL);
  await gamePage.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
  await gamePage.getByRole('button', { name: '경기 시작', exact: true }).click();
  await gamePage.waitForSelector('body[data-phase="rally"]');
  await gamePage.waitForTimeout(1500);
  output.game = await gamePage.evaluate(() => ({ decodes: window.__audioQA.decoded.length, errors: window.__audioQA.errors, contextStates: window.__audioQA.contexts.map(item => item.context.state) }));
  output.game.sampleRequests = gameSamples;
  assert.ok(output.game.decodes > 0); assert.deepEqual(output.game.errors, []);
  const origin = new URL(gameURL).origin;
  for (const request of [...requests, ...gameSamples]) { assert.equal(new URL(request.url).origin, origin); assert.equal(request.status, 200); }
  output.checks.push('normal mobile game unlocks/decodes local samples with no page or request errors');
  assert.deepEqual(output.errors, []); assert.deepEqual(output.failures, []);
  output.passed = true;
  await gameContext.close();
  }
} catch (error) {
  output.passed = false; output.failures.push(error.stack || String(error));
  throw error;
} finally {
  await writeFile('artifacts/audio-browser-results.json', JSON.stringify(output, null, 2));
  await browser.close();
  console.log(JSON.stringify({ passed: output.passed, checks: output.checks, failures: output.failures, voices: output.voices, stress: output.stress }));
}
