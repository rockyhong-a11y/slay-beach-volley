import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { COURT_SCENE } from '../src/court-scene.js';
import { projectCourtPoint } from '../src/render.js';

test('2D court, net and airborne ball align with independent Blender camera measurements', async () => {
  const calibration = JSON.parse(await readFile(new URL('../artifacts/court-calibration.json', import.meta.url), 'utf8'));
  assert.ok(calibration.points.length >= 8);
  for (const { engine, pixel } of calibration.points) {
    const projected = projectCourtPoint(...engine, COURT_SCENE.width, COURT_SCENE.height);
    assert.ok(Math.abs(projected.x - pixel[0]) < .02);
    assert.ok(Math.abs(projected.y - pixel[1]) < .02);
  }
});

test('portrait resizing keeps the physical court, players and jumps in the same camera', () => {
  for (const [width, height] of [[296, 330], [361, 639], [480, 560], [650, 305]]) {
    const far = projectCourtPoint(500, 0, 0, width, height);
    const near = projectCourtPoint(500, 1200, 0, width, height);
    const airborne = projectCourtPoint(500, 975, 260, width, height);
    const grounded = projectCourtPoint(500, 975, 0, width, height);
    assert.ok(far.y > height * .2 && near.y < height * .95 && near.y > far.y);
    assert.ok(near.scale > far.scale, 'near-side players are closer to the same camera');
    assert.ok(airborne.y < grounded.y, 'jumping moves upward in the rendered scene');
    for (const point of [far, near, airborne, grounded]) assert.ok([point.x, point.y, point.scale].every(Number.isFinite));
    assert.ok(Math.abs(far.x - width / 2) < .01);
    assert.ok(Math.abs(near.x - width / 2) < .01);
  }
});

test('all lighting themes ship separate opaque backgrounds and transparent net plates', async () => {
  assert.equal(COURT_SCENE.courts.length, 3);
  assert.equal(new Set(COURT_SCENE.courts.flatMap(court => [court.background, court.net])).size, 6);
  let bytes = 0;
  for (const court of COURT_SCENE.courts) for (const path of [court.background, court.net]) {
    const buffer = await readFile(new URL(path, new URL('../src/render.js', import.meta.url)));
    assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
    bytes += buffer.length;
  }
  assert.ok(bytes < 2_500_000, 'rendered stadium assets fit the mobile/offline budget');
});
