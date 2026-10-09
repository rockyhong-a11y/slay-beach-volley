import { mkdir, cp, copyFile, rm } from 'node:fs/promises';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { build, transform } from 'esbuild';
import { ROSTER } from './src/roster.js';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'manifest.webmanifest', 'sw.js', 'favicon.svg']) await copyFile(file, `dist/${file}`);
await cp('src', 'dist/src', { recursive: true, filter: source => !source.endsWith('/character-motion.js') && !source.endsWith('/voxel-character.js') && !source.endsWith('/voxel-math.js') && !source.endsWith('/voxel-motion.js') });
const playerIds = new Set(ROSTER.map(character => character.id));
function productionAsset(source) {
  if (source === 'assets') return true;
  const [group, file] = source.replace(/^assets\//, '').split('/');
  if (['sprites', 'portraits'].includes(group)) return !file || playerIds.has(file.replace(/\.webp$/, ''));
  return ['audio', 'courts', 'fonts', 'icons', 'licenses', 'animation'].includes(group)
    && !source.includes('/animation/source') && !source.endsWith('.png') && !source.endsWith('DoHyeon-Regular.ttf');
}
await cp('assets', 'dist/assets', { recursive: true, filter: productionAsset });
const referenceSprites = JSON.parse(await readFile('src/sprites.json', 'utf8'));
await writeFile('dist/src/sprites.json', JSON.stringify(Object.fromEntries([...playerIds].map(id => [id, referenceSprites[id]]))));
await copyFile('LICENSE', 'dist/LICENSE');
await build({ entryPoints: ['src/app.js'], outfile: 'dist/src/app.js', bundle: true, minify: true, format: 'esm', target: 'es2022' });
const css = await transform(await readFile('style.css', 'utf8'), { loader: 'css', minify: true });
await writeFile('dist/style.css', css.code);
async function assetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory() ? assetFiles(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]));
  return groups.flat();
}
const assets = (await assetFiles('dist/assets')).filter(file => /\.(webp|svg|woff2|ttf|wav|ogg|mp3|json)$/.test(file)).map(file => file.replace(/^dist\//, './'));
const sourceModules = (await assetFiles('dist/src')).map(file => file.replace(/^dist\//, './'));
const worker = (await readFile('sw.js', 'utf8'))
  .replace('const ASSETS = [];', `const ASSETS = ${JSON.stringify(assets)};`)
  .replace(/const SHELL = \[.*?\];/, value => {
    const shell = JSON.parse(value.slice('const SHELL = '.length, -1).replaceAll("'", '"'));
    return `const SHELL = ${JSON.stringify([...shell.filter(file => !file.startsWith('./src/')), ...sourceModules])};`;
  });
await writeFile('dist/sw.js', worker);
console.log('Built the complete offline-capable game in dist/.');
