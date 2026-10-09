# Release verification

Verified on 2026-10-09 with Node.js 24 and headless Chrome through Playwright.

- 24 engine tests passed: source asset hashes, all ten identities, flight and landing, height prediction, manual perfect spikes, hit stop, grounded returns, dedicated blocking, net faults, out balls, consecutive touch rejection, manual movement even with a legacy assist flag, stopping after movement input ends, every difficulty, every character in practice, replay, bounded charging, automatic tosses and attack jumps without changing player position, no automatic player attacks, buffered spikes, independent block input, retained charging across teammate passes, and the actual receiver owning the next attack after an interception. Active match fixtures supply direction input explicitly.
- The production bundle was built and exercised at `http://localhost:5173/dist/`, including its repository-style subpath.
- Real browser checks passed for 10 selectable original characters, partner changes, stored selection and settings after reload, manual movement that stops after input is released, keyboard block/charge, joystick capture, pause/resume, help, automatic jumping after manual positioning followed by an actual manual spike, the actual 60-second practice result, dark mode, and reduced motion. The former movement assistance setting is absent; a saved enabled preference is removed without losing victory records.
- An 800ms touch hold charged and released the attack without selecting text or opening a popup. Delegated context-menu, selection and drag guards were checked on buttons, labels, images, links and the canvas. Real inputs, textareas, selects and contenteditable descendants retained native editing. Native iOS callouts are disabled in CSS; these automated browser checks ran in Chrome.
- In the descending-toss timing fixture every character had 0.617–0.642 seconds of valid attack time. The manual input buffer lasts 0.65 seconds. Tosses use a slower arc, and attack jumps include a brief hang near the apex.
- Screen sizes: 320×568, 320×720, 360×780, 393×852, 430×932, 844×390, and desktop 1440×1000. No horizontal overflow; the mobile start button remains visible. Portrait pages have at most 1px of rounding overflow.
- The court redraws immediately after a canvas resize. Captures wait for painted canvas pixels and use the actual viewport, including portrait-to-landscape changes.
- No page exceptions, console errors, or failed HTTP responses were observed in the final browser checks.
- Offline reload and gameplay were verified with a first-visit cache, including selection of a character outside the initial team. Another app's cache was preserved.
- Original three-frame character sheets total 1,318,542 bytes after proportional mobile optimization. The ten original-face thumbnails total 107,758 bytes. The original identities, designs, poses, transparency, and source provenance are retained.
- The initial release's Lighthouse mobile simulation measured performance 86, accessibility 100, best practices 100, SEO 100, total blocking time 0ms and layout shift 0. Its conservative slow-network LCP estimate was 4.2s. This benchmark was not repeated for the control update.

Reports: `browser-qa-results.json`, `offline-qa-results.json`, and the initial `lighthouse.report.json`. Screenshots include the lobby, active court, automatic attack jump, manual spike, pause, practice result, offline play, and dark mode.

Reference limitation: the YouTube references were inspected through their page metadata and public preview images; full playback and direct listening to their original audio were unavailable. The game's audio is newly synthesized with Web Audio.
