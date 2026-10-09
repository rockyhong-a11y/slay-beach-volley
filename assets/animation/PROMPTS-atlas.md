# ATLAS 전신 추가컷 생성

Built-in image_gen 사용. 원본 RGBA와 전신 포즈를 보존하며 패킹합니다.

## RUN

- 원본 정체성: assets/sprites/atlas.webp
- 동작 참고: assets/animation/source/nova-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-03df438b-e195-4bd2-990d-6735c55607ce.png
- 프로젝트 저장: assets/animation/source/atlas-run.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 only supplies rendering style and movement sequence, DO NOT copy its character identity or clothing.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around 205–215 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: ATLAS from image 1: athletic woman with SHORT tousled vivid ORANGE hair, brown eyes, warm tan skin; black sports bra with ORANGE piping and orange shoulder trim, black briefs with ORANGE side stripes and small gold belt clasp, black fingerless padded gloves, black kneepads with ORANGE trim, black wrestling boots with ORANGE laces and trim. Keep short orange hair; no brown long hair or cyan reference clothing.
ANIMATION: RUN six columns: 1 relaxed ready neutral stance, 2 left-foot forward running stride with opposite arm swing, 3 left-foot push-off, 4 centered passing stride, 5 right-foot forward running stride with opposite arm swing, 6 recover ready. Athletic jogging legs and bent elbow swing, not punching poses.
```


## SPIKE profile v3 최종 SD 비율 보정

- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-84a5ed74-477b-43fa-8ab4-1d73343b41f0.png
- 프로젝트 최종 저장: assets/animation/source/atlas-spike-corrections.png
- v1 긴 비율 후보는 /private/tmp/atlas-spike-corrections-v1.png 보관.
- v2 후보는 머리만 커지고 다리가 충분히 짧아지지 않아 미채택.
- v3 원본과 승인 RUN 참고 전신 재생성. 머리 약38–40%, 짧은 몸통/다리, 약2.6–2.8등신.
- 최종 원본 1774×887 RGBA, SHA256 `0af3b19a44d90f0fa8d79b3ba615215fb0cfc8ed9769f8e1a368357768798d2c`.
- ROI의 opaque orange crown은 두 컷 모두 y94. Opaque boots baseline은 left y850/right y851: 최종 bodyHeight left756/right757. 위로 든 손 y38은 bodyHeight에 포함하지 않습니다. 기존850 override는 미채택 v1값입니다.

```text
Use case: stylized-concept. Create TWO ORIGINAL-SOURCE-MATCHING SD anime full-body volleyball overhead-contact sprite drawings on TRUE transparent RGBA. Image1 is ATLAS original character. Image2 is its approved RUN atlas; match its EXACT compact body proportions and clean detailed cel shading.
This is a VERY COMPACT SD character, approximately2.5–2.7 HEADS TOTAL from HAIR CROWN to BOOT SOLES, like Image2. The rounded skull/head is LARGE, 40% of total crown-to-boots. Torso is SHORT 25%, LEGS INCLUDING BOOTS SHORT35%. Skull280px means total crown-to-boots only700px: huge head with SHORT compact torso, SHORT thighs and SHORT calves, chunky boots. Do NOT draw a 3/3.5-head character, long adult legs, adult waist or stretched anatomy. DRAW THE ENTIRE BODY in this compact anatomy, not parts/composites.
Exactly TWO isolated complete drawings, 2columns1row, same scale and same boot baseline, square canvas with big80px outer transparent margins and100px separation.
Identity ATLAS fixed: SHORT vivid tousled ORANGE hair and brown eyes, tan skin, black sports bra ORANGE edging, black briefs ORANGE side stripes smallgold beltclasp, black fingerless gloves, black kneepads ORANGE borders, black boots ORANGE laces. Same character/costume in both drawings.
BOTH poses: RIGHT striking arm reaches straight above head, OPEN palm with exposed fingertips for volleyball SPIKE IMPACT, compact short arm like chibi anatomy, left guide arm bent in front. Both SHORT legs fully drawn; stance slightly bent and one compact knee raised, BOTH entire boots visible.
LEFT pose strict true LEFT SIDE PROFILE, one single visible eye, nose/lips point LEFT, far eye hidden. RIGHT pose strict true RIGHT SIDE PROFILE, one single eye, nose/lips point RIGHT, far eye hidden. NEVER front or 3/4 camera face. Keep precise directional profiles even when looking upward.
Complete full body including all hair, open raised hand, exposed fingers, both knees and boots. Anatomically attached limbs, natural compact proportions. No ball/effects/text/grid/floor/shadow/objects/background. Actual alpha transparency. Important: CROWN TO SOLES ONLY2.5–2.7HEADS, shorten torso and especially legs/boots until it matches image2 SD proportions.
```



## SPIKE true-profile impact 최종 추가 교체컷

- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-6c71b260-7c6d-463b-b258-749ccfd909b9.png
- 프로젝트 저장: assets/animation/source/atlas-spike-corrections.png
- 정확 2열 1행 full-body. Component 0 -> spike.views.left[3]; component 1 -> spike.views.right[3].
- 실제 방향성: only one visible eye, left-facing/right-facing nose, fully raised open-palm volleyball hit.

```text
Use case: stylized-concept. Asset: TWO replacement complete whole-body 2D SD volleyball sprite poses on actual transparent RGBA. Image 1 is ATLAS original identity, image 2 is approved same-character RUN atlas rendering style.
Exactly TWO characters side by side in a single row, 2 columns × 1 row. BOTH are the SAME ATLAS: short tousled vivid ORANGE hair, brown eyes, tan skin; black sports bra with ORANGE piping, black briefs ORANGE side stripes small gold belt clasp, black fingerless gloves, black kneepads ORANGE edging, black boots ORANGE laces/trim. Identity and original colors fixed.
Pose: high volleyball overhead SPIKE CONTACT, RIGHT striking arm fully extended UP with open palm and exposed fingertips above head, left guide arm bent in front torso, torso compact with balanced knees/boots. Complete head, hair, face, chest, hips, both legs, both boots and all hands fully drawn.
LEFT IMAGE is a STRICT TRUE LEFT SIDE PROFILE: nose unmistakably points LEFT, only ONE near eye visible, the far eye is COMPLETELY hidden, mouth points LEFT, side silhouette of forehead-nose-lips-chin. RIGHT IMAGE is STRICT TRUE RIGHT SIDE PROFILE: nose unmistakably points RIGHT, only ONE near eye visible, far eye completely hidden. Never three-quarter front, never two eyes, never face to camera, even while looking slightly upward. Body also side view.
CRITICAL NORMAL SD ANATOMY: 2.6–2.8 heads tall from crown to boot sole; head occupies about 38% crown-to-boots, compact torso26%, legs36%. Do not elongate torso/legs or draw adult proportions. Match reference RUN's head/body ratio, chunky boots. Same scale, same boot ground baseline both poses.
Spacious square composition with huge empty transparent margins at least 75pixels ALL outer edges and 100px space between silhouettes. Full crown-to-boots body height around 570–620px if1024square; allow room above crown for raised hand. Do NOT crop fingertips or hair. No ball, text, grid, effects, ground, shadows, objects or backdrop. Exactly two independently isolated full-body drawings, not limb cutouts.
```



## BLOCK

- 원본 정체성: assets/sprites/atlas.webp
- 스타일 참고: assets/animation/source/atlas-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-6a233bac-25fa-4cd5-81a1-8d9109cc7950.png
- 프로젝트 저장: assets/animation/source/atlas-block.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 is the SAME character's approved RUN atlas and supplies rendering style and SD proportions. Preserve the original identity and clothing from both images.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around at most 185–195 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: ATLAS from image 1: athletic woman with SHORT tousled vivid ORANGE hair, brown eyes, warm tan skin; black sports bra with ORANGE piping and orange shoulder trim, black briefs with ORANGE side stripes and small gold belt clasp, black fingerless padded gloves, black kneepads with ORANGE trim, black wrestling boots with ORANGE laces and trim. Keep short orange hair; no brown long hair or cyan reference clothing.
ANIMATION: BLOCK six columns: 1 crouch ready two hands at chest, 2 both hands rising beside face, 3 both arms extend overhead, 4 both OPEN PALMS above crown facing forward to block with two separated hands and visible fingertips, 5 both hands lower, 6 recover ready. Volleyball two-handed block, not fists/punches. Full hands fit above heads within each cell.
SPACING IS CRITICAL: draw each complete figure noticeably SMALL and centered, with at least 50px outer padding on all canvas edges and 35px empty transparent space between ALL silhouettes. For overhead palms, reserve generous room above head. No fingertip can touch the boot row above. Open fingerless gloved palms clearly face forward in impact column 4. Keep identical crown-to-boots size across ALL poses. No borrowed cyan or other character's costume.
```



## SPIKE v2 최종 보정

- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-6e52b692-f320-47f7-83b7-8344c6d6a97c.png
- 프로젝트 최종 저장: assets/animation/source/atlas-spike.png

```text
Use case: identity-preserve. EDIT image 1, the ATLAS SPIKE 24-whole-body atlas; image 2 is the original character identity reference.
Keep precisely 6 columns × 4 rows with exactly 24 complete drawings, every animation pose, original costume, original hairstyle/palette and normal compact 2.6–2.8-head SD anatomy. Change ONLY:
1) Re-layout ALL 24 whole figures uniformly 25% SMALLER, with a wide transparent border of at least 55 pixels on all sides and clear row/column gutters of at least 35 pixels. Rightmost third-row hair currently touches the canvas edge: restore the entire hair silhouette and visible transparent space. All fingertips, hands, ponytail/hair tips and boots completely visible. Overhead hands NEVER touch boots in the row above. Keep true transparent RGBA.
2) Redraw ONLY third-row fourth-column overhead impact with a TRUE LEFT profile face: nose points LEFT, single near eye visible, no front face. Redraw ONLY fourth-row fourth-column overhead impact with a TRUE RIGHT profile face: nose points RIGHT, single near eye visible, no front face. Maintain the open palm above head, short orange hair, black/orange original costume and SD proportions. All side-row poses must face their row direction even looking upward.
No grid, text, lines, panels, floor, ball, shadows, effects or objects. Preserve every full-body figure, do not erase or crop any part.
```



## SPIKE

- 원본 정체성: assets/sprites/atlas.webp
- 스타일 참고: assets/animation/source/atlas-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-8850bcab-d950-4329-9c47-6280c985f5f5.png
- 프로젝트 저장: assets/animation/source/atlas-spike.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 only supplies rendering style and movement sequence, DO NOT copy its character identity or clothing.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around 205–215 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: ATLAS from image 1: athletic woman with SHORT tousled vivid ORANGE hair, brown eyes, warm tan skin; black sports bra with ORANGE piping and orange shoulder trim, black briefs with ORANGE side stripes and small gold belt clasp, black fingerless padded gloves, black kneepads with ORANGE trim, black wrestling boots with ORANGE laces and trim. Keep short orange hair; no brown long hair or cyan reference clothing.
ANIMATION: SPIKE six columns: 1 compact ready, 2 left guide hand up with RIGHT striking hand BEHIND head, 3 right elbow cocked backward behind head and left guide arm forward, 4 right arm FULLY EXTENDED overhead with OPEN PALM to strike, 5 right arm swings FORWARD across torso follow-through, 6 recover ready. Clear volleyball wind-up and overhead palm hit, never boxing straight punches. Side row impact stays true side profile.
For this job image 1 is the ORIGINAL character identity and image 2 is the SAME character approved RUN atlas, used only for drawing style/SD anatomy consistency. NO Nova reference. Keep EXACTLY this character's original palette. Important: windup column 2 and cocked column 3 genuinely have the STRIKING HAND BEHIND HEAD, overhead impact column 4 has open bare fingers above unchanged fingerless gloves, column 5 swings forward/down. The side view nose remains pointed in the row direction even at impact. Every figure is SMALL inside cells, 2.6–2.8 heads tall; minimum 35px visible empty gutters and 40px outer padding. Never crop hair or overhead palms.
```



## TOSS

- 원본 정체성: assets/sprites/atlas.webp
- 동작 참고: assets/animation/source/nova-toss.png
- 캐릭터 연속성 참고: assets/animation/source/atlas-run.png
- 생성 원본: /Users/rockyhong/.codex/generated_images/01a12115-df09-7160-a09b-7d4a0fe3c0e9/exec-a1d81fe3-3d33-4936-910a-46780529721c.png
- 프로젝트 저장: assets/animation/source/atlas-toss.png

```text
Use case: stylized-concept. Asset: production 2D whole-body SD beach-volleyball animation sprite atlas, genuinely transparent RGBA.
Create ONE SQUARE image exactly 6 columns × 4 rows, 24 isolated complete whole-body drawings of the SAME character. Image 1 is the sole identity reference; image 2 only supplies rendering style and movement sequence, DO NOT copy its character identity or clothing.
Normal SD proportions: 2.6–2.8 heads tall, head about 38% of crown-to-boots body height, torso 26%, legs 36%. Keep torso compact, thighs/calves normal, hands anatomically attached. Rich polished 2D anime cel-shading, dark clean outlines, original illustrated texture. Every pose newly drawn complete body, no rearranged limb pieces.
Four rows EXACTLY: row 1 faces camera/down; row 2 rear/up with NO face visible; row 3 TRUE LEFT profile, nose points LEFT and only near eye visible; row 4 TRUE RIGHT profile, nose points RIGHT and only near eye visible. Side rows never front-facing.
All 24 figures must remain fully inside their invisible cells. Large EMPTY TRANSPARENT gutters horizontally and vertically: silhouettes including hair, fingertips and boots must never touch, overlap or connect to neighboring poses. On a 1280×1280 layout use 213×320 cells, keep each body crown-to-boots around 205–215 pixels and full silhouette width under 175 pixels; reserve upper cell room for overhead hands. Align boot ground baseline at the same relative height in every cell. No vertical jump translation; game code supplies jumps. Preserve same body scale and head size through every row and column.
No labels, grid lines, text, panel borders, backgrounds, ground, shadows, ball, effects or extra objects. Actual transparent background, NOT painted checkerboard.
IDENTITY: ATLAS from image 1: athletic woman with SHORT tousled vivid ORANGE hair, brown eyes, warm tan skin; black sports bra with ORANGE piping and orange shoulder trim, black briefs with ORANGE side stripes and small gold belt clasp, black fingerless padded gloves, black kneepads with ORANGE trim, black wrestling boots with ORANGE laces and trim. Keep short orange hair; no brown long hair or cyan reference clothing.
ANIMATION: TOSS six columns: 1 bend knees ready with two hands near chest, 2 both open hands lift toward forehead, 3 both hands extend above forehead, 4 two open palms release overhead facing upward, 5 relaxed overhead follow-through, 6 recover ready. Fingers visible above the unchanged fingerless gloves. Keep entire arms/hands inside cells.
Image 3 is this character's approved RUN atlas: keep its face, body proportions, hairstyle, original costume and palette exactly. Do not introduce Nova's cyan waistband or brown hair. Use small complete figures and generous vertical transparent gutters.
```
