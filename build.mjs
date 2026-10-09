import { mkdir, cp, copyFile, rm } from 'node:fs/promises';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { build, transform } from 'esbuild';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'manifest.webmanifest', 'sw.js', 'favicon.svg']) await copyFile(file, `dist/${file}`);
await cp('src', 'dist/src', { recursive: true });
await cp('assets', 'dist/assets', { recursive: true, filter: source => !source.includes('/motions/source') && !source.endsWith('.png') && !source.endsWith('DoHyeon-Regular.ttf') });
await copyFile('LICENSE', 'dist/LICENSE');
await build({ entryPoints: ['src/app.js'], outfile: 'dist/src/app.js', bundle: true, minify: true, format: 'esm', target: 'es2022' });
const css = await transform(await readFile('style.css', 'utf8'), { loader: 'css', minify: true });
await writeFile('dist/style.css', css.code);
async function assetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory() ? assetFiles(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]));
  return groups.flat();
}
const assets = (await assetFiles('dist/assets')).filter(file => /\.(webp|svg|woff2|ttf|wav|ogg|mp3)$/.test(file)).map(file => file.replace(/^dist\//, './'));
const worker = (await readFile('sw.js', 'utf8')).replace('const ASSETS = [];', `const ASSETS = ${JSON.stringify(assets)};`);
await writeFile('dist/sw.js', worker);
console.log('Built the complete offline-capable game in dist/.');
