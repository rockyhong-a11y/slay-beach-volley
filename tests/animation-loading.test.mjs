import test from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../src/roster.js';

const clips = ['run', 'toss', 'spike', 'block'];
const manifest = { characters: Object.fromEntries(ROSTER.map(({ id }) => [id, { clips: Object.fromEntries(clips.map(clip => [clip, { image: `${id}-${clip}.webp` }])) }])) };
let fixtureIndex = 0;
async function fixture({ autoLoad = true, deferredDecode = false } = {}) {
  const previousImage = globalThis.Image, previousFetch = globalThis.fetch;
  const images = [], decoders = []; let fetches = 0;
  globalThis.Image = class {
    constructor() { this.value = ''; this.decodes = 0; images.push(this); }
    set src(value) { this.value = value; if (autoLoad) queueMicrotask(() => this.onload?.()); }
    get src() { return this.value; }
    removeAttribute(name) { if (name === 'src') this.value = ''; }
    decode() { this.decodes++; return deferredDecode ? new Promise(resolve => decoders.push(resolve)) : Promise.resolve(); }
  };
  globalThis.fetch = async () => { fetches++; return { ok: true, json: async () => manifest }; };
  const api = await import(new URL(`../src/sprite-animation.js?loader-fixture=${fixtureIndex++}`, import.meta.url));
  return { ...api, images, decoders, fetches: () => fetches, restore: () => { globalThis.Image = previousImage; globalThis.fetch = previousFetch; } };
}

test('reading the ten-player manifest does not allocate or decode any sheets', async () => {
  const f = await fixture();
  try {
    const [first, second] = await Promise.all([f.loadAnimationManifest(), f.loadAnimationManifest()]);
    assert.equal(first, manifest); assert.equal(second, manifest); assert.equal(f.fetches(), 1);
    assert.equal(f.images.length, 0);
    const empty = await f.loadAnimationAssets({ ids: [], manifest });
    assert.deepEqual(empty.images, {}); assert.equal(f.images.length, 0);
  } finally { f.restore(); }
});

test('four current players load only sixteen sheets and wait for actual decoding', async () => {
  const f = await fixture({ deferredDecode: true });
  try {
    const ids = ['tempest', 'onyx', 'raven', 'valkyrie']; let ready = false;
    const preparation = f.loadAnimationAssets({ ids, manifest }).then(result => { ready = true; return result; });
    await new Promise(setImmediate);
    assert.equal(f.images.length, 16); assert.equal(f.decoders.length, 16); assert.equal(ready, false);
    for (const resolve of f.decoders) resolve();
    const loaded = await preparation;
    assert.deepEqual(Object.keys(loaded.images), ids);
    for (const id of ids) assert.deepEqual(Object.keys(loaded.images[id]), clips);
    assert.ok(f.images.every(image => image.decodes === 1)); assert.equal(f.fetches(), 0);
  } finally { f.restore(); }
});

test('superseded team loads abort and release every in-flight image', async () => {
  const f = await fixture({ autoLoad: false });
  try {
    const controller = new AbortController();
    const preparation = f.loadAnimationAssets({ ids: ROSTER.slice(0, 4).map(player => player.id), manifest, signal: controller.signal });
    assert.equal(f.images.length, 16); controller.abort();
    await assert.rejects(preparation, { name: 'AbortError' });
    assert.ok(f.images.every(image => image.src === '' && image.onload === null && image.onerror === null));
    assert.equal(f.images.reduce((count, image) => count + image.decodes, 0), 0);
  } finally { f.restore(); }
});

test('a failed sheet releases sibling loads rather than retaining a partial team', async () => {
  const f = await fixture({ autoLoad: false });
  try {
    const preparation = f.loadAnimationAssets({ ids: ['nova', 'raven'], manifest });
    f.images[0].onerror();
    await assert.rejects(preparation, /Animation sheet failed: nova\/run/);
    assert.ok(f.images.every(image => image.src === '' && image.onload === null && image.onerror === null));
  } finally { f.restore(); }
});

test('retiring one team leaves no loader cache holding its decoded sheets', async () => {
  const f = await fixture();
  try {
    const first = await f.loadAnimationAssets({ ids: ROSTER.slice(0, 4).map(player => player.id), manifest });
    for (const sheets of Object.values(first.images)) for (const image of Object.values(sheets)) image.removeAttribute('src');
    const second = await f.loadAnimationAssets({ ids: ROSTER.slice(4, 8).map(player => player.id), manifest });
    assert.deepEqual(Object.keys(second.images), ROSTER.slice(4, 8).map(player => player.id));
    assert.equal(f.images.filter(image => image.src).length, 16);
    assert.ok(f.images.slice(0, 16).every(image => image.src === ''));
  } finally { f.restore(); }
});
