# Release verification

Verified on 2026-10-09 with Node.js 24 and headless Chrome through Playwright.

- 15 engine tests passed: source asset hashes, all ten identities, flight and landing, height prediction, manual perfect spikes, hit stop, grounded returns, blocking, net faults, out balls, consecutive touch rejection, assistance, every difficulty, every character in practice, replay, bounded charging.
- The production bundle was built and exercised at `http://localhost:5173/dist/`, including its repository-style subpath.
- Real browser checks passed for 10 selectable original characters, partner changes, stored selection and settings after reload, keyboard jump/charge, joystick capture, pause/resume, help, the actual 60-second practice result, dark mode, and reduced motion.
- Screen sizes: 320×568, 320×720, 360×780, 393×852, 430×932, 844×390, and desktop 1440×1000. No horizontal overflow; the mobile start button remains visible. Portrait pages have at most 1px of rounding overflow.
- No page exceptions, console errors, or failed HTTP responses were observed in the final browser checks.
- Offline reload and gameplay were verified with a first-visit cache, including selection of a character outside the initial team. Another app's cache was preserved.
- Original three-frame character sheets total 1,318,542 bytes after proportional mobile optimization. The ten original-face thumbnails total 107,758 bytes. The original identities, designs, poses, transparency, and source provenance are retained.
- Lighthouse mobile simulation: performance 86, accessibility 100, best practices 100, SEO 100. Total blocking time 0ms and layout shift 0. The conservative slow-network LCP estimate was 4.2s. These are local measurements, not a guarantee for every device or connection.

Reports: `browser-qa-results.json`, `offline-qa-results.json`, and `lighthouse.report.json`. Screenshots include the lobby, active court, pause, practice result, offline play, and dark mode.

Reference limitation: the YouTube references were inspected through their page metadata and public preview images; full playback and direct listening to their original audio were unavailable. The game's audio is newly synthesized with Web Audio.
