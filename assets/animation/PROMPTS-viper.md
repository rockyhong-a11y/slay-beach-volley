# Viper whole-body cuts

Generated with built-in image_gen using the unchanged original SLAY Viper artwork as identity reference and Nova's completed whole-body cuts as style reference. Source atlases are saved in `source/viper-{run,toss,spike,block}.png`.

## Shared prompt

Use case: identity-preserve. Asset: complete 2D game animation atlas. Image 1 is the ORIGINAL character identity/costume reference. Image 2 is only the completed game's SD illustration/linework and animation-cut style reference. Draw fresh complete poses of image 1; never copy the identity of image 2. Natural SD proportions: 2.6–2.8 heads total, head about 38%, torso26%, legs36%, consistent crown-to-boot length and foot baseline. Polished hand-drawn cel-shaded anime art matching original. Composition: SQUARE canvas, exactly 6 columns × 4 rows =24 separated complete characters. Row1 DOWN/front-facing, row2 UP/back-facing (NO face), row3 true LEFT profile (nose points left, one eye), row4 true RIGHT profile (nose points right, one eye). All six figures in each row face the SAME corresponding direction. Whole silhouette including hair, hands and boots fits inside each cell with generous blank gutters on all four sides. Large vertical spacing so raised hands NEVER touch boots of the previous row. Every pose is full body, intact head/torso/shoulders/arms/hands/legs/boots, equal scale. Fixed baseline within each row; no simulated vertical jump inside cells, the game supplies jump translation. Truly transparent RGBA background. NO text, frame labels, grids, balls, effects, shadows, floor, extra objects or cropped extremities. Do not split into body parts or stretch limbs. Keep character costume and accessories unchanged in ALL24 poses.

Identity invariants: VIPER: long golden blonde twin braids tied with red bands, blue eyes, original emerald green sleeveless high-neck leotard with black belt and silver rectangular buckle, bare fingers/hands/wrists with NO gloves or wraps, black knee pads, red lace-up boots.

## Run prompt

Six chronological full-body RUN cuts: 1 athletic ready stance; 2 left stride/opposite arm swing; 3 left push-off/right leg passing; 4 passing stride; 5 right stride/opposite arm swing; 6 recovery approaching ready. Distinct natural arm/leg silhouettes, elbows below shoulders, hair follows motion.

Generated source: `exec-35c5d673-d638-44e5-ad80-849085b0c0ae.png`.

## Toss prompt

Six chronological volleyball TOSS cuts: 1 bent-knee ready hands at chest; 2 hands lift toward forehead; 3 both elbows extend overhead; 4 both open palms release the ball above the skull; 5 relaxed overhead follow-through; 6 hands return to ready. Anatomical hands and elbows.

Original identity + same-character approved run reference, bare open palms and larger gutters. The third row was corrected with built-in image_gen to true left-facing profiles while preserving other rows. Final generated source: `exec-decc9ca4-bd34-495e-adea-9f6723aedcb7.png`.

Correction prompt: Use case: identity-preserve. Precisely correct ONLY the THIRD ROW of this Viper TOSS atlas. There are six full-body figures in third row, currently incorrectly facing RIGHT. Redraw each third-row full-body figure in true LEFT profile: nose points LEFT, visible eye faces LEFT, torso/knees/boots face LEFT, ponytail/braids trail to RIGHT. Keep their six chronological volleyball toss poses and natural2.6–2.8-headSD. Preserve the first/front row, second/back row, fourth/RIGHT row unchanged, same emerald sleeveless leotard, silver belt buckle, red-tied golden twin braids, BARE hands(no wraps/gloves), black kneepads, red boots. Preserve complete whole-body figure art and dimensions, stable foot baselines, generous transparent gutters. Exactly6columns×4rows, actual transparent RGBA, no labels/text/grid/ball/shadows/effects. Image1 is the atlas edit target; Image2 is approved Viper RUN atlas reference for LEFT profile in third row. No figure or extremity may touch a neighbour or canvas edge.

## Spike prompt

Six chronological volleyball SPIKE cuts: 1 athletic ready; 2 raised guide hand with striking right hand behind the head and bow-back torso; 3 right elbow cocked behind head; 4 fully extended right arm with open striking palm directly overhead; 5 forward striking-arm follow-through; 6 balanced bent-knee recovery. Clear volleyball overhead strike, never a horizontal fighting punch.

Original identity + approved same-character RUN. Bare hands, emerald suit, profiles stay oriented with the row, ample outer padding. Third row received a full-body direction correction. Final source: `exec-c8b147a8-3aca-47c0-abc2-e7a25777ef0e.png`.

Correction prompt: Use case: identity-preserve. Precisely correct ONLY the THIRD ROW of Image1 VIPER SPIKE atlas: redraw its SIX complete figures facing LEFT, nose/one visible eye/torso/knees/boots LEFT throughout every action. Currently third row2–6 wrongly face right/front. Keep chronological columns unchanged: ready; leftward-facing bowback guidehand up and strikinghand behind head; elbow cocked; fully extended overhead open striking palm; forward followthrough toward LEFT; balanced crouch recovery facing LEFT. Image2 third row gives exact Viper LEFT-profile reference. Leave front row1, rear row2 and right row4 unchanged. Keep original golden twin braids/red bands, blueeyes, emerald sleeveless highneck leotard, black belt+silverbuckle, BARE hands(NO wraps/gloves), blackkneepads, red boots. Natural2.6–2.8-headSD, constant crown-to-boot length and footbaseline. True transparent RGBA, exactly6columns×4rows, generous gutters/no figure touches neighbours or canvas edges. NO text/grid/ball/shadows/effects.

## Block prompt

Six chronological volleyball BLOCK cuts: 1 lowered ready; 2 both hands rise; 3 both elbows extend overhead; 4 both OPEN palms held well ABOVE the skull, two hands visible; 5 hands lower; 6 bent-knee recovery. Two anatomical connected arms, fingers and wrists.

Original identity + same-character approved RUN. Bare hands/wrists, two open palms above crown, LEFT/RIGHT profiles match their rows, natural SD with 40px outer padding and large gutters. Final source: `exec-5cc4645e-d34a-4b8c-8ef6-f8643776255a.png`.
