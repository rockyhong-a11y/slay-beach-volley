# Volleyball contact-effect references

All paths, particles, colours, timing curves and rendering code in `src/impact-effects.js` are original work for this project. No fighting-game sprites, textures, videos, shaders or effect assets were copied or bundled.

- [Lin, Duan, Wen and Cai — What Features Influence Impact Feel? A Study of Impact Feedback in Action Games](https://faculty.washington.edu/weicaics/paper/papers/ZhonghaoLDWC2022.pdf), author-hosted research paper, 2022. Its discussion of spot and directional contact effects, including BlazBlue examples, informed the distinction between upward toss ribbons, directed attack sparks and defensive shields. Its treatment of coherent sound and short hit stops informed how presentation follows the actual contact event.
- [Sarah Grissom — Real-Time VFX: A Visual Language Spectrum](https://gdcvault.com/play/1025230/Real-Time-VFX-A-Visual), GDC 2018, FXVille. The session description treats effects as a visual language communicating gameplay. We use separate silhouettes and palettes for receiving, setting, spiking and blocking.

Implementation limits: twelve active bursts, 128 particles, eighteen trail points and a maximum normal lifetime of 0.55 seconds. Reduced motion lowers particle counts, removes ball trails and the brief local perfect-contact highlight, and uses shorter 0.24-second contact effects. The renderer projects each effect's world anchor every frame and draws the ball above effects to preserve its visibility. There are no full-screen flashes.

Verification: `tests/impact-effects.test.mjs` checks contact distinctions, expiry and resource limits, reduced motion, resize reprojection, outgoing direction and trail culling. `artifacts/vfx-preview.html` is a standalone contact sheet for 65-millisecond, 220-millisecond and reduced-motion frames; its optional capture script uses a fresh local browser context. Production presentation is verified by the main application's browser QA artifacts.
