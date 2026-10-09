# SERAPH 전신 추가컷 생성

Built-in image_gen 사용. 원본 RGBA와 전신 포즈를 보존하며 패킹합니다.

## RUN

- 원본 정체성: assets/sprites/seraph.webp
- 동작 참고: assets/animation/source/nova-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-92715c7c-9185-401f-89eb-d96973063591.png
- 프로젝트 저장: assets/animation/source/seraph-run.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 only supplies rendering style and movement sequence, DO NOT copy its character identity or clothing.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around 205–215 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: SERAPH from image 1: woman with pale blonde HIGH PONYTAIL tied with a white hair band, loose blonde face-framing strands, bright blue eyes, fair skin; WHITE sports bra with COBALT BLUE edging, white/blue briefs, cobalt blue fingerless gloves, BLUE kneepads with WHITE borders, white tall lace-up boots with BLUE toes/soles and WHITE laces. Exact blonde ponytail and white-blue costume in every frame.
ANIMATION: RUN six columns: 1 relaxed ready neutral stance, 2 left-foot forward running stride with opposite arm swing, 3 left-foot push-off, 4 centered passing stride, 5 right-foot forward running stride with opposite arm swing, 6 recover ready. Athletic jogging legs and bent elbow swing, not punching poses.
Use small complete figures with especially generous vertical gutters. Raised fingertips must have transparent separation from the row above.
```


## BLOCK v2 최종 보정

- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-88d11504-396e-404c-843f-cad3ab93d51e.png
- 프로젝트 최종 저장: assets/animation/source/seraph-block.png

```text
Use case: identity-preserve. EDIT image 1, SERAPH BLOCK whole-body sprite atlas. Preserve the EXACT 24 existing complete character poses and their 6 columns × 4 rows order, all 4 viewing directions, shading, white/blue costume, blonde high ponytail, blue eyes and normal 2.6–2.8 heads SD proportions.
ONLY change layout and figure size: every FULL BODY is uniformly 30% SMALLER and placed on an expanded spacious square transparent canvas. There MUST be at least 65 pixels of EMPTY TRANSPARENCY around the whole sheet on EVERY edge and at least 35 pixels of clear space separating EVERY complete silhouette. Some original rightmost/leftmost ponytail touches canvas edge: restore complete ponytail with visible empty transparent space all around.
Do not move or cut any body part independently. Keep precisely 24 COMPLETE full-body drawings. All hands, fingertips, ponytail strands and boots visible and independently isolated from every neighbor; raised palms cannot touch feet in row above. Align each pose's boot baseline within its cell, same crown-to-boots size throughout. No added labels, lines, grids, floor, balls, effects, shadows or background. REAL transparent RGBA, not checkerboard.
```



## SPIKE v2 최종 보정

- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-0a7aad88-9e70-4f86-9cae-0598ff560d48.png
- 프로젝트 최종 저장: assets/animation/source/seraph-spike.png

```text
Use case: identity-preserve. EDIT image 1, SERAPH SPIKE whole-body sprite atlas. Preserve the EXACT 24 existing complete character poses and their 6 columns × 4 rows order, all 4 viewing directions, shading, white/blue costume, blonde high ponytail, blue eyes and normal 2.6–2.8 heads SD proportions.
ONLY change layout and figure size: every FULL BODY is uniformly 30% SMALLER and placed on an expanded spacious square transparent canvas. There MUST be at least 65 pixels of EMPTY TRANSPARENCY around the whole sheet on EVERY edge and at least 35 pixels of clear space separating EVERY complete silhouette. Some original rightmost/leftmost ponytail touches canvas edge: restore complete ponytail with visible empty transparent space all around.
Do not move or cut any body part independently. Keep precisely 24 COMPLETE full-body drawings. All hands, fingertips, ponytail strands and boots visible and independently isolated from every neighbor; raised palms cannot touch feet in row above. Align each pose's boot baseline within its cell, same crown-to-boots size throughout. No added labels, lines, grids, floor, balls, effects, shadows or background. REAL transparent RGBA, not checkerboard.
```



## BLOCK

- 원본 정체성: assets/sprites/seraph.webp
- 스타일 참고: assets/animation/source/seraph-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-dccf28e7-698b-4d49-80a4-5e2345d59be4.png
- 프로젝트 저장: assets/animation/source/seraph-block.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 is the SAME character's approved RUN atlas and supplies rendering style and SD proportions. Preserve the original identity and clothing from both images.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around at most 185–195 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: SERAPH from image 1: woman with pale blonde HIGH PONYTAIL tied with a white hair band, loose blonde face-framing strands, bright blue eyes, fair skin; WHITE sports bra with COBALT BLUE edging, white/blue briefs, cobalt blue fingerless gloves, BLUE kneepads with WHITE borders, white tall lace-up boots with BLUE toes/soles and WHITE laces. Exact blonde ponytail and white-blue costume in every frame.
ANIMATION: BLOCK six columns: 1 crouch ready two hands at chest, 2 both hands rising beside face, 3 both arms extend overhead, 4 both OPEN PALMS above crown facing forward to block with two separated hands and visible fingertips, 5 both hands lower, 6 recover ready. Volleyball two-handed block, not fists/punches. Full hands fit above heads within each cell.
SPACING IS CRITICAL: draw each complete figure SMALL and centered, with at least 55px outer padding on all canvas edges and 35px empty transparent space between ALL silhouettes. For overhead palms, reserve generous room above head. No fingertip can touch the boot row above. Head/legs proportions match approved original SERAPH, no adult elongated legs. Exactly 24 same-size full bodies, original white/blue costume and blonde high ponytail.
Side views throughout the action have a true side-profile face with only ONE eye visible and a clearly LEFT-facing nose in row3, RIGHT-facing nose in row4; even overhead hits and blocks NEVER turn to camera.
```



## SPIKE

- 원본 정체성: assets/sprites/seraph.webp
- 스타일 참고: assets/animation/source/seraph-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-90e13c9c-8f01-4b1a-8fdd-b9a689c041ff.png
- 프로젝트 저장: assets/animation/source/seraph-spike.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 is the SAME character's approved RUN atlas and supplies rendering style and SD proportions. Preserve the original identity and clothing from both images.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around at most 185–195 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: SERAPH from image 1: woman with pale blonde HIGH PONYTAIL tied with a white hair band, loose blonde face-framing strands, bright blue eyes, fair skin; WHITE sports bra with COBALT BLUE edging, white/blue briefs, cobalt blue fingerless gloves, BLUE kneepads with WHITE borders, white tall lace-up boots with BLUE toes/soles and WHITE laces. Exact blonde ponytail and white-blue costume in every frame.
ANIMATION: SPIKE six columns: 1 compact ready, 2 left guide hand up with RIGHT striking hand BEHIND head, 3 right elbow cocked backward behind head and left guide arm forward, 4 right arm FULLY EXTENDED overhead with OPEN PALM to strike, 5 right arm swings FORWARD across torso follow-through, 6 recover ready. Clear volleyball wind-up and overhead palm hit, never boxing straight punches. Side row impact stays true side profile.
SPACING IS CRITICAL: draw each complete figure SMALL and centered, with at least 55px outer padding on all canvas edges and 35px empty transparent space between ALL silhouettes. For overhead palms, reserve generous room above head. No fingertip can touch the boot row above. Head/legs proportions match approved original SERAPH, no adult elongated legs. Exactly 24 same-size full bodies, original white/blue costume and blonde high ponytail.
Side views throughout the action have a true side-profile face with only ONE eye visible and a clearly LEFT-facing nose in row3, RIGHT-facing nose in row4; even overhead hits and blocks NEVER turn to camera.
```



## TOSS v2 최종 보정

- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-df12cba2-0c97-453d-930e-66ada4285f41.png
- 프로젝트 최종 저장: assets/animation/source/seraph-toss.png

```text
Use case: identity-preserve. EDIT image 1, the SERAPH TOSS 24-whole-body atlas; image 2 is the original character identity reference.
Keep precisely 6 columns × 4 rows with exactly 24 complete drawings, every animation pose, original costume, original hairstyle/palette and normal compact 2.6–2.8-head SD anatomy. Change ONLY:
1) Re-layout ALL 24 whole figures uniformly 25% SMALLER, with a wide transparent border of at least 55 pixels on all sides and clear row/column gutters of at least 35 pixels. Rightmost third-row hair currently touches the canvas edge: restore the entire hair silhouette and visible transparent space. All fingertips, hands, ponytail/hair tips and boots completely visible. Overhead hands NEVER touch boots in the row above. Keep true transparent RGBA.
2) Preserve SERAPH blonde high ponytail and exactly white/cobalt original outfit, BLUE eyes and blue fingerless gloves. All 24 figures remain the same character, no color/style drift.
No grid, text, lines, panels, floor, ball, shadows, effects or objects. Preserve every full-body figure, do not erase or crop any part.
```



## TOSS

- 원본 정체성: assets/sprites/seraph.webp
- 동작 참고: assets/animation/source/nova-toss.png
- 캐릭터 연속성 참고: assets/animation/source/seraph-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-b20b5986-af30-440a-810b-cfd64dc4ae11.png
- 프로젝트 저장: assets/animation/source/seraph-toss.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 only supplies rendering style and movement sequence, DO NOT copy its character identity or clothing.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around 205–215 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: SERAPH from image 1: woman with pale blonde HIGH PONYTAIL tied with a white hair band, loose blonde face-framing strands, bright blue eyes, fair skin; WHITE sports bra with COBALT BLUE edging, white/blue briefs, cobalt blue fingerless gloves, BLUE kneepads with WHITE borders, white tall lace-up boots with BLUE toes/soles and WHITE laces. Exact blonde ponytail and white-blue costume in every frame.
ANIMATION: TOSS six columns: 1 bend knees ready with two hands near chest, 2 both open hands lift toward forehead, 3 both hands extend above forehead, 4 two open palms release overhead facing upward, 5 relaxed overhead follow-through, 6 recover ready. Fingers visible above the unchanged fingerless gloves. Keep entire arms/hands inside cells.
Image 3 is this character's approved RUN atlas: keep its face, body proportions, hairstyle, original costume and palette exactly. Do not introduce Nova's cyan waistband or brown hair. Use small complete figures and generous vertical transparent gutters.
```
