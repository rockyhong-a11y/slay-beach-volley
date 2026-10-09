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
HAIR_LENGTH = {'nova': 180, 'raven': 185, 'valkyrie': 110, 'viper': 185,
               'ember': 185, 'atlas': 110, 'seraph': 190, 'lynx': 110,
               'tempest': 180, 'onyx': 190}
LEFT_MIRROR = {'ember': False, 'atlas': False, 'seraph': False,
               'lynx': False, 'tempest': False, 'onyx': False}
HEAD_MIRROR = {'raven': {'left': False}}


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
        parts = {
            'head': part(alpha, head, head[1] + head[3] * .97, head[1] + head[3] * .04),
            'body': part(alpha, body, body[1] + body[3] * .97, body[1] + body[3] * .06),
            'hair': part(alpha, hair, hair[1] + hair[3] * (95 / HAIR_LENGTH[identifier]), hair[1] + hair[3] * .97),
        }
        if name in HEAD_MIRROR.get(identifier, {}):
            parts['head']['mirror'] = HEAD_MIRROR[identifier][name]
        for side, region in (('L', (x0, (x0 + x1) // 2)), ('R', ((x0 + x1) // 2, x1))):
            left, right = region
            arm = bounds(alpha, (left, rows[3][0], right, rows[3][1]))
            leg = bounds(alpha, (left, rows[4][0], right, rows[4][1]))
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
    manifest = {'version': 1, 'sampleRate': 60, 'characters': characters}
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(path)
    contact_sheet(characters, images)
    print(f'Packed {len(characters)} characters; alpha and all local pivots validated')


if __name__ == '__main__':
    main()
