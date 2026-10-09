import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { ROSTER } from '../src/roster.js';

const manifest = JSON.parse(await readFile(new URL('../assets/motions/manifest.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const parts = ['head', 'hair', 'body', 'upperArmL', 'forearmL', 'upperArmR', 'forearmR', 'thighL', 'shinL', 'thighR', 'shinR'];

// Decode alpha from the authoring PNG with standard Node APIs. CI needs no
// Pillow/browser/native image package to check actual opaque crop contents.
function pngAlpha(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8); assert.equal(bytes[25], 6); assert.equal(bytes[28], 0);
  const data = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') data.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(data)), stride = width * 4;
  assert.equal(raw.length, (stride + 1) * height);
  const alpha = Buffer.allocUnsafe(width * height);
  let previous = Buffer.alloc(stride);
  const paeth = (a, b, c) => {
    const prediction = a + b - c, da = Math.abs(prediction - a), db = Math.abs(prediction - b), dc = Math.abs(prediction - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const offset = y * (stride + 1), filter = raw[offset], row = Buffer.allocUnsafe(stride);
    assert.ok(filter <= 4);
    if (filter === 0) raw.copy(row, 0, offset + 1, offset + 1 + stride);
    else for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? row[i - 4] : 0, above = previous[i], corner = i >= 4 ? previous[i - 4] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, corner);
      row[i] = (raw[offset + 1 + i] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) alpha[y * width + x] = row[x * 4 + 3];
    previous = row;
  }
  return { width, height, alpha };
}

test('all ten identities ship separate generated four-view atlases and intact original portraits', async () => {
  assert.equal(manifest.sampleRate, 60);
  assert.deepEqual(Object.keys(manifest.characters).sort(), ROSTER.map(character => character.id).sort());
  const original = JSON.parse(await readFile(new URL('../src/sprites.json', import.meta.url), 'utf8'));
  let size = 0;
  for (const { id } of ROSTER) {
    const meta = manifest.characters[id], image = await readFile(new URL(`../assets/motions/${id}.webp`, import.meta.url));
    assert.equal(meta.source, `../assets/motions/${id}.webp`);
    assert.equal(meta.identity.sourceCharacter, id); assert.equal(meta.identity.generatedDirectionalKit, true);
    assert.equal(image.toString('ascii', 0, 4), 'RIFF'); assert.equal(image.toString('ascii', 8, 12), 'WEBP');
    assert.equal(image.toString('ascii', 12, 16), 'VP8X'); assert.ok(image[20] & 0x10, 'production WebP retains an alpha channel');
    assert.equal(hash(image), meta.webpSha256);
    assert.notEqual(meta.webpSha256, original[id].webpSha256);
    assert.equal(hash(await readFile(new URL(`../assets/sprites/${id}.webp`, import.meta.url))), original[id].webpSha256);
    assert.deepEqual(Object.keys(meta.views).sort(), ['down', 'left', 'right', 'up']);
    assert.equal(new Set(Object.values(meta.views).map(view => JSON.stringify(view.parts.head.rect))).size, 4);
    size += image.length;
  }
  assert.equal(new Set(Object.values(manifest.characters).map(meta => meta.sourceSha256)).size, 10);
  assert.equal(new Set(Object.values(manifest.characters).map(meta => meta.webpSha256)).size, 10);
  assert.ok(size < 6_500_000, 'new articulated artwork stays within the mobile asset budget');
});

test('every generated part has opaque source pixels, valid local joints and overlapping limb cuts', async () => {
  for (const { id } of ROSTER) {
    const meta = manifest.characters[id], bytes = await readFile(new URL(`../assets/motions/source/${id}.png`, import.meta.url));
    assert.equal(hash(bytes), meta.sourceSha256);
    const { width, height, alpha } = pngAlpha(bytes);
    assert.equal(meta.width, width); assert.equal(meta.height, height); assert.equal(hash(alpha), meta.alphaSha256);
    assert.equal(meta.detectedRowGroups.length, 6, `${id}: source rows must actually be separated`);
    for (const [facing, view] of Object.entries(meta.views)) {
      assert.deepEqual(Object.keys(view.parts).sort(), parts.slice().sort());
      for (const [name, item] of Object.entries(view.parts)) {
        const [x, y, w, h] = item.rect;
        assert.ok([x, y, w, h].every(Number.isInteger));
        assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= width && y + h <= height, `${id}/${facing}/${name}`);
        for (const [px, py] of [item.pivot, item.tip]) assert.ok(px >= 0 && py >= 0 && px <= w && py <= h);
        let opaque = 0;
        for (let row = y; row < y + h; row++) for (let column = x; column < x + w; column++) if (alpha[row * width + column] > 64) opaque++;
        assert.ok(opaque > w * h * .01, `${id}/${facing}/${name}: a crop must contain visible anatomy`);
      }
      for (const [upper, lower] of [['upperArmL', 'forearmL'], ['upperArmR', 'forearmR'], ['thighL', 'shinL'], ['thighR', 'shinR']]) {
        const a = view.parts[upper], b = view.parts[lower];
        assert.ok(a.rect[1] + a.rect[3] > b.rect[1], `${id}/${facing}: moving joints retain overlap`);
        assert.ok(Math.abs(a.rect[0] + a.tip[0] - b.rect[0] - b.pivot[0]) < .01);
        assert.ok(Math.abs(a.rect[1] + a.tip[1] - b.rect[1] - b.pivot[1]) < .01);
      }
    }
  }
});

test('reviewed profile mirroring keeps Raven head and body aligned and short hair remains short', () => {
  const raven = manifest.characters.raven.views.left;
  assert.equal(raven.mirror, true); assert.equal(raven.parts.head.mirror, false);
  for (const id of ['ember', 'atlas', 'seraph', 'lynx', 'tempest', 'onyx']) assert.equal(manifest.characters[id].views.left.mirror, false);
  for (const { id } of ROSTER) for (const view of Object.values(manifest.characters[id].views)) {
    assert.equal(typeof view.mirror, 'boolean');
    assert.equal(manifest.characters[id].views.up.mirror, false); assert.equal(manifest.characters[id].views.down.mirror, false);
    if (['atlas', 'valkyrie', 'lynx'].includes(id)) assert.equal(view.hairLengthWorld, 110);
  }
});
