# Asset provenance

## SLAY characters

Copyright (c) 2026 Rocky Hong. MIT License, retained in [LICENSE](LICENSE).

Source repository: https://github.com/rockyhong-a11y/slay

Source files for all ten characters:
`https://rockyhong-a11y.github.io/slay/assets/sd2d/{id}.png`

Original frame metadata:
`https://rockyhong-a11y.github.io/slay/assets/sd2d/manifest.json`

IDs: `nova`, `raven`, `valkyrie`, `viper`, `ember`, `atlas`, `seraph`, `lynx`, `tempest`, `onyx`.

These existing images were scaled proportionally to 888×444 and converted to WebP quality 93, preserving transparency and the original three-frame composition. Small portrait thumbnails are cropped from the same first poses. No generative image editing, new costumes, replacement faces, or newly illustrated characters are used. Original PNG checksums, original crop coordinates, render dimensions, and shipped WebP checksums are recorded in [src/sprites.json](src/sprites.json). Game animations transform and display the original three poses at runtime. Volleyball-specific abilities and statistics are new gameplay content.

## Icons

Phosphor Icons core. The copied regular SVGs are from the installed `@phosphor-icons/core` package. MIT license in [assets/licenses/Phosphor-MIT.txt](assets/licenses/Phosphor-MIT.txt).

## Fonts

- Outfit, served locally as WOFF2. SIL Open Font License in [assets/fonts/Outfit-OFL.txt](assets/fonts/Outfit-OFL.txt).
- Do Hyeon, served locally as an official Google Fonts TTF subset covering the app's Korean display copy. SIL Open Font License in [assets/fonts/DoHyeon-OFL.txt](assets/fonts/DoHyeon-OFL.txt).

## New game assets

The stadium geometry, materials, lighting and six background/net plates were created for this game in Blender. Real FIVB/Volleyball World stadium references informed its tournament layout; no reference photographs, official logos or third-party textures are shipped. The reproducible scene, calibrated camera and source references are documented in [assets/courts/SOURCES.md](assets/courts/SOURCES.md).

The volleyball, impact silhouettes, particles and SLAY Beach Volley mark are original game assets. Fighting-game impact design references informed the short directional hit sparks, distinguishable contact shapes and brief hit stop; see [artifacts/vfx-sources.md](artifacts/vfx-sources.md).

Recorded volleyball contacts and other sports foley are licensed for reuse and are served locally as optimized samples. Authors, licenses, source URLs and preparation details are retained in [assets/audio/SOURCES.md](assets/audio/SOURCES.md). Supporting musical and UI cues use original Web Audio synthesis. The linked YouTube videos remain references; their audio was not extracted or included.
