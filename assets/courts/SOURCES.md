# Original rendered SLAY tournament stadium

All venue geometry, materials, lighting, signage and renders were built specifically
for this game in Blender. No reference photographs, official logos or third-party
textures are included in the shipped assets. The three themes use the same actual
3D model and exactly the same calibrated camera. Day, sunset and floodlit night are
separate physical lighting renders, rather than recoloured copies.

Real tournament references reviewed on 2026-10-09:

- [FIVB official beach volleyball rules](https://www.fivb.com/wp-content/uploads/2024/03/FIVB-BeachVolleyball_Rules_2017-2020-EN-v05.pdf): the stable court geometry in the official reference is an 8 × 16 metre court with no centre line, perimeter lines and a competition net. The original net used the 2.43 m men's competition top height (engine z=230). At the user's request, the current arcade net assembly is twice as tall: 4.86 m at its top, matching engine z=460. This deliberate game rule differs from competition dimensions. The court and camera retain their original dimensions.
- [FIVB venue visit, Eiffel Tower Stadium, 16 May 2024](https://www.fivb.com/incroyable-fivb-president-visits-magnificent-paris-2024-beach-volleyball-venue/): temporary grandstand construction and an open-air sand arena informed the stepped seating, structural railings, broad free zone and court-side branding.
- [Volleyball World: Paris 2024 beach volleyball venue](https://en.volleyballworld.com/news/host-city-beach-volleyball-olympic-games-paris-2024): surrounding temporary arena and distinctive outdoor setting informed the stadium composition.
- [Volleyball World: Olympic nights, 3 August 2024](https://en.volleyballworld.com/beachvolleyball/competitions/beach-volleyball-olympic-games-paris-2024/news/magical-marvellous-magnifique-eiffel-tower-lights-up-beach-volleyball-venue-on-olympic-nights): the floodlit sand court, illuminated stands and strong change in atmosphere at sunset informed the three lighting variants.

This is a fictional coastal SLAY Beach Club arena inspired by tournament venue
design. It is not a reproduction of the Paris venue and does not imply affiliation
with FIVB, Volleyball World or the Olympics.

## Reproduction

Run `Blender -b --factory-startup --python tools/render-courts.py -- --all`, then
`python3 tools/pack-courts.py` and `python3 tools/verify-courts.py`. The original editable scene is
`tools/court-stadium.blend`; raw PNG renders and the camera verification data live
under `artifacts/court-*`. The generated `src/court-scene.js` exports the exact
camera projection in engine coordinates.

The source was rendered with Blender 5.2.2 LTS, Cycles, AgX, 40 samples plus
denoising. The six 960 × 1440 mobile plates total 515,586 bytes. Camera coordinates
have been independently checked using Blender's `world_to_camera_view` utility;
see `artifacts/court-calibration.json`, `court-verified.json` and
`court-projection-check.webp`.

The opaque backgrounds include shadows cast by the net, with the physical net
hidden from camera rays. Matching transparent net/post/antenna plates are layered
between the far and near 2D characters. This preserves real 3D perspective,
lighting and occlusion with the game's 2D character sprites. The complete net,
post and antenna assembly was rebuilt at twice its original vertical scale,
including its true shadows in each lighting theme. The independent Blender
calibration includes measurements at both ends of the raised z=460 net top.
