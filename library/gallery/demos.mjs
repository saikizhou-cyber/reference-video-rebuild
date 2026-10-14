// Render each gallery demo to a small silent mp4 (for a showcase page, README GIFs or a pull request).
//
//   node gallery/demos.mjs [--only id,id] [--category text] [--scale 0.5] [--crf 26] [--out out/demos] [--entry gallery/index.ts] [--no-cache] [--modules dir,dir]
//
// Same set-up as gallery/previews.mjs: Remotion's packages resolve from the CURRENT directory, so run it from a folder whose
// node_modules has Remotion 4 (e.g. `cd library && npm i`). Writes <out>/<id>.mp4 (h264, yuv420p, no audio) and skips the files
// that exist already, so an interrupted run can be repeated.
import {existsSync, mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(path.join(process.cwd(), 'noop.js'));
const {bundle} = require('@remotion/bundler');
const {getCompositions, openBrowser, renderMedia} = require('@remotion/renderer');

const args = process.argv.slice(2);
const opt = (name, def) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : def;
};
const only = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
const category = opt('category', '');
const scale = Number(opt('scale', '0.5'));
const crf = Number(opt('crf', '26'));
const out = path.resolve(opt('out', 'out/demos'));
const entry = path.resolve(opt('entry', path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts')));

const chromiumOptions = {gl: 'angle'};
const t0 = Date.now();
const serveUrl = await bundle({
	entryPoint: entry,
	enableCaching: !args.includes('--no-cache'),
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
mkdirSync(out, {recursive: true});
const failed = [];
for (const c of comps) {
	const file = path.join(out, `${c.id}.mp4`);
	if (existsSync(file)) {
		console.log(`skip ${c.id} (exists)`);
		continue;
	}
	try {
		await renderMedia({
			composition: c,
			serveUrl,
			codec: 'h264',
			outputLocation: file,
			scale,
			crf,
			pixelFormat: 'yuv420p',
			imageFormat: 'png',
			colorSpace: 'bt709',
			muted: true,
			puppeteerInstance: browser,
			chromiumOptions,
		});
		console.log(`ok   ${c.id} (${c.durationInFrames} frames)`);
	} catch (e) {
		failed.push(c.id);
		console.log(`FAIL ${c.id}: ${String(e?.message ?? e).split('\n')[0]}`);
	}
}
await browser.close({silent: true});
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${out}`);
if (failed.length) {
	console.log(`FAILED: ${failed.join(', ')}`);
	process.exitCode = 1;
}
