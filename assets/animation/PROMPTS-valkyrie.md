# Valkyrie whole-body cuts

Generated with built-in image_gen using the unchanged original SLAY Valkyrie artwork as identity reference and Nova's completed whole-body cuts as style reference. Source atlases are saved in `source/valkyrie-{run,toss,spike,block}.png`.

## Shared prompt

Use case: identity-preserve. Asset: complete 2D game animation atlas. Image 1 is the ORIGINAL character identity/costume reference. Image 2 is only the completed game's SD illustration/linework and animation-cut style reference. Draw fresh complete poses of image 1; never copy the identity of image 2. Natural SD proportions: 2.6–2.8 heads total, head about 38%, torso26%, legs36%, consistent crown-to-boot length and foot baseline. Polished hand-drawn cel-shaded anime art matching original. Composition: SQUARE canvas, exactly 6 columns × 4 rows =24 separated complete characters. Row1 DOWN/front-facing, row2 UP/back-facing (NO face), row3 true LEFT profile (nose points left, one eye), row4 true RIGHT profile (nose points right, one eye). All six figures in each row face the SAME corresponding direction. Whole silhouette including hair, hands and boots fits inside each cell with generous blank gutters on all four sides. Large vertical spacing so raised hands NEVER touch boots of the previous row. Every pose is full body, intact head/torso/shoulders/arms/hands/legs/boots, equal scale. Fixed baseline within each row; no simulated vertical jump inside cells, the game supplies jump translation. Truly transparent RGBA background. NO text, frame labels, grids, balls, effects, shadows, floor, extra objects or cropped extremities. Do not split into body parts or stretch limbs. Keep character costume and accessories unchanged in ALL24 poses.

Identity invariants: VALKYRIE: short chin-length golden blonde bob, blue eyes, original navy/black sports crop top and shorts with white trim and white side stripes, white wrapped hands/wrists (not red or black gloves), black knee pads, navy/white lace-up boots.

## Run prompt

Six chronological full-body RUN cuts: 1 athletic ready stance; 2 left stride/opposite arm swing; 3 left push-off/right leg passing; 4 passing stride; 5 right stride/opposite arm swing; 6 recovery approaching ready. Distinct natural arm/leg silhouettes, elbows below shoulders, hair follows motion.

Generated source: `exec-b333571e-5880-44d6-b692-ed4442ab83c3.png`.

## Toss prompt

Six chronological volleyball TOSS cuts: 1 bent-knee ready hands at chest; 2 hands lift toward forehead; 3 both elbows extend overhead; 4 both open palms release the ball above the skull; 5 relaxed overhead follow-through; 6 hands return to ready. Anatomical hands and elbows.

Use the approved Valkyrie RUN atlas as the same-character style reference. Generated source: `exec-e11a8e8b-c1da-4efe-8769-347d88d4539f.png`.

## Spike prompt

Six chronological volleyball SPIKE cuts: 1 athletic ready; 2 raised guide hand with striking right hand behind the head and bow-back torso; 3 right elbow cocked behind head; 4 fully extended right arm with open striking palm directly overhead; 5 forward striking-arm follow-through; 6 balanced bent-knee recovery. Clear volleyball overhead strike, never a horizontal fighting punch.

Original identity and approved run style. True-profile faces remain oriented with the row during torso rotation, anatomical overhead striking arms, smaller figures and 30px outer padding. Third row was regenerated to left-facing poses. Final source: `exec-d19a652b-f9f3-4eba-82ce-66d54a7634a9.png`.

Correction prompt: Use case: identity-preserve. Edit Image1 Valkyrie SPIKE atlas ONLY THIRD ROW's six whole-body figures. They must ALL face LEFT. Currently third-row figures2–6 wrongly look RIGHT. Redraw the complete third row with nose, visible blue eye, torso, knees and boots directed LEFT, one profile eye, in the same six chronological volleyball poses: ready; guidehand raised/strikinghand cocked behind head; elbow pulled behind head; open striking palm fully extended overhead; leftward forward-arm followthrough; low recovery. Do NOT reverse the column order. Keep all other three rows unchanged. Image2's third row is approved same-character LEFT-profile run reference. Preserve short blonde bob, blueeyes, navy sports crop and shorts white trim/side stripes, WHITE handwraps, navy/white boots, natural2.6–2.8-headSD, crown-to-boots scale, fixed baselines, all anatomical arms/hands. Exact6columns×4rows on transparent RGBA. Entire silhouettes must fit separate cells with generous gutters and blank canvas margins, no touching hands/boots between rows, no text/grids/ball/effects/floor/shadow.

## Block prompt

Six chronological volleyball BLOCK cuts: 1 lowered ready; 2 both hands rise; 3 both elbows extend overhead; 4 both OPEN palms held well ABOVE the skull, two hands visible; 5 hands lower; 6 bent-knee recovery. Two anatomical connected arms, fingers and wrists.

Original identity + approved same-character RUN. Both white-wrapped palms above crown, all six side poses look in their row's direction, natural SD, smaller figures with 40px outer padding. Final source: `exec-42a7c936-5db3-499e-9d90-054d295e9897.png`.
