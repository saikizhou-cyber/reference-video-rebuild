// Render preview stills of the library's gallery compositions (bundle once, one browser).
//
//   node gallery/previews.mjs [--only id,id] [--category text] [--frames 6] [--scale 0.5] [--out out/previews] [--check] [--no-cache] [--modules dir,dir]
//
// Packages (@remotion/bundler, @remotion/renderer) resolve from the CURRENT directory, so run it from a folder
// whose node_modules has Remotion 4 (e.g. `cd library && npm i`). Writes <out>/<id>/f<frame>.jpg and <out>/index.json.
// --check renders the middle frame twice (PNG, full size, another frame rendered in between) and lists effects whose pixels differ.
// Then: python gallery/sheet.py <out> previews   -> one contact sheet per category.
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
const {bundle} = require('@remotion/bundler');
const {getCompositions, openBrowser, renderStill} = require('@remotion/renderer');

const args = process.argv.slice(2);
const opt = (name, def) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : def;
};
const only = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const category = opt('category', '');
const nFrames = Number(opt('frames', '6'));
const scale = Number(opt('scale', '0.5'));
const out = path.resolve(opt('out', 'out/previews'));
const check = args.includes('--check');
const entry = path.resolve(opt('entry', path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts')));

const chromiumOptions = {gl: 'angle'};
const t0 = Date.now();
const serveUrl = await bundle({
	entryPoint: entry,
	// --no-cache: skip webpack's disk cache (needed when several renders bundle in parallel from one node_modules)
	enableCaching: !args.includes('--no-cache'),
	// the library may sit outside the folder that has node_modules: resolve bare imports from cwd too
	// --modules dir1,dir2 adds more node_modules folders (e.g. extra packages kept outside the project)
	webpackOverride: (c) => ({
		...c,
		resolve: {
			...c.resolve,
			modules: [path.resolve('node_modules'), ...opt('modules', '').split(',').filter(Boolean).map((d) => path.resolve(d)), 'node_modules'],
		},
	}),
});
const browser = await openBrowser('chrome', {chromiumOptions});
const comps = (await getCompositions(serveUrl, {puppeteerInstance: browser, chromiumOptions})).filter(
	(c) => (!only || only.has(c.id)) && (!category || c.defaultProps?.meta?.category === category),
);
console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${comps.length} composition(s)`);

const indexPath = path.join(out, 'index.json');
let index = {};
try {
	index = JSON.parse(readFileSync(indexPath, 'utf8'));
} catch {
	index = {};
}
const nondeterministic = [];
const failed = [];
for (const c of comps) {
	const dir = path.join(out, c.id);
	mkdirSync(dir, {recursive: true});
	const frames = [...new Set(Array.from({length: nFrames}, (_, i) => Math.round(((i + 0.5) / nFrames) * (c.durationInFrames - 1))))];
	const rel = (f) => path.relative(out, f).split(path.sep).join('/');
	const files = [];
	let chk = null;
	try {
		for (const f of frames) {
			const file = path.join(dir, `f${String(f).padStart(4, '0')}.jpg`);
			await renderStill({composition: c, serveUrl, output: file, frame: f, imageFormat: 'jpeg', jpegQuality: 85, scale, puppeteerInstance: browser, chromiumOptions});
			files.push(rel(file));
		}
		if (check) {
			// same frame twice at full size with another frame rendered in between: catches state kept between frames
			// and render-order dependence; PNG so that only real pixel differences count (see gallery/determinism.py)
			const mid = frames[Math.floor(frames.length / 2)];
			const other = frames[0] === mid ? frames[frames.length - 1] : frames[0];
			const shot = async (name, frame) => {
				const file = path.join(dir, name);
				await renderStill({composition: c, serveUrl, output: file, frame, imageFormat: 'png', scale: 1, puppeteerInstance: browser, chromiumOptions});
				return file;
			};
			const a1 = await shot('check_a1.png', mid);
			await shot('check_b.png', other);
			const a2 = await shot('check_a2.png', mid);
			const sha = (f) => createHash('sha1').update(readFileSync(f)).digest('hex');
			if (sha(a1) !== sha(a2)) {
				nondeterministic.push(c.id);
			}
			chk = {frame: mid, a1: rel(a1), a2: rel(a2)};
		}
		index[c.id] = {meta: c.defaultProps?.meta ?? {id: c.id}, durationInFrames: c.durationInFrames, frames, files, check: chk};
		console.log(`ok   ${c.id} (${frames.length} frames)`);
	} catch (e) {
		failed.push(c.id);
		console.log(`FAIL ${c.id}: ${String(e?.message ?? e).split('\n')[0]}`);
	}
}
await browser.close({silent: true});
mkdirSync(out, {recursive: true});
writeFileSync(indexPath, JSON.stringify(index, null, 1));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${indexPath}`);
if (check) {
	console.log(
		nondeterministic.length
			? `PIXELS DIFFER between two renders of the same frame (quantify: python gallery/determinism.py ${out}): ${nondeterministic.join(', ')}`
			: 'determinism: all identical',
	);
}
if (failed.length) {
	console.log(`FAILED: ${failed.join(', ')}`);
	process.exitCode = 1;
}
