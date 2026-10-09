# EMBER 전신 추가컷 생성

Built-in image_gen 사용. 원본 RGBA와 전신 포즈를 보존하며 패킹합니다.

## RUN

- 원본 정체성: assets/sprites/ember.webp
- 동작 참고: assets/animation/source/nova-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-7ae87447-90cd-45f7-a415-0b100b1a89ae.png
- 프로젝트 저장: assets/animation/source/ember-run.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 only supplies rendering style and movement sequence, DO NOT copy its character identity or clothing.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around 205–215 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: EMBER from image 1: woman with long voluminous dark chestnut brown wavy hair, warm amber eyes and tan skin; black sports bra with RED edging and tiny GOLD center fastener, black briefs with RED and GOLD waistband details, black fingerless padded gloves with RED wrist bands, black/red kneepads, black tall wrestling boots with GOLD laces and gold trim. Maintain these exact colors and equipment in every frame. Do not borrow cyan trim from the style reference.
ANIMATION: RUN six columns: 1 relaxed ready neutral stance, 2 left-foot forward running stride with opposite arm swing, 3 left-foot push-off, 4 centered passing stride, 5 right-foot forward running stride with opposite arm swing, 6 recover ready. Athletic jogging legs and bent elbow swing, not punching poses.
```


## BLOCK

- 원본 정체성: assets/sprites/ember.webp
- 스타일 참고: assets/animation/source/ember-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-ad1dd6ac-22dd-4e1c-a0b8-38ec993022f5.png
- 프로젝트 저장: assets/animation/source/ember-block.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 is the SAME character's approved RUN atlas and supplies rendering style and SD proportions. Preserve the original identity and clothing from both images.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around at most 185–195 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: EMBER from image 1: woman with long voluminous dark chestnut brown wavy hair, warm amber eyes and tan skin; black sports bra with RED edging and tiny GOLD center fastener, black briefs with RED and GOLD waistband details, black fingerless padded gloves with RED wrist bands, black/red kneepads, black tall wrestling boots with GOLD laces and gold trim. Maintain these exact colors and equipment in every frame. Do not borrow cyan trim from the style reference.
ANIMATION: BLOCK six columns: 1 crouch ready two hands at chest, 2 both hands rising beside face, 3 both arms extend overhead, 4 both OPEN PALMS above crown facing forward to block with two separated hands and visible fingertips, 5 both hands lower, 6 recover ready. Volleyball two-handed block, not fists/punches. Full hands fit above heads within each cell.
SPACING IS CRITICAL: draw each complete figure noticeably SMALL and centered, with at least 50px outer padding on all canvas edges and 35px empty transparent space between ALL silhouettes. For overhead palms, reserve generous room above head. No fingertip can touch the boot row above. Open fingerless gloved palms clearly face forward in impact column 4. Keep identical crown-to-boots size across ALL poses. No borrowed cyan or other character's costume.
```



## SPIKE

- 원본 정체성: assets/sprites/ember.webp
- 스타일 참고: assets/animation/source/ember-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-7acc81fd-19d1-41ce-911c-6ab1c816f790.png
- 프로젝트 저장: assets/animation/source/ember-spike.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 only supplies rendering style and movement sequence, DO NOT copy its character identity or clothing.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around 205–215 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: EMBER from image 1: woman with long voluminous dark chestnut brown wavy hair, warm amber eyes and tan skin; black sports bra with RED edging and tiny GOLD center fastener, black briefs with RED and GOLD waistband details, black fingerless padded gloves with RED wrist bands, black/red kneepads, black tall wrestling boots with GOLD laces and gold trim. Maintain these exact colors and equipment in every frame. Do not borrow cyan trim from the style reference.
ANIMATION: SPIKE six columns: 1 compact ready, 2 left guide hand up with RIGHT striking hand BEHIND head, 3 right elbow cocked backward behind head and left guide arm forward, 4 right arm FULLY EXTENDED overhead with OPEN PALM to strike, 5 right arm swings FORWARD across torso follow-through, 6 recover ready. Clear volleyball wind-up and overhead palm hit, never boxing straight punches. Side row impact stays true side profile.
For this job image 1 is the ORIGINAL character identity and image 2 is the SAME character approved RUN atlas, used only for drawing style/SD anatomy consistency. NO Nova reference. Keep EXACTLY this character's original palette. Important: windup column 2 and cocked column 3 genuinely have the STRIKING HAND BEHIND HEAD, overhead impact column 4 has open bare fingers above unchanged fingerless gloves, column 5 swings forward/down. The side view nose remains pointed in the row direction even at impact. Every figure is SMALL inside cells, 2.6–2.8 heads tall; minimum 35px visible empty gutters and 40px outer padding. Never crop hair or overhead palms.
```



## TOSS v2 최종 보정

- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-fd41d574-980a-4869-b90a-24c82ec28ee6.png
- 프로젝트 최종 저장: assets/animation/source/ember-toss.png
- 이전 후보는 /private/tmp/ember-toss-v1.png 보관.

```text
Use case: identity-preserve. EDIT image 1, the EMBER TOSS whole-body transparent sprite atlas. Image 2 is the original identity reference. Preserve all 24 complete SD poses, the 6 columns × 4 rows arrangement and four viewing directions, face, hair, equipment, colors and shading, changing only the following:
Correct ALL cyan/teal/blue waistband or costume edging to EMBER's original RED plus small GOLD trim. There is absolutely no blue/cyan anywhere on Ember. Black briefs with red/gold waistband, black/red gloves, black/red kneepads and black boots with gold laces stay exact. Also uniformly make all figures 15% smaller to leave ample transparent outer padding and separation between raised hands and the row above. Keep toss poses unchanged.
Actual transparent RGBA. No text, grid, labels, backdrop, ball, shadows or effects. Do not add/remove any pose. Keep every complete silhouette independently separated.
```



## RUN v2 최종 보정

- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-18c9ea65-b79b-47d0-9b80-3b0a1ea39fd4.png
- 프로젝트 최종 저장: assets/animation/source/ember-run.png
- 이전 후보는 /private/tmp/ember-run-v1.png 보관.

```text
Use case: identity-preserve. EDIT image 1, the EMBER RUN whole-body transparent sprite atlas. Image 2 is the original identity reference. Preserve all 24 complete SD poses, the 6 columns × 4 rows arrangement and four viewing directions, face, hair, equipment, colors and shading, changing only the following:
Make every whole figure 20% SMALLER UNIFORMLY inside a spacious square atlas, adding generous transparent outer padding of at least 40px and row/column gutters of at least 35px. Rightmost third-row recovery hair is currently touching the canvas right edge; draw every strand fully with visible transparent space around it. No silhouette may touch the canvas edge or neighboring pose. Preserve normal compact 2.6–2.8-head SD proportions and all six running phases. Do not crop or cut any hair, boots, hands.
Actual transparent RGBA. No text, grid, labels, backdrop, ball, shadows or effects. Do not add/remove any pose. Keep every complete silhouette independently separated.
```



## TOSS

- 원본 정체성: assets/sprites/ember.webp
- 동작 참고: assets/animation/source/nova-toss.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-0c5f69f8-28e0-4b13-a67f-d984b653fa25.png
- 프로젝트 저장: assets/animation/source/ember-toss.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 only supplies rendering style and movement sequence, DO NOT copy its character identity or clothing.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around 205–215 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: EMBER from image 1: woman with long voluminous dark chestnut brown wavy hair, warm amber eyes and tan skin; black sports bra with RED edging and tiny GOLD center fastener, black briefs with RED and GOLD waistband details, black fingerless padded gloves with RED wrist bands, black/red kneepads, black tall wrestling boots with GOLD laces and gold trim. Maintain these exact colors and equipment in every frame. Do not borrow cyan trim from the style reference.
ANIMATION: TOSS six columns: 1 bend knees ready with two hands near chest, 2 both open hands lift toward forehead, 3 both hands extend above forehead, 4 two open palms release overhead facing upward, 5 relaxed overhead follow-through, 6 recover ready. Fingers visible above the unchanged fingerless gloves. Keep entire arms/hands inside cells.
Use small complete figures with especially generous vertical gutters. Raised fingertips must have transparent separation from the row above.
```
