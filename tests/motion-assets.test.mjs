import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { ROSTER } from '../src/roster.js';

const manifest = JSON.parse(await readFile(new URL('../assets/animation/manifest.json', import.meta.url), 'utf8'));
const reviewedOverrides = JSON.parse(await readFile(new URL('../tools/animation-overrides.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clips = ['run', 'toss', 'spike', 'block'];
const facings = ['down', 'up', 'left', 'right'];

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


function connectedFigures({ width, height, alpha }) {
  const visited = new Uint8Array(alpha.length), components = [];
  for (let seed = 0; seed < alpha.length; seed++) {
    if (visited[seed] || alpha[seed] <= 64) continue;
    visited[seed] = 1;
    const stack = [seed]; let count = 0, left = width, top = height, right = 0, bottom = 0;
    while (stack.length) {
      const pixel = stack.pop(), x = pixel % width, y = Math.floor(pixel / width);
      count++; left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      const neighbours = [];
      if (x) neighbours.push(pixel - 1); if (x + 1 < width) neighbours.push(pixel + 1);
      if (y) neighbours.push(pixel - width); if (y + 1 < height) neighbours.push(pixel + width);
      for (const neighbour of neighbours) if (!visited[neighbour] && alpha[neighbour] > 64) { visited[neighbour] = 1; stack.push(neighbour); }
    }
    if (count > Math.max(1500, width * height / 800)) components.push({ rect: [left, top, right - left, bottom - top], count });
  }
  return components;
}

test('all ten original identities ship four whole-body animation clips with six poses in each direction', async () => {
  assert.equal(ROSTER.length, 10);
  assert.deepEqual(Object.keys(manifest.characters).sort(), ROSTER.map(character => character.id).sort());
  assert.equal(manifest.sampleRate, 60); assert.equal(manifest.framesPerClip, 6);
  assert.equal(manifest.style, 'original-2d-whole-body');
  const original = JSON.parse(await readFile(new URL('../src/sprites.json', import.meta.url), 'utf8'));
  for (const { id } of ROSTER) {
    const character = manifest.characters[id];
    assert.equal(character.sourceCharacter, id);
    assert.equal(character.style, 'original-2d-whole-body');
    assert.deepEqual(Object.keys(character.clips).sort(), clips.slice().sort());
    assert.equal(character.sourceSpriteSha256, original[id].webpSha256);
    assert.equal(hash(await readFile(new URL(`../assets/sprites/${id}.webp`, import.meta.url))), character.sourceSpriteSha256);
    assert.equal(hash(await readFile(new URL(`../assets/portraits/${id}.webp`, import.meta.url))), character.sourcePortraitSha256);
    for (const clip of Object.values(character.clips)) {
      assert.deepEqual(Object.keys(clip.views).sort(), facings.slice().sort());
      for (const frames of Object.values(clip.views)) assert.equal(frames.length, 6);
    }
  }
});

test('all selected complete figures retain original source anatomy and alpha, including separately generated corrections', async () => {
  for (const [id, character] of Object.entries(manifest.characters)) for (const [name, clip] of Object.entries(character.clips)) {
    const frames = Object.values(clip.views).flat();
    assert.equal(clip.packing, 'whole-figure-shelves');
    assert.ok(clip.sources.length >= 1);
    assert.equal(clip.sources[0].source, clip.source);
    assert.equal(clip.sources[0].sourceSha256, clip.sourceSha256);
    assert.equal(clip.sources[0].sourceAlphaSha256, clip.sourceAlphaSha256);
    assert.equal(clip.sources[0].width, clip.sourceWidth); assert.equal(clip.sources[0].height, clip.sourceHeight);
    let selectedCount = 0;
    for (const descriptor of clip.sources) {
      const bytes = await readFile(new URL(descriptor.source, new URL('../assets/animation/manifest.json', import.meta.url)));
      assert.equal(hash(bytes), descriptor.sourceSha256, `${id}/${name}: preserved authoring image remains unchanged`);
      const source = pngAlpha(bytes), figures = connectedFigures(source);
      assert.equal(source.width, descriptor.width); assert.equal(source.height, descriptor.height);
      assert.equal(hash(source.alpha), descriptor.sourceAlphaSha256);
      assert.equal(figures.length, descriptor.rows * descriptor.columns, `${id}/${name}: source figures must not overlap or touch`);
      assert.deepEqual(descriptor.components.map(component => JSON.stringify(component.sourceVisibleRect)).sort(), figures.map(figure => JSON.stringify(figure.rect)).sort());
      let positive = 0, opaque = 0;
      for (const value of source.alpha) { positive += value > 0; opaque += value > 64; }
      assert.equal(descriptor.components.reduce((sum, component) => sum + component.positiveAlphaPixels, 0), positive, `${id}/${name}: extraction retains every source antialias pixel`);
      assert.equal(descriptor.components.reduce((sum, component) => sum + component.opaquePixels, 0), opaque, `${id}/${name}: extraction retains every opaque source pixel`);
      const selected = frames.filter(frame => frame.source === descriptor.source);
      assert.deepEqual(selected.map(frame => frame.sourceComponentIndex).sort((a, b) => a - b), descriptor.selectedComponentIndices);
      assert.equal(new Set(descriptor.selectedComponentIndices).size, selected.length, 'a full source pose is never duplicated into the action sequence');
      selectedCount += selected.length;
      for (const frame of selected) {
        const component = descriptor.components[frame.sourceComponentIndex];
        assert.deepEqual(frame.sourceRect, component.sourceRect); assert.deepEqual(frame.sourceVisibleRect, component.sourceVisibleRect);
        assert.equal(frame.rgbaSha256, component.rgbaSha256); assert.equal(frame.alphaSha256, component.alphaSha256);
        assert.equal(frame.positiveAlphaPixels, component.positiveAlphaPixels); assert.equal(frame.opaquePixels, component.opaquePixels);
        const [sx, sy, sw, sh] = frame.sourceRect, [x, y, width, height] = frame.sourceVisibleRect;
        assert.ok(sx >= 0 && sy >= 0 && sw > 0 && sh > 0 && sx + sw <= source.width && sy + sh <= source.height);
        assert.ok(x >= sx && y >= sy && x + width <= sx + sw && y + height <= sy + sh, `${id}/${name}: whole anatomy remains inside its extracted crop`);
        assert.ok(x > 0 && y > 0 && x + width < source.width && y + height < source.height, `${id}/${name}: source canvas does not crop a head, hand or boot`);
        assert.equal(frame.componentSha256, frame.rgbaSha256);
        assert.match(frame.componentSha256, /^[0-9a-f]{64}$/); assert.match(frame.alphaSha256, /^[0-9a-f]{64}$/);
      }
    }
    assert.equal(selectedCount, 24, `${id}/${name}: exactly 24 selected complete figures`);
    assert.equal(clip.alphaSha256, clip.repackedAlphaSha256);
    assert.equal(clip.decodedAlphaSha256, clip.repackedAlphaSha256, `${id}/${name}: WebP retains the exact repacked alpha`);
  }
});

test('whole poses have distinct artwork, generous packed gutters and ground pivots at the actual boots', () => {
  for (const [id, character] of Object.entries(manifest.characters)) for (const [name, clip] of Object.entries(character.clips)) for (const [facing, frames] of Object.entries(clip.views)) {
    assert.equal(new Set(frames.map(frame => frame.componentSha256)).size, 6, `${id}/${name}/${facing}: six actual source poses`);
    for (const frame of frames) {
      const [x, y, width, height] = frame.rect, [px, py] = frame.pivot;
      assert.ok([x, y, width, height].every(Number.isInteger));
      assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= clip.width && y + height <= clip.height);
      assert.ok(px >= 0 && py >= 0 && px <= width && py <= height);
      assert.ok(frame.clearance.every(value => value >= 8), `${id}/${name}/${facing}: source poses cannot bleed into neighbours`);
      const [cx, cy, cw, ch] = frame.cell;
      assert.deepEqual(frame.clearance, [x - cx, y - cy, cx + cw - x - width, cy + ch - y - height]);
      assert.ok(cx >= 0 && cy >= 0 && cx + cw <= clip.width && cy + ch <= clip.height);
      const [sx, sy] = frame.sourceRect, [gx, gy] = frame.sourcePivot;
      assert.ok(Math.abs(px + sx - gx) < .001 && Math.abs(py + sy - gy) < .001, 'crop translation leaves the original boot anchor intact');
      const [, top, , sourceHeight] = frame.sourceVisibleRect;
      assert.equal(gy, top + sourceHeight, 'the ground pivot uses the feet rather than overhead hands or alpha halos');
      assert.equal(frame.groundBaseline, gy);
      assert.equal(frame.rect[2], frame.sourceRect[2]); assert.equal(frame.rect[3], frame.sourceRect[3]);
      assert.ok(!Object.hasOwn(frame, 'parts'), 'a pose is never split into head or limb cutouts');
    }
  }
  for (const character of Object.values(manifest.characters)) for (const clip of Object.values(character.clips)) {
    const frames = Object.values(clip.views).flat();
    for (let a = 0; a < frames.length; a++) for (let b = a + 1; b < frames.length; b++) {
      const [ax, ay, aw, ah] = frames[a].cell, [bx, by, bw, bh] = frames[b].cell;
      assert.ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, 'generous whole-figure cells never overlap');
    }
  }
});

test('authored clips use a stable ready-stance scale while separate corrected artwork uses its reviewed anatomical height', () => {
  for (const [id, character] of Object.entries(manifest.characters)) for (const [name, clip] of Object.entries(character.clips)) {
    const frames = Object.values(clip.views).flat();
    assert.ok(clip.bodyHeight > 0);
    for (const frame of frames) {
      assert.ok(Number.isFinite(frame.bodyHeight) && frame.bodyHeight > 0);
      if (frame.replacement) assert.equal(frame.scaleReference, 'reviewed-correction-crown-to-ground');
      else { assert.equal(frame.bodyHeight, clip.bodyHeight, `${id}/${name}: primary source scale is constant within the authored clip`); assert.equal(frame.scaleReference, 'clip-ready-stance'); }
    }
    if (clip.scaleReference === 'first-frame-crown-to-ground') {
      const readyHeights = Object.values(clip.views).map(poses => poses[0].sourceVisibleRect[3]).sort((a, b) => a - b);
      assert.equal(clip.bodyHeight, (readyHeights[1] + readyHeights[2]) / 2);
    }
  }
});

test('reviewed corrections replace only the specified whole-body poses at their original anatomical scale', () => {
  for (const [id, character] of Object.entries(manifest.characters)) for (const [name, clip] of Object.entries(character.clips)) {
    const reviews = reviewedOverrides[`${id}-${name}`]?.frames || {};
    let correctionCount = 0;
    const selectedSources = new Map();
    for (const [facing, frames] of Object.entries(clip.views)) frames.forEach((frame, index) => {
      const review = reviews[facing]?.[index], correction = review?.imagePNG;
      assert.equal(frame.replacement, !!correction, `${id}/${name}/${facing}/${index}: only reviewed art is substituted`);
      if (correction) {
        correctionCount++;
        assert.equal(frame.source, correction); assert.equal(frame.sourceComponentIndex, review.sourceComponent); assert.equal(frame.bodyHeight, review.bodyHeight);
        const descriptor = clip.sources.find(source => source.source === correction);
        assert.ok(descriptor); assert.equal(descriptor.columns, review.sourceColumns); assert.equal(descriptor.rows, review.sourceRows);
        if (!selectedSources.has(correction)) selectedSources.set(correction, []);
        selectedSources.get(correction).push(review.sourceComponent);
      }
    });
    assert.equal(clip.sources[0].selectedComponentIndices.length, 24 - correctionCount);
    assert.equal(clip.sources.length, selectedSources.size + 1);
    for (const [source, indices] of selectedSources) assert.deepEqual(clip.sources.find(descriptor => descriptor.source === source).selectedComponentIndices, indices.sort((a, b) => a - b));
  }
});

test('all production WebP files retain alpha, match their manifest hashes and fit the mobile asset budget', async () => {
  let total = 0; const hashes = new Set();
  for (const [id, character] of Object.entries(manifest.characters)) for (const [name, clip] of Object.entries(character.clips)) {
    assert.equal(clip.image, `./${id}-${name}.webp`);
    const bytes = await readFile(new URL(clip.image, new URL('../assets/animation/manifest.json', import.meta.url)));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8X'); assert.ok(bytes[20] & 0x10);
    assert.equal(hash(bytes), clip.webpSha256); hashes.add(clip.webpSha256); total += bytes.length;
  }
  assert.equal(hashes.size, 40); assert.ok(total < 60_000_000, 'forty complete-body atlases stay within the offline asset budget; only the current four players decode at runtime');
});
