#!/usr/bin/env python3
"""Package complete transparent poses without modifying their painted anatomy.

Inputs are image-generated PNG atlases: six poses across, then down/up/left/right
rows. Production WebP repacks complete figures with exact source alpha and
generous gutters; no limbs are extracted, transformed, repainted or composited.

Reviewed overrides, keyed by "nova-run" (or character/clips), may contain:
  {"rows": [0,256,512,768,1024], "cols": [0,256,512,768,1024,1280,1536],
   "bodyHeight": 210, "frames": {"down": [{"pivot": [80,210]}, null, ...]}}
Columns may instead be an object keyed by direction. A replacement frame may
reference separately generated whole art with {"imagePNG": "./source/extra.png",
"sourceComponent": 0, "sourceColumns": 3, "sourceRows": 1, "bodyHeight": 720}.
Replacement bodyHeight is its reviewed crown-to-boots length, excluding raised
hands. Original authoring files and every selected figure remain unchanged.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import statistics
from array import array
from collections import deque
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FACINGS = ('down', 'up', 'left', 'right')
CLIPS = ('run', 'toss', 'spike', 'block')
FRAME_COUNT = 6


def digest(data):
    return hashlib.sha256(data).hexdigest()


def reviewed_edges(values, extent, count, label):
    if len(values) != count + 1 or any(not isinstance(value, int) for value in values):
        raise ValueError(f'{label}: expected {count + 1} integer edges')
    if values[0] < 0 or values[-1] > extent or any(a >= b for a, b in zip(values, values[1:])):
        raise ValueError(f'{label}: edges must increase within the atlas')
    return values


def config_for(overrides, identifier, clip):
    character = overrides.get('characters', {}).get(identifier, {})
    return {**character.get('clips', {}).get(clip, {}), **overrides.get(f'{identifier}-{clip}', {})}


def find_figures(image, label, columns=6, rows=4):
    """Locate separate opaque figures without changing any source pixels."""
    width, height = image.size
    alpha = image.getchannel('A').tobytes()
    remaining = bytearray(1 if value > 64 else 0 for value in alpha)
    components = []
    for seed in range(len(remaining)):
        if not remaining[seed]:
            continue
        remaining[seed] = 0
        stack, pixels = [seed], []
        x0, y0, x1, y1 = width, height, 0, 0
        while stack:
            pixel = stack.pop()
            pixels.append(pixel)
            x, y = pixel % width, pixel // width
            x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x + 1), max(y1, y + 1)
            neighbours = ([pixel - 1] if x else []) + ([pixel + 1] if x + 1 < width else []) + ([pixel - width] if y else []) + ([pixel + width] if y + 1 < height else [])
            for neighbour in neighbours:
                if remaining[neighbour]:
                    remaining[neighbour] = 0
                    stack.append(neighbour)
        if len(pixels) > max(1500, width * height // 800):
            components.append({'pixels': pixels, 'visible': [x0, y0, x1, y1]})
    expected = columns * rows
    if len(components) != expected:
        raise ValueError(f'{label}: expected {expected} complete connected figures, found {len(components)}. Review or regenerate the atlas.')
    components.sort(key=lambda item: (item['visible'][1] + item['visible'][3]) / 2)
    ordered = []
    for row in range(rows):
        ordered += sorted(components[row * columns:(row + 1) * columns], key=lambda item: (item['visible'][0] + item['visible'][2]) / 2)
    return ordered


def separate_figures(image, label, columns=6, rows=4):
    """Assign original pixels to complete, spatially separate figures.

    High-alpha components identify the figures. A nearest-component partition
    assigns antialias edges and detached details without dropping or repainting
    any source pixel. Every positive-alpha pixel has exactly one owner.
    """
    width, height = image.size
    alpha = image.getchannel('A').tobytes()
    ordered = find_figures(image, label, columns, rows)
    owners = array('H', [0]) * len(alpha)
    queue = deque()
    for index, component in enumerate(ordered, 1):
        for pixel in component['pixels']:
            owners[pixel] = index
            queue.append(pixel)
    while queue:
        pixel = queue.popleft()
        x, y = pixel % width, pixel // width
        neighbours = ([pixel - 1] if x else []) + ([pixel + 1] if x + 1 < width else []) + ([pixel - width] if y else []) + ([pixel + width] if y + 1 < height else [])
        for neighbour in neighbours:
            if owners[neighbour] == 0:
                owners[neighbour] = owners[pixel]
                queue.append(neighbour)
    bounds = [[width, height, 0, 0] for _ in ordered]
    counts = [[0, 0] for _ in ordered]
    for pixel, value in enumerate(alpha):
        if value:
            index = owners[pixel] - 1
            x, y = pixel % width, pixel // width
            box = bounds[index]
            box[0], box[1], box[2], box[3] = min(box[0], x), min(box[1], y), max(box[2], x + 1), max(box[3], y + 1)
            counts[index][0] += 1
            counts[index][1] += value > 64
    rgba = image.tobytes()
    for index, component in enumerate(ordered, 1):
        x0, y0, x1, y1 = bounds[index - 1]
        frame_width, frame_height = x1 - x0, y1 - y0
        raw = bytearray(frame_width * frame_height * 4)
        for y in range(y0, y1):
            for x in range(x0, x1):
                pixel = y * width + x
                if owners[pixel] == index and alpha[pixel]:
                    target = ((y - y0) * frame_width + x - x0) * 4
                    raw[target:target + 4] = rgba[pixel * 4:pixel * 4 + 4]
        crop = Image.frombytes('RGBA', (frame_width, frame_height), bytes(raw))
        visible = component['visible']
        # Ground follows the actual boots, not a low-alpha halo or a raised-hand
        # bounding box. Atlas lift is not applied on top of the engine's jump.
        foot_left, foot_top, foot_right, foot_bottom = visible
        foot_top = math.floor(foot_bottom - (foot_bottom - foot_top) * .15)
        weighted_x = weight = 0
        for y in range(foot_top, foot_bottom):
            for x in range(foot_left, foot_right):
                pixel = y * width + x
                if owners[pixel] == index and alpha[pixel] > 64:
                    weighted_x += (x + .5) * alpha[pixel]
                    weight += alpha[pixel]
        component.update({'crop': crop, 'sourceRect': [x0, y0, frame_width, frame_height],
                          'sourcePivot': [round(weighted_x / weight if weight else (foot_left + foot_right) / 2, 3), foot_bottom],
                          'positiveAlphaPixels': counts[index - 1][0], 'opaquePixels': counts[index - 1][1],
                          'componentSha256': digest(bytes(raw)), 'componentAlphaSha256': digest(crop.getchannel('A').tobytes())})
        del component['pixels']
    if sum(item['positiveAlphaPixels'] for item in ordered) != sum(value > 0 for value in alpha):
        raise ValueError(f'{label}: extraction lost or duplicated source alpha')
    return ordered


def read_figures(path, columns=6, rows=4):
    source = path.read_bytes()
    image = Image.open(io.BytesIO(source)).convert('RGBA')
    alpha = image.getchannel('A')
    if sum(value < 16 for value in alpha.getdata()) / (image.width * image.height) < .15:
        raise ValueError(f'{path.name}: a real transparent background is required')
    figures = separate_figures(image, path.name, columns, rows)
    return {'sourcePath': path, 'sourceBytes': source, 'image': image, 'sourceAlpha': alpha,
            'figures': figures, 'columns': columns, 'rows': rows}


def source_descriptor(data, selected):
    image = data['image']
    return {'source': './' + data['sourcePath'].relative_to(ROOT / 'assets' / 'animation').as_posix(),
            'width': image.width, 'height': image.height, 'columns': data['columns'], 'rows': data['rows'],
            'sourceSha256': digest(data['sourceBytes']), 'sourceAlphaSha256': digest(data['sourceAlpha'].tobytes()),
            'selectedComponentIndices': sorted(selected),
            'components': [{'sourceRect': item['sourceRect'],
                            'sourceVisibleRect': [item['visible'][0], item['visible'][1], item['visible'][2] - item['visible'][0], item['visible'][3] - item['visible'][1]],
                            'positiveAlphaPixels': item['positiveAlphaPixels'], 'opaquePixels': item['opaquePixels'],
                            'rgbaSha256': item['componentSha256'], 'alphaSha256': item['componentAlphaSha256']}
                           for item in data['figures']]}


def pack_figures(figures, padding=8):
    """Translate complete source crops into compact shelves; never resize art."""
    ordered = sorted(range(len(figures)), key=lambda index: figures[index]['crop'].height, reverse=True)
    minimum = max(item['crop'].width + padding * 2 for item in figures)
    area = sum((item['crop'].width + padding * 2) * (item['crop'].height + padding * 2) for item in figures)
    candidates = sorted({minimum, max(minimum, math.ceil(math.sqrt(area))), *[width for width in (1024, 1280, 1536, 2048) if width >= minimum]})
    best = None
    for atlas_width in candidates:
        shelves, placements = [], {}
        for index in ordered:
            crop = figures[index]['crop']
            width, height = crop.width + padding * 2, crop.height + padding * 2
            shelf = next((shelf for shelf in shelves if shelf['height'] >= height and shelf['x'] + width <= atlas_width), None)
            if shelf is None:
                shelf = {'x': 0, 'y': sum(shelf['height'] for shelf in shelves), 'height': height}
                shelves.append(shelf)
            placements[index] = [shelf['x'], shelf['y'], width, shelf['height']]
            shelf['x'] += width
        width = max(shelf['x'] for shelf in shelves)
        height = sum(shelf['height'] for shelf in shelves)
        score = width * height + max(width, height) ** 2 * .05
        if best is None or score < best[0]:
            best = (score, width, height, placements)
    _, width, height, placements = best
    packed = Image.new('RGBA', (width, height))
    for index, item in enumerate(figures):
        x, y, _, _ = placements[index]
        packed.paste(item['crop'], (x + padding, y + padding))
        crop = item['crop']
        if packed.crop((x + padding, y + padding, x + padding + crop.width, y + padding + crop.height)).tobytes() != crop.tobytes():
            raise ValueError('Shelf packing altered selected source RGBA pixels')
    if sum(value > 0 for value in packed.getchannel('A').getdata()) != sum(item['positiveAlphaPixels'] for item in figures):
        raise ValueError('Shelf packing lost or duplicated selected source alpha')
    return packed, placements


def load_source(identifier, clip, overrides):
    filename = f'{identifier}-{clip}.png'
    path = ROOT / 'assets' / 'animation' / 'source' / filename
    original = read_figures(path)
    source, source_image, source_alpha = original['sourceBytes'], original['image'], original['sourceAlpha']
    config = config_for(overrides, identifier, clip)
    figures = original['figures']
    # Review edges alter component ordering only. They never cut through a
    # figure's fingers, hair or boots, even when row projections overlap.
    if 'rows' in config:
        row_edges = reviewed_edges(config['rows'], source_image.height, 4, filename + '/rows')
        reviewed = []
        for row, facing in enumerate(FACINGS):
            candidates = [item for item in figures if row_edges[row] <= (item['visible'][1] + item['visible'][3]) / 2 < row_edges[row + 1]]
            if len(candidates) != 6:
                raise ValueError(f'{filename}/{facing}: reviewed row must contain six complete figures')
            columns = config.get('cols')
            if isinstance(columns, dict):
                columns = columns.get(facing)
            if columns:
                columns = reviewed_edges(columns, source_image.width, 6, filename + '/' + facing)
                candidates = sorted(candidates, key=lambda item: next((column for column in range(6) if columns[column] <= (item['visible'][0] + item['visible'][2]) / 2 < columns[column + 1]), 99))
            else:
                candidates.sort(key=lambda item: (item['visible'][0] + item['visible'][2]) / 2)
            reviewed += candidates
        figures = reviewed
    sources = {path.resolve(): original}
    primary_indices = {id(item): index for index, item in enumerate(original['figures'])}
    chosen = []
    for row, facing in enumerate(FACINGS):
        reviews = config.get('frames', {}).get(facing, [])
        for frame in range(FRAME_COUNT):
            review = reviews[frame] if frame < len(reviews) and reviews[frame] else {}
            item = figures[row * FRAME_COUNT + frame]
            source_key, source_index = path.resolve(), primary_indices[id(item)]
            if 'imagePNG' in review:
                correction_path = (ROOT / 'assets' / 'animation' / review['imagePNG']).resolve()
                if not correction_path.is_relative_to(ROOT / 'assets' / 'animation' / 'source'):
                    raise ValueError(f'{filename}/{facing}/{frame}: corrections must reference preserved source PNGs')
                if correction_path not in sources:
                    sources[correction_path] = read_figures(correction_path, review.get('sourceColumns', 3), review.get('sourceRows', 1))
                source_key, source_index = correction_path, review['sourceComponent']
                if not isinstance(source_index, int) or not 0 <= source_index < len(sources[source_key]['figures']):
                    raise ValueError(f'{filename}/{facing}/{frame}: invalid correction component index')
                if not isinstance(review.get('bodyHeight'), (int, float)) or review['bodyHeight'] <= 0:
                    raise ValueError(f'{filename}/{facing}/{frame}: correction requires its reviewed crown-to-boots bodyHeight')
                item = sources[source_key]['figures'][source_index]
            chosen.append({'item': item, 'review': review, 'sourceKey': source_key, 'sourceIndex': source_index})
    for entry in chosen:
        left, top, right, bottom = entry['item']['visible']
        image = sources[entry['sourceKey']]['image']
        if left <= 0 or top <= 0 or right >= image.width or bottom >= image.height:
            raise ValueError(f'{entry["sourceKey"].name}: selected complete figure reaches the source canvas border at {entry["item"]["visible"]}. Regenerate its whole anatomy.')
    padding = 8
    packed, placements = pack_figures([entry['item'] for entry in chosen], padding)
    views = {}
    for row, facing in enumerate(FACINGS):
        frames = []
        for frame in range(6):
            selected = chosen[row * FRAME_COUNT + frame]
            item, review = selected['item'], selected['review']
            crop = item['crop']
            cell_x, cell_y, cell_width, cell_height = placements[row * FRAME_COUNT + frame]
            x, y = cell_x + padding, cell_y + padding
            source_x, source_y, width, height = item['sourceRect']
            pivot = [item['sourcePivot'][0] - source_x, item['sourcePivot'][1] - source_y]
            if 'pivot' in review:
                pivot = review['pivot']
            if len(pivot) != 2 or not 0 <= pivot[0] <= width or not 0 <= pivot[1] <= height:
                raise ValueError(f'{filename}/{facing}/{frame}: reviewed pivot lies outside the whole figure')
            visible = item['visible']
            frames.append({'rect': [x, y, width, height], 'pivot': pivot,
                           'sourceRect': item['sourceRect'], 'sourceVisibleRect': [visible[0], visible[1], visible[2] - visible[0], visible[3] - visible[1]],
                           'sourcePivot': item['sourcePivot'], 'cell': [cell_x, cell_y, cell_width, cell_height],
                           'source': './' + selected['sourceKey'].relative_to(ROOT / 'assets' / 'animation').as_posix(), 'sourceComponentIndex': selected['sourceIndex'],
                           'replacement': selected['sourceKey'] != path.resolve(),
                           'clearance': [padding, padding, cell_width - padding - width, cell_height - padding - height],
                           'groundBaseline': item['sourcePivot'][1], 'componentSha256': item['componentSha256'],
                           'alphaSha256': item['componentAlphaSha256'], 'rgbaSha256': item['componentSha256'],
                           'positiveAlphaPixels': item['positiveAlphaPixels'], 'opaquePixels': item['opaquePixels'],
                           **({'reviewedBodyHeight': review['bodyHeight']} if 'bodyHeight' in review else {})})
        if len({frame['rgbaSha256'] for frame in frames}) != 6:
            raise ValueError(f'{filename}/{facing}: six distinct whole poses are required')
        views[facing] = frames
    descriptors = [source_descriptor(data, {entry['sourceIndex'] for entry in chosen if entry['sourceKey'] == key}) for key, data in sources.items()]
    return {'sourcePath': path, 'sourceBytes': source, 'image': packed, 'alpha': packed.getchannel('A'),
            'sourceAlpha': source_alpha, 'sourceWidth': source_image.width, 'sourceHeight': source_image.height,
            'config': config, 'views': views, 'sources': descriptors, 'packing': 'whole-figure-shelves',
            'detectedRowGroups': [[min(item['visible'][1] for item in figures[row * 6:(row + 1) * 6]), max(item['visible'][3] for item in figures[row * 6:(row + 1) * 6])] for row in range(4)]}

def pack_character(identifier, overrides, allow_partial=False):
    loaded = {}
    warnings = []
    for clip in CLIPS:
        path = ROOT / 'assets' / 'animation' / 'source' / f'{identifier}-{clip}.png'
        if path.exists():
            try:
                loaded[clip] = load_source(identifier, clip, overrides)
            except (ValueError, OSError) as error:
                if not allow_partial:
                    raise
                warnings.append({'clip': clip, 'error': str(error)})
        elif not allow_partial:
            raise FileNotFoundError(f'Missing generated whole-body atlas: {path}')
    if not loaded:
        return None
    if 'run' not in loaded:
        if allow_partial:
            print(json.dumps({'skippedCharacter': identifier, 'warnings': warnings}))
            return None
        raise ValueError(f'{identifier}: run atlas is needed as the stable crown-to-ground scale reference')
    character_config = overrides.get('characters', {}).get(identifier, {})
    run = loaded['run']
    reference_height = character_config.get('bodyHeight', statistics.median(frames[0]['sourceVisibleRect'][3] for frames in run['views'].values()))
    if not isinstance(reference_height, (int, float)) or reference_height <= 0:
        raise ValueError(f'{identifier}: invalid crown-to-ground bodyHeight')
    result = {'sourceCharacter': identifier, 'style': 'original-2d-whole-body', 'bodyHeight': reference_height,
              'sourceSprite': f'../sprites/{identifier}.webp', 'sourcePortrait': f'../portraits/{identifier}.webp',
              'sourceSpriteSha256': digest((ROOT / 'assets' / 'sprites' / f'{identifier}.webp').read_bytes()),
              'sourcePortraitSha256': digest((ROOT / 'assets' / 'portraits' / f'{identifier}.webp').read_bytes()), 'clips': {},
              **({'packingWarnings': warnings} if warnings else {})}
    for clip, data in loaded.items():
        image, alpha, config = data['image'], data['alpha'], data['config']
        # Raised hands enlarge a pose's bounding box, not its anatomical scale.
        # The first pose of each directional row is a ready stance with its
        # hands below the skull. Its crown-to-foot median is a stable reference
        # for all six poses, including the overhead contact. Separate generated
        # atlases can have different figure sizes even at the same resolution.
        clip_body_height = config.get('bodyHeight', character_config.get('bodyHeight', statistics.median(frames[0]['sourceVisibleRect'][3] for frames in data['views'].values())))
        if not isinstance(clip_body_height, (int, float)) or clip_body_height <= 0:
            raise ValueError(f'{identifier}/{clip}: invalid bodyHeight')
        for frames in data['views'].values():
            for frame in frames:
                reviewed_height = frame.pop('reviewedBodyHeight', clip_body_height)
                if reviewed_height != clip_body_height and not frame['replacement']:
                    raise ValueError(f'{identifier}/{clip}: review bodyHeight at clip level so all six whole poses keep one uniform scale')
                frame['bodyHeight'] = reviewed_height
                frame['scaleReference'] = 'reviewed-correction-crown-to-ground' if frame['replacement'] else 'clip-ready-stance'
                if not isinstance(frame['bodyHeight'], (int, float)) or frame['bodyHeight'] <= 0:
                    raise ValueError(f'{identifier}/{clip}: invalid reviewed frame bodyHeight')
        destination = ROOT / 'assets' / 'animation' / f'{identifier}-{clip}.webp'
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary_image = destination.with_suffix('.webp.tmp')
        image.save(temporary_image, 'WEBP', quality=95, method=6, alpha_quality=100, exact=True)
        decoded = Image.open(temporary_image).convert('RGBA')
        if decoded.size != image.size or decoded.getchannel('A').tobytes() != alpha.tobytes():
            raise ValueError(f'{identifier}/{clip}: technical WebP conversion changed alpha or dimensions')
        temporary_image.replace(destination)
        result['clips'][clip] = {'image': f'./{identifier}-{clip}.webp', 'source': f'./source/{identifier}-{clip}.png',
                                'width': image.width, 'height': image.height, 'sourceWidth': data['sourceWidth'], 'sourceHeight': data['sourceHeight'], 'bodyHeight': clip_body_height,
                                'scaleReference': 'reviewed' if 'bodyHeight' in config or 'bodyHeight' in character_config else 'first-frame-crown-to-ground',
                                'views': data['views'], 'sources': data['sources'], 'packing': data['packing'],
                                'detectedRowGroups': data['detectedRowGroups'],
                                'sourceSha256': digest(data['sourceBytes']), 'sourceAlphaSha256': digest(data['sourceAlpha'].tobytes()), 'alphaSha256': digest(alpha.tobytes()), 'repackedAlphaSha256': digest(alpha.tobytes()),
                                'decodedAlphaSha256': digest(decoded.getchannel('A').tobytes()),
                                'webpSha256': digest(destination.read_bytes())}
    return result


def audit_source(path, columns, rows, replaced_indices=()):
    """Inspect one immutable source snapshot without writing runtime assets."""
    result = {'source': path.relative_to(ROOT).as_posix(), 'expectedComponents': columns * rows}
    try:
        raw = path.read_bytes()
        result['sourceSha256'] = digest(raw)
        image = Image.open(io.BytesIO(raw)).convert('RGBA')
        result.update({'width': image.width, 'height': image.height})
        figures = find_figures(image, path.name, columns, rows)
        result['components'] = len(figures)
        result['borderFigures'] = [{'sourceComponentIndex': index, 'visibleRect': figure['visible'],
                                    'replacedByReviewedWholePose': index in replaced_indices,
                                    **({'facing': FACINGS[index // 6], 'frameIndex': index % 6} if columns == 6 and rows == 4 else {})}
                                   for index, figure in enumerate(figures)
                                   if figure['visible'][0] <= 0 or figure['visible'][1] <= 0 or figure['visible'][2] >= image.width or figure['visible'][3] >= image.height]
        result['selectedBorderFigures'] = [figure for figure in result['borderFigures'] if not figure['replacedByReviewedWholePose']]
        alpha = image.getchannel('A').tobytes()
        if sum(value < 16 for value in alpha) / len(alpha) < .15:
            raise ValueError('a real transparent background is required')
    except (ValueError, OSError) as error:
        result['error'] = str(error)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--ids', nargs='+', default=['nova', 'raven', 'valkyrie', 'viper', 'ember', 'atlas', 'seraph', 'lynx', 'tempest', 'onyx'])
    parser.add_argument('--workers', type=int, default=1, help='Independent character packaging processes; output manifest is written only after every process finishes')
    parser.add_argument('--overrides', type=Path, default=Path(__file__).with_name('animation-overrides.json'), help='Reviewed grid/ground/scale metadata; defaults to the checked-in animation-overrides.json')
    parser.add_argument('--allow-partial', action='store_true', help='Package generated clips already present; run is required for each character')
    parser.add_argument('--audit-sources', action='store_true', help='Inspect the current source hashes, complete figure counts and source borders without writing assets')
    args = parser.parse_args()
    overrides = json.loads(args.overrides.read_text()) if args.overrides.exists() else {}
    characters = {}
    if args.workers < 1:
        raise ValueError('--workers must be at least one')
    if len(args.ids) != len(set(args.ids)):
        raise ValueError('--ids must identify distinct characters so workers cannot overwrite each other')
    if args.audit_sources:
        tasks = {}
        for identifier in args.ids:
            for clip in CLIPS:
                path = ROOT / 'assets' / 'animation' / 'source' / f'{identifier}-{clip}.png'
                frame_reviews = config_for(overrides, identifier, clip).get('frames', {})
                replaced_indices = [row * 6 + index for row, facing in enumerate(FACINGS) for index, review in enumerate(frame_reviews.get(facing, [])) if review and 'imagePNG' in review]
                tasks[path] = (6, 4, replaced_indices)
                for reviews in frame_reviews.values():
                    for review in reviews:
                        if review and 'imagePNG' in review:
                            tasks[(ROOT / 'assets' / 'animation' / review['imagePNG']).resolve()] = (review.get('sourceColumns', 3), review.get('sourceRows', 1), ())
        if args.workers == 1:
            results = [audit_source(path, *grid) for path, grid in tasks.items()]
        else:
            with ProcessPoolExecutor(max_workers=min(args.workers, len(tasks))) as pool:
                results = [future.result() for future in [pool.submit(audit_source, path, *grid) for path, grid in tasks.items()]]
        for result in results:
            print(json.dumps(result), flush=True)
        raise SystemExit(1 if any(result.get('error') or result.get('selectedBorderFigures') for result in results) else 0)
    if args.workers == 1:
        for identifier in args.ids:
            packed = pack_character(identifier, overrides, args.allow_partial)
            if packed:
                characters[identifier] = packed
    else:
        with ProcessPoolExecutor(max_workers=min(args.workers, len(args.ids))) as pool:
            futures = {identifier: pool.submit(pack_character, identifier, overrides, args.allow_partial) for identifier in args.ids}
            for identifier, future in futures.items():
                packed = future.result()
                if packed:
                    characters[identifier] = packed
    if not characters:
        raise ValueError('No complete-body PNG inputs were found')
    manifest = {'version': 1, 'sampleRate': 60, 'framesPerClip': FRAME_COUNT, 'style': 'original-2d-whole-body', 'characters': characters}
    destination = ROOT / 'assets' / 'animation' / 'manifest.json'
    temporary_manifest = destination.with_suffix('.json.tmp')
    temporary_manifest.write_text(json.dumps(manifest, indent=2) + '\n')
    temporary_manifest.replace(destination)
    print(json.dumps({'characters': list(characters), 'clips': {identifier: list(meta['clips']) for identifier, meta in characters.items()},
                      'completePoses': sum(len(clip['views']) * FRAME_COUNT for meta in characters.values() for clip in meta['clips'].values()),
                      'manifest': str(destination.relative_to(ROOT))}))


if __name__ == '__main__':
    main()
