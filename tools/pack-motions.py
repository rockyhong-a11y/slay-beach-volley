#!/usr/bin/env python3
"""Pack generated transparent directional kits without changing original SLAY art.

The generated PNGs are authoring inputs. Production receives a WebP plus skeletal
crop/pivot metadata; crops remain in the original atlas and alpha is preserved.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
IDS = ('nova', 'raven', 'valkyrie', 'viper', 'ember', 'atlas', 'seraph', 'lynx', 'tempest', 'onyx')
VIEWS = ('down', 'up', 'left', 'right')
HAIR_LENGTH = {'nova': 180, 'raven': 185, 'valkyrie': 130, 'viper': 185,
               'ember': 185, 'atlas': 130, 'seraph': 190, 'lynx': 130,
               'tempest': 180, 'onyx': 190}
LEFT_MIRROR = {'ember': False, 'atlas': False, 'seraph': False,
               'lynx': False, 'tempest': False, 'onyx': False}
HEAD_MIRROR = {'raven': {'left': False}}

# Reviewed against the 1024 x 1536 authoring atlases. Alpha bounds are not
# anatomical landmarks: loose curls or ponytail tips can lie below the neck,
# while a bun can extend above the skull. Using them as joint endpoints shrinks
# the face and even rotates a head toward an unrelated strand of hair.
# Each entry is the painted neck centre (x, y), then the skull-crown y. Keeping
# the axis vertical preserves the artist's profile rather than rotating it to
# compensate for the rear hair mass. The separate hair row owns long tails.
HEAD_CORE_HEIGHT = 112
HEAD_LANDMARKS = {
    'nova': {'down': (141, 218, 53), 'up': (391, 218, 53),
             'left': (637, 218, 54), 'right': (892, 218, 55)},
    'raven': {'down': (143, 226, 54), 'up': (390, 226, 51),
              'left': (625, 227, 53), 'right': (891, 227, 52)},
    'valkyrie': {'down': (149, 233, 49), 'up': (394, 230, 51),
                 'left': (643, 232, 52), 'right': (899, 234, 54)},
    'viper': {'down': (152, 199, 27), 'up': (407, 197, 27),
              'left': (643, 197, 27), 'right': (899, 197, 27)},
    'ember': {'down': (133, 208, 35), 'up': (389, 211, 34),
              'left': (623, 207, 40), 'right': (906, 206, 40)},
    'atlas': {'down': (131, 227, 60), 'up': (386, 226, 60),
              'left': (640, 224, 65), 'right': (907, 223, 65)},
    'seraph': {'down': (138, 244, 76), 'up': (394, 241, 78),
               'left': (615, 240, 90), 'right': (912, 240, 88)},
    'lynx': {'down': (132, 226, 45), 'up': (387, 220, 46),
             'left': (644, 224, 47), 'right': (891, 224, 45)},
    'tempest': {'down': (143, 243, 87), 'up': (383, 242, 94),
                'left': (613, 238, 100), 'right': (930, 242, 99)},
    'onyx': {'down': (129, 219, 71), 'up': (386, 221, 71),
             'left': (604, 219, 67), 'right': (926, 219, 68)},
}
# Preserve the complete natural crown and side silhouette, including decorative
# buns. Their extent is never the size axis: only the reviewed skull landmarks
# determine head scale. Trim bottom tails only, where the separate hair layer
# continues them. Cutting a crown to the skull axis creates a visible flat top.
# Short hairstyles retain their original crop and simply receive real joints.
HEAD_CORE_WINDOWS = {
    'ember': {'down': (21, 22, 247, 219), 'up': (277, 22, 498, 222),
              'left': (534, 28, 748, 219), 'right': (775, 28, 997, 220)},
    'seraph': {'down': (24, 19, 236, 252), 'up': (303, 19, 489, 249),
               'left': (517, 19, 756, 252), 'right': (768, 21, 1010, 252)},
    'tempest': {'down': (11, 28, 236, 251), 'up': (297, 34, 473, 251),
                'left': (512, 31, 758, 251), 'right': (769, 31, 1017, 251)},
    'onyx': {'down': (33, 20, 224, 232), 'up': (307, 20, 461, 229),
             'left': (530, 19, 747, 230), 'right': (787, 19, 1006, 230)},
}
# Some painted curls and braid tips cross into the next atlas column. These
# reviewed windows keep the complete intended hair, excluding disconnected
# pieces belonging to its neighbour; the authoring image remains untouched.
HAIR_WINDOWS = {
    'raven': {'up': (274, 244, 512, 469)},
    'viper': {'up': (285, 233, 512, 483), 'left': (538, 235, 768, 482)},
}
# The same column bleed occurs between Viper's paired legs. Exclude the left
# leg's tip before deriving both overlapping cuts of the right leg.
LEG_MIN_X = {'viper': {'up': {'R': 414}, 'left': {'R': 657}}}


def threshold(alpha, level=16):
    return alpha.point(lambda value: 255 if value > level else 0)


def bounds(alpha, region):
    x0, y0, x1, y1 = map(int, region)
    box = threshold(alpha.crop((x0, y0, x1, y1))).getbbox()
    if box is None:
        raise ValueError(f'No visible generated part in {region}')
    return [box[0] + x0, box[1] + y0, box[2] - box[0], box[3] - box[1]]


def bands(alpha):
    """Find actual row groups, including their sparse antialiased ends."""
    active = []
    mask = threshold(alpha, 64)
    for y in range(alpha.height):
        count = sum(bool(value) for value in mask.crop((0, y, alpha.width, y + 1)).getdata())
        if count >= alpha.width * .04:
            active.append(y)
    groups = []
    for y in active:
        if not groups or y - groups[-1][-1] > 2:
            groups.append([y])
        else:
            groups[-1].append(y)
    groups = [group for group in groups if len(group) >= 12]
    if len(groups) != 6:
        raise ValueError(f'Expected six alpha-separated row groups, got {[(g[0], g[-1]) for g in groups]}. Add an explicit reviewed band override.')
    edges = [0] + [math.floor((groups[index][-1] + groups[index + 1][0]) / 2) for index in range(5)] + [alpha.height]
    return list(zip(edges[:-1], edges[1:])), [[group[0], group[-1]] for group in groups]


def centerline(alpha, rect, global_y):
    """A local joint follows the opaque silhouette even when the limb leans."""
    x, y, width, height = rect
    target = max(y, min(y + height - 1, int(round(global_y))))
    for radius in (2, 5, 12, height):
        lo, hi = max(y, target - radius), min(y + height, target + radius + 1)
        pixels = alpha.crop((x, lo, x + width, hi))
        weighted_x = weight = 0
        for index, value in enumerate(pixels.getdata()):
            if value > 64:
                weight += value
                weighted_x += (index % width) * value
        if weight:
            return [round(weighted_x / weight, 3), round(target - y, 3)]
    raise ValueError(f'Empty centerline at {rect}')


def part(alpha, rect, pivot_y, tip_y):
    return {'rect': rect, 'pivot': centerline(alpha, rect, pivot_y), 'tip': centerline(alpha, rect, tip_y)}


def reviewed_head(alpha, identifier, facing, source_rect):
    window = HEAD_CORE_WINDOWS.get(identifier, {}).get(facing)
    rect = bounds(alpha, window) if window else source_rect
    x, y, width, height = rect
    neck_x, neck_y, crown_y = HEAD_LANDMARKS[identifier][facing]
    return {'rect': rect, 'pivot': [neck_x - x, neck_y - y],
            'tip': [neck_x - x, crown_y - y],
            'headCoreRect': rect[:], 'headCoreWorldHeight': HEAD_CORE_HEIGHT,
            'sourceRect': source_rect[:]}


def split_limb(alpha, rect, fraction):
    x, y, width, height = rect
    joint_y = y + height * fraction
    # Eight percent total overlap keeps a moving joint closed.
    upper_end = min(y + height, math.ceil(joint_y + height * .04))
    lower_start = max(y, math.floor(joint_y - height * .04))
    upper = bounds(alpha, (x, y, x + width, upper_end))
    lower = bounds(alpha, (x, lower_start, x + width, y + height))
    upper_part = part(alpha, upper, y + height * .045, joint_y)
    lower_part = part(alpha, lower, joint_y, y + height * .97)
    return upper_part, lower_part


def validate_part(alpha, atlas_size, item):
    x, y, width, height = item['rect']
    if width <= 0 or height <= 0 or x < 0 or y < 0 or x + width > atlas_size[0] or y + height > atlas_size[1]:
        raise ValueError(f'Part lies outside generated atlas: {item}')
    if threshold(alpha.crop((x, y, x + width, y + height)), 64).getbbox() is None:
        raise ValueError(f'Part has no opaque content: {item}')
    for label in ('pivot', 'tip'):
        px, py = item[label]
        if not 0 <= px <= width or not 0 <= py <= height:
            raise ValueError(f'Local {label} lies outside crop: {item}')


def pack_character(identifier, previous=None):
    source = ROOT / 'assets' / 'motions' / 'source' / f'{identifier}.png'
    source_bytes = source.read_bytes()
    source_sha = hashlib.sha256(source_bytes).hexdigest()
    image = Image.open(io.BytesIO(source_bytes)).convert('RGBA')
    alpha = image.getchannel('A')
    if sum(value < 16 for value in alpha.getdata()) / (image.width * image.height) < .15:
        raise ValueError(f'{identifier}: generated kit must have a real transparent background')
    rows, groups = bands(alpha)
    views, key_art = {}, {}
    for column, name in enumerate(VIEWS):
        x0, x1 = round(column * image.width / 4), round((column + 1) * image.width / 4)
        row_rects = [bounds(alpha, (x0, y0, x1, y1)) for y0, y1 in rows]
        head, hair, body = row_rects[:3]
        hair_window = HAIR_WINDOWS.get(identifier, {}).get(name)
        if hair_window:
            hair = bounds(alpha, hair_window)
        parts = {
            'head': reviewed_head(alpha, identifier, name, head),
            'body': part(alpha, body, body[1] + body[3] * .97, body[1] + body[3] * .06),
            'hair': part(alpha, hair, hair[1] + hair[3] * (HEAD_CORE_HEIGHT / HAIR_LENGTH[identifier]), hair[1] + hair[3] * .97),
        }
        if name in HEAD_MIRROR.get(identifier, {}):
            parts['head']['mirror'] = HEAD_MIRROR[identifier][name]
        for side, region in (('L', (x0, (x0 + x1) // 2)), ('R', ((x0 + x1) // 2, x1))):
            left, right = region
            arm = bounds(alpha, (left, rows[3][0], right, rows[3][1]))
            leg_left = LEG_MIN_X.get(identifier, {}).get(name, {}).get(side, left)
            leg = bounds(alpha, (leg_left, rows[4][0], right, rows[4][1]))
            parts[f'upperArm{side}'], parts[f'forearm{side}'] = split_limb(alpha, arm, .45)
            parts[f'thigh{side}'], parts[f'shin{side}'] = split_limb(alpha, leg, .48)
        for item in parts.values():
            validate_part(alpha, image.size, item)
        views[name] = {'mirror': name == 'left' and LEFT_MIRROR.get(identifier, True), 'hairLengthWorld': HAIR_LENGTH[identifier], 'parts': parts}
        key_art[name] = {'rect': row_rects[5]}

    destination = source.parent.parent / f'{identifier}.webp'
    unchanged = previous and previous.get('sourceSha256') == source_sha and destination.exists()
    if unchanged:
        unchanged = hashlib.sha256(destination.read_bytes()).hexdigest() == previous.get('webpSha256')
    if not unchanged:
        image.save(destination, 'WEBP', quality=94, method=6, alpha_quality=100, exact=True)
    decoded = Image.open(destination).convert('RGBA')
    if decoded.size != image.size or decoded.getchannel('A').tobytes() != alpha.tobytes():
        raise ValueError(f'{identifier}: WebP conversion changed alpha or dimensions')
    result = {'source': f'../assets/motions/{identifier}.webp', 'width': image.width, 'height': image.height,
              'views': views, 'keyArt': key_art, 'detectedRowGroups': groups,
              'identity': {'sourceCharacter': identifier, 'generatedDirectionalKit': True},
              'alphaSha256': hashlib.sha256(alpha.tobytes()).hexdigest(),
              'sourceSha256': source_sha,
              'webpSha256': hashlib.sha256(destination.read_bytes()).hexdigest()}
    return result, image


def contact_sheet(characters, images):
    # Diagnostic crop assembly only; the production atlases remain untouched.
    cell_width, cell_height = 256, 350
    sheet = Image.new('RGB', (cell_width * 4, cell_height * len(characters)), '#f6f4ef')
    draw = ImageDraw.Draw(sheet)
    for row, (identifier, metadata) in enumerate(characters.items()):
        for column, name in enumerate(VIEWS):
            origin_x, origin_y = column * cell_width, row * cell_height
            view = metadata['views'][name]
            draw.text((origin_x + 10, origin_y + 8), f'{identifier.upper()} / {name} / mirror:{view["mirror"]}', fill='#152729')
            positions = {'head': (10, 34, 112, 96), 'hair': (136, 34, 112, 96), 'body': (78, 137, 100, 82),
                         'upperArmL': (10, 139, 40, 70), 'forearmL': (10, 220, 40, 110),
                         'upperArmR': (205, 139, 40, 70), 'forearmR': (205, 220, 40, 110),
                         'thighL': (62, 224, 56, 52), 'shinL': (62, 282, 56, 64),
                         'thighR': (136, 224, 56, 52), 'shinR': (136, 282, 56, 64)}
            for label, item in view['parts'].items():
                x, y, width, height = item['rect']
                crop = images[identifier].crop((x, y, x + width, y + height))
                px, py, target_width, target_height = positions[label]
                ratio = min(target_width / width, target_height / height)
                crop = crop.resize((max(1, round(width * ratio)), max(1, round(height * ratio))), Image.Resampling.LANCZOS)
                location = (origin_x + px + (target_width - crop.width) // 2, origin_y + py)
                sheet.paste(crop, location, crop)
                for point, color in ((item['pivot'], '#fa394a'), (item['tip'], '#1670e9')):
                    point_x, point_y = location[0] + point[0] * ratio, location[1] + point[1] * ratio
                    draw.ellipse((point_x - 2, point_y - 2, point_x + 2, point_y + 2), fill=color)
    destination = ROOT / 'artifacts' / 'motion-parts.webp'
    destination.parent.mkdir(exist_ok=True)
    sheet.save(destination, 'WEBP', quality=92, method=6)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-partial', action='store_true', help='Pack kits already generated while other characters are still being authored.')
    args = parser.parse_args()
    characters, images = {}, {}
    path = ROOT / 'assets' / 'motions' / 'manifest.json'
    previous = json.loads(path.read_text()).get('characters', {}) if path.exists() else {}
    for identifier in IDS:
        source = ROOT / 'assets' / 'motions' / 'source' / f'{identifier}.png'
        if not source.exists():
            if args.allow_partial:
                continue
            raise FileNotFoundError(f'Generate {source} before a complete production pack')
        characters[identifier], images[identifier] = pack_character(identifier, previous.get(identifier))
        print(f'{identifier}: {source.parent.parent.joinpath(identifier + ".webp").stat().st_size:,} bytes; six rows, four views, 44 skeletal parts', flush=True)
    if not characters:
        raise ValueError('No generated source kits found')
    if len({value['sourceSha256'] for value in characters.values()}) != len(characters):
        raise ValueError('Every character needs its own original-identity directional kit')
    manifest = {'version': 1, 'sampleRate': 60,
                'anatomy': {'headCoreWorldHeight': HEAD_CORE_HEIGHT,
                            'headAxis': 'reviewed-skull-crown-to-neck'},
                'characters': characters}
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(path)
    contact_sheet(characters, images)
    print(f'Packed {len(characters)} characters; alpha and all local pivots validated')


if __name__ == '__main__':
    main()
