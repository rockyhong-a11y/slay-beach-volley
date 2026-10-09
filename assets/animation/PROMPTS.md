# Original-based full-body animation cuts

Built-in image_gen, identity-preserving new poses based on all ten original SLAY character sheets. Original images are retained unchanged. The approved Nova/Raven whole-body animation style is extended to Valkyrie, Viper, Ember, Atlas, Seraph, Lynx, Tempest and Onyx. Each new atlas contains complete, anatomically drawn poses rather than movable limb pieces. Runtime draws a whole cut with uniform scale at 60fps. Ten identities × four action sheets × four directions × six cuts = 960 active full-body cuts.

Layout: 6 columns × 4 rows. Rows: front/down, rear/up, true left profile, true right profile. Columns: chronological six poses of a volleyball animation. Transparent RGBA, generous gutters, identical identity and natural 2.6–2.8-head SD anatomy, consistent painted crown-to-sole height and foot baseline. No grid, text, ball, effects or floor shadows.

Run: ready stance; left foot forward/right arm forward; left push-off/opposite swing; passing step; right foot forward/left arm forward; right push-off, returning toward ready. All four views are newly drawn and consistently oriented.

Toss: knees bend with hands ready at chest; hands lift toward forehead; elbows extend overhead; open palms release above crown; relaxed overhead follow-through; hands return to ready stance.

Spike: athletic approach preparation; airborne bow-back with guide hand raised; striking elbow pulled behind head; extended overhead striking palm; forward arm follow-through; balanced bent-knee recovery. Pose art never translates the character inside the cell to simulate the game's jump.

Block: lowered athletic ready; both hands rising; elbows extend; both open palms held above crown; hands lowering from overhead; bent-knee recovery. Both shoulders remain on the torso, wrists never detach, elbows and knees stay anatomical.

Nova invariants: original long brown side-parted hair, brown anime eyes, silver hoop earrings, black crop top and black shorts with cyan trim, red/black padded gloves, knee pads and boots. Raven invariants: original long crimson hair, grey eyes, black crop top, black long trousers with red side stripes, red/black padded gloves, knee pads and boots.

Review corrections used built-in image_gen again. The first spike atlases had insufficient vertical gutters and were replaced by square sheets with separate whole silhouettes. Raven's left impact and two right wind-ups received three newly drawn profile poses; a further identity-preserving edit corrected these supplemental poses to 2.6-head SD anatomy (38% skull, 26% torso, 36% legs). The final supplementary source is `source/raven-spike-corrections.png`. Unselected variants are archived outside the release working tree.

The expanded roster also uses two newly drawn Atlas profile impact poses with compact SD anatomy (`source/atlas-spike-corrections.png`, reviewed crown-to-boots heights 756/757px), and one complete Onyx left recovery pose (`source/onyx-spike-left-recovery.png`, reviewed hair-to-boots height 1080px). These replace complete figures, preserving original costumes and directions. All 960 selected cuts retain complete heads, hands and boots; the unchanged Nova/Raven 192 cuts and eight WebP files match their approved bytes and metadata exactly.

Technical packaging extracts each complete connected figure and repacks it with gutters, preserving the original painted RGBA pixels and source files. No body-part transforms, anatomical retouching or generated-art substitutions are performed by the packaging script.

## Expanded roster prompt sets

The same common layout, SD anatomy and complete-pose sequence above was used for all ten identities. Per-character original costume constraints, exact prompts, final generated source paths and targeted corrections are recorded in:

- [Valkyrie](PROMPTS-valkyrie.md)
- [Viper](PROMPTS-viper.md)
- [Ember](PROMPTS-ember.md)
- [Atlas](PROMPTS-atlas.md)
- [Seraph](PROMPTS-seraph.md)
- [Lynx](PROMPTS-lynx.md)
- [Tempest](PROMPTS-tempest.md)
- [Onyx](PROMPTS-onyx.md)

Final authoring PNGs are saved in `source/`; `manifest.json` records each selected whole-pose source, crop, ground pivot, reviewed scale and hash. Only packaged WebP assets ship in the game. Repack with `python3 tools/pack-animation.py --workers 3`; inspect source separation/canvas edges with `python3 tools/pack-animation.py --audit-sources --workers 3`.
