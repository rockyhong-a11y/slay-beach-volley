# 새 방향별 캐릭터 모션 아트

2026-10-09, 사용자의 캐릭터 모션 전면 개선 요청에 따라 내장 image_gen으로 생성했습니다. 원본 캐릭터 10명의 얼굴·머리·의상·색상을 기준으로 새 배구용 파츠를 그렸으며, 원본 시트와 로비 초상화는 유지했습니다.

생성 모드: **built-in image_gen**, 기존 원본 이미지 참조, 투명 배경. 외부 이미지 생성 API는 사용하지 않았습니다.

| 캐릭터 | 생성 원본 | 런타임 |
| --- | --- | --- |
| nova | [PNG](source/nova.png) | [WebP](nova.webp) |
| raven | [PNG](source/raven.png) | [WebP](raven.webp) |
| valkyrie | [PNG](source/valkyrie.png) | [WebP](valkyrie.webp) |
| viper | [PNG](source/viper.png) | [WebP](viper.webp) |
| ember | [PNG](source/ember.png) | [WebP](ember.webp) |
| atlas | [PNG](source/atlas.png) | [WebP](atlas.webp) |
| seraph | [PNG](source/seraph.png) | [WebP](seraph.webp) |
| lynx | [PNG](source/lynx.png) | [WebP](lynx.webp) |
| tempest | [PNG](source/tempest.png) | [WebP](tempest.webp) |
| onyx | [PNG](source/onyx.png) | [WebP](onyx.webp) |

각 키트는 앞·뒤·좌·우와 머리·뒷머리·몸통·팔·다리·배구 전용 참고 포즈를 포함합니다. `tools/pack-motions.py`는 실제 투명 영역을 기준으로 파츠를 분리하고 상완/전완, 허벅지/종아리 관절 좌표를 기록합니다. 10종 × 4방향 × 11파츠를 사용합니다. 생성 결과의 셀 크기는 요청한 이상적 크기와 다를 수 있어 메타데이터는 실제 픽셀을 측정합니다. 투명도를 보존한 WebP 변환이며 원본 PNG·알파·WebP 해시는 [manifest.json](manifest.json)에 있습니다.

런타임은 파츠를 이용한 관절 애니메이션입니다. 대기·달리기·토스·스파이크·블로킹·서브·착지에 각각 60개의 고유 관절 자세를 만들고 프레임 사이를 보간합니다. 생성 이미지 60장을 반복하는 방식이 아닙니다. 방향별 얼굴과 등 그림은 실제 생성된 방향 아트이며 일부 생성된 측면 파츠의 좌우 방향은 메타데이터의 mirror로 보정합니다. 팔은 자연스러운 길이 안에서 실제 공 접촉점에 맞추며, 멀리 있는 공에 맞추려고 늘리지 않습니다.

## 공통 프롬프트

```text
Use case: identity-preserve. Asset type: production 2D skeletal-animation sprite atlas for a volleyball game.
Input image: character identity/style reference only (the three existing fighting poses are not usable animation frames). Preserve this character's exact hairstyle, hair color, face, skin tone, earrings/accessories, costume, gloves, knee pads and boots. Keep the same polished shaded SD chibi anime game-sprite style. Create NEW neutral anatomical art suitable for rigging, NOT copied fighting poses.
Output: one tall transparent RGBA PNG sprite atlas, ideally 2048x3072, EXACTLY 4 equal columns and 6 equal rows with generous transparent gutters, no captions/grid/letters/numbers/shadows/background.
Columns from left to right: DOWN/front facing camera; UP/back facing away (no eyes or face visible); LEFT true left profile; RIGHT true right profile. Use genuinely different directional drawings, not mirrored front drawings.
Each of the 24 equal cells has only the specified cutout:
ROW 1: isolated head with face/front bangs, short neck, crown hair; omit long back-hair so it does not overlap body art. Keep recognizable original facial identity and SD proportions. The rear head shows only back of head, side heads have one visible eye.
ROW 2: isolated complete BACK-HAIR silhouette/ponytail/long locks as appropriate, to layer behind the torso and head; no face or skin or body. Preserve the source character's actual hair volume.
ROW 3: isolated torso AND pelvis together, cropped from shoulder line through shorts/hip seam. Full clean torso artwork behind where arms attach, original clothing and exposed waist; NO head, arms or legs.
ROW 4: a PAIR of separate complete straight relaxed arms from shoulder to gloved hands, left arm on left half of cell and right arm on right half, with wide transparent gap. Natural elbows straight, fingers relaxed, full hidden upper-arm and forearm artwork, round shoulder joint ends with overlap padding. Neither arm attached to any torso. Arms point straight DOWN.
ROW 5: a PAIR of separate straight legs from hip to boot soles, left leg on left half and right on right half. Entire upper thighs, knees, knee pads, shin and boots visible, round hip joint ends with overlap padding; legs point DOWN with slightly bent athletic knees. No hip/torso attached. Transparent gap between legs.
ROW 6: one full body reference pose per column, showing the same anatomy and costume: front overhead volleyball toss with open hands; rear double-hand overhead blocking; left-profile running stride; right-profile airborne spike wind-up with elbow bent and hand behind head. No ball, props or effects. These dedicated volleyball key poses are anatomy/motion references.
Alignment: each cutout centered in its own exact grid cell, consistent natural scale across all four views, no pieces crossing into neighbouring cells, round overlappable joints. Preserve detail, clean dark outlines, solid interior paint and soft cel shading, honest alpha. No missing boots, no extra limbs, no weapons, no redesign.
IMPORTANT: The third column MUST look LEFT with the nose pointing towards the LEFT EDGE; the fourth column MUST look RIGHT with the nose pointing towards the RIGHT EDGE. Use the second input only as a grid/layout reference; replace EVERY visual part with the FIRST character, preserve the FIRST character's face, hair, costumes and palette. Do not copy Nova features into another character. Invisible background with real alpha 0; solid interiors close to alpha255.
```

노바를 먼저 제작한 다음 레이븐·발키리·바이퍼는 원본 캐릭터와 노바의 그리드 배치를 함께 참조했습니다. 엠버·아틀라스·세라프·링스·템페스트·오닉스는 해당 원본 캐릭터만 참조했고 공통 프롬프트의 두 번째 입력 관련 문구를 제외했습니다. 첫 입력의 캐릭터 ID를 매번 명시했습니다.

## 수정 프롬프트

- 레이븐: 원본의 검은 레깅스와 붉은 측면 줄무늬를 다리 파츠와 배구 참고 포즈에 유지하도록 수정. 생성된 앞·뒤·옆의 얼굴·머리·붉은 의상을 유지하고 모든 파츠가 셀을 넘지 않도록 요청했습니다.
- 바이퍼: 원본의 맨손, 녹색 의상, 붉은 부츠를 유지. 첫 행 머리에서 긴 땋은 뒷머리를 분리하고 둘째 행의 독립 뒷머리에만 배치하도록 수정. 6개 행 사이 투명 여백과 실제 알파 0 배경을 요청했습니다.

최종 레이븐과 바이퍼는 수정 생성 결과를 사용하며, 부적합한 최초 결과는 배포하지 않습니다.

