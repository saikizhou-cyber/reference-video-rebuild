/**
 * Helpers of the fx/codrops group. Plain TypeScript with no imports, so a scratch script can load it too.
 *
 * Procedural glyph set for ascii-glyph: every character is a handful of signed-distance primitives (capsules, rings, discs,
 * boxes) in a cell that is `ASPECT` wide and 1 tall. The same description feeds both sides of the effect:
 *   - the GLSL that draws a glyph (glyphSd, a switch generated from the list), resolution independent, no font involved;
 *   - the table of shape vectors (how much ink each glyph puts under six sample points) that the nearest-shape search
 *     compares a cell against, computed here from the SAME primitives, so what is picked is what is drawn.
 * Renders therefore do not depend on any font installed on the machine.
 */

/** cell width / cell height */
export const GLYPH_ASPECT = 0.5;
/** nominal stroke thickness in cell heights (the shader widens it for small cells and by the `weight` prop) */
export const STROKE = 0.1;

type P = readonly [number, number];
/** primitives live in the unit square of the cell: u to the right, v DOWN, both 0..1 */
type Prim =
	| {k: 'seg'; a: P; b: P; t?: number}
	| {k: 'ring'; c: P; r: number; t?: number}
	| {k: 'disc'; c: P; r: number}
	| {k: 'box'; c: P; hw: number; hh: number};

export type Glyph = {name: string; prims: readonly Prim[]};

const seg = (a: P, b: P, t = 1): Prim => ({k: 'seg', a, b, t});
const ring = (c: P, r: number, t = 1): Prim => ({k: 'ring', c, r, t});
const disc = (c: P, r: number): Prim => ({k: 'disc', c, r});
const box = (c: P, hw: number, hh: number): Prim => ({k: 'box', c, hw, hh});

/** 34 characters: a tone ramp (. : - = + * o # @ block) and directional strokes for edges (| / \ _ ^ v [ ] < > ...) */
export const GLYPHS: readonly Glyph[] = [
	{name: 'space', prims: []},
	{name: '.', prims: [disc([0.5, 0.82], 0.07)]},
	{name: "'", prims: [seg([0.5, 0.12], [0.5, 0.3])]},
	{name: ':', prims: [disc([0.5, 0.34], 0.065), disc([0.5, 0.74], 0.065)]},
	{name: '-', prims: [seg([0.22, 0.52], [0.78, 0.52])]},
	{name: '_', prims: [seg([0.16, 0.9], [0.84, 0.9])]},
	{name: 'overline', prims: [seg([0.16, 0.1], [0.84, 0.1])]},
	{name: '=', prims: [seg([0.2, 0.4], [0.8, 0.4]), seg([0.2, 0.64], [0.8, 0.64])]},
	{name: '+', prims: [seg([0.2, 0.5], [0.8, 0.5]), seg([0.5, 0.28], [0.5, 0.72])]},
	{name: '*', prims: [seg([0.5, 0.3], [0.5, 0.7]), seg([0.3, 0.38], [0.7, 0.62]), seg([0.3, 0.62], [0.7, 0.38])]},
	{name: '|', prims: [seg([0.5, 0.06], [0.5, 0.94])]},
	{name: '/', prims: [seg([0.8, 0.08], [0.2, 0.92])]},
	{name: '\\', prims: [seg([0.2, 0.08], [0.8, 0.92])]},
	{name: 'X', prims: [seg([0.2, 0.14], [0.8, 0.86]), seg([0.8, 0.14], [0.2, 0.86])]},
	{name: 'o', prims: [ring([0.5, 0.58], 0.15)]},
	{name: 'O', prims: [ring([0.5, 0.5], 0.19)]},
	{name: '#', prims: [seg([0.36, 0.1], [0.36, 0.9]), seg([0.64, 0.1], [0.64, 0.9]), seg([0.12, 0.36], [0.88, 0.36]), seg([0.12, 0.64], [0.88, 0.64])]},
	{name: '@', prims: [ring([0.5, 0.5], 0.19), disc([0.5, 0.5], 0.085)]},
	{name: 'block', prims: [box([0.5, 0.5], 0.215, 0.42)]},
	{name: 'dot-box', prims: [box([0.5, 0.52], 0.1, 0.12)]},
	{name: '[', prims: [seg([0.36, 0.12], [0.36, 0.88]), seg([0.36, 0.12], [0.72, 0.12]), seg([0.36, 0.88], [0.72, 0.88])]},
	{name: ']', prims: [seg([0.64, 0.12], [0.64, 0.88]), seg([0.64, 0.12], [0.28, 0.12]), seg([0.64, 0.88], [0.28, 0.88])]},
	{name: '^', prims: [seg([0.2, 0.46], [0.5, 0.14]), seg([0.5, 0.14], [0.8, 0.46])]},
	{name: 'v', prims: [seg([0.2, 0.54], [0.5, 0.86]), seg([0.5, 0.86], [0.8, 0.54])]},
	{name: '<', prims: [seg([0.72, 0.24], [0.28, 0.5]), seg([0.28, 0.5], [0.72, 0.76])]},
	{name: '>', prims: [seg([0.28, 0.24], [0.72, 0.5]), seg([0.72, 0.5], [0.28, 0.76])]},
	{name: 'triple-bar', prims: [seg([0.2, 0.24], [0.8, 0.24]), seg([0.2, 0.5], [0.8, 0.5]), seg([0.2, 0.76], [0.8, 0.76])]},
	{name: '8', prims: [ring([0.5, 0.3], 0.11), ring([0.5, 0.7], 0.13)]},
	{name: 'H', prims: [seg([0.26, 0.1], [0.26, 0.9]), seg([0.74, 0.1], [0.74, 0.9]), seg([0.26, 0.5], [0.74, 0.5])]},
	{name: 'M', prims: [seg([0.2, 0.9], [0.2, 0.1]), seg([0.2, 0.1], [0.5, 0.55]), seg([0.5, 0.55], [0.8, 0.1]), seg([0.8, 0.1], [0.8, 0.9])]},
	{name: 'E', prims: [seg([0.3, 0.1], [0.3, 0.9]), seg([0.3, 0.1], [0.78, 0.1]), seg([0.3, 0.5], [0.7, 0.5]), seg([0.3, 0.9], [0.78, 0.9])]},
	{name: 'T', prims: [seg([0.18, 0.14], [0.82, 0.14]), seg([0.5, 0.14], [0.5, 0.88])]},
	{name: 'L', prims: [seg([0.3, 0.1], [0.3, 0.9]), seg([0.3, 0.9], [0.8, 0.9])]},
];

/** the six points of a cell where tone is read (u, v from the top-left; two staggered columns), as in the original shape search */
export const SAMPLE_POINTS: readonly P[] = [
	[0.28, 0.26],
	[0.72, 0.14],
	[0.28, 0.56],
	[0.72, 0.44],
	[0.28, 0.86],
	[0.72, 0.74],
];
/** the ten points around them that only feed the edge bias */
export const OUTER_POINTS: readonly P[] = [
	[0.28, -0.2],
	[0.72, -0.2],
	[-0.22, 0.25],
	[1.22, 0.25],
	[-0.22, 0.5],
	[1.22, 0.5],
	[-0.22, 0.75],
	[1.22, 0.75],
	[0.28, 1.2],
	[0.72, 1.2],
];
/** radius (cell heights) of the disc each sample point averages over */
export const SAMPLE_RADIUS = 0.161;

const toMetric = (p: P): P => [(p[0] - 0.5) * GLYPH_ASPECT, p[1] - 0.5];

const sdSegJs = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
	const pax = px - ax;
	const pay = py - ay;
	const bax = bx - ax;
	const bay = by - ay;
	const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
	return Math.hypot(pax - bax * h, pay - bay * h);
};

/** signed distance (cell heights, negative inside) from metric point (x, y) to a glyph drawn with stroke thickness `t` and dot scale `w` */
export const glyphSdJs = (g: Glyph, x: number, y: number, t = STROKE, w = 1): number => {
	let d = 1e3;
	for (const prim of g.prims) {
		let s: number;
		if (prim.k === 'seg') {
			const a = toMetric(prim.a);
			const b = toMetric(prim.b);
			s = sdSegJs(x, y, a[0], a[1], b[0], b[1]) - t * 0.5 * (prim.t ?? 1);
		} else if (prim.k === 'ring') {
			const c = toMetric(prim.c);
			s = Math.abs(Math.hypot(x - c[0], y - c[1]) - prim.r) - t * 0.5 * (prim.t ?? 1);
		} else if (prim.k === 'disc') {
			const c = toMetric(prim.c);
			s = Math.hypot(x - c[0], y - c[1]) - Math.max(prim.r * w, t * 0.5);
		} else {
			const c = toMetric(prim.c);
			const qx = Math.abs(x - c[0]) - prim.hw;
			const qy = Math.abs(y - c[1]) - prim.hh;
			s = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
		}
		d = Math.min(d, s);
	}
	return d;
};

const f5 = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : n.toFixed(5));
const v2 = (p: P): string => {
	const m = toMetric(p);
	return `vec2(${f5(m[0])}, ${f5(m[1])})`;
};

const primGlsl = (prim: Prim): string => {
	if (prim.k === 'seg') {
		return `sdSeg(p, ${v2(prim.a)}, ${v2(prim.b)}) - T * ${f5(0.5 * (prim.t ?? 1))}`;
	}
	if (prim.k === 'ring') {
		return `abs(length(p - ${v2(prim.c)}) - ${f5(prim.r)}) - T * ${f5(0.5 * (prim.t ?? 1))}`;
	}
	if (prim.k === 'disc') {
		return `length(p - ${v2(prim.c)}) - max(${f5(prim.r)} * W, T * 0.5)`;
	}
	return `sdBox(p - ${v2(prim.c)}, vec2(${f5(prim.hw)}, ${f5(prim.hh)}))`;
};

/** coverage 0..1 of a glyph averaged over a disc: centre, 6 points at half radius, 12 at full radius */
const discCoverage = (g: Glyph, cx: number, cy: number, r: number): number => {
	let sum = 0;
	let n = 0;
	const tap = (x: number, y: number) => {
		const sd = glyphSdJs(g, x, y);
		sum += Math.min(1, Math.max(0, 0.5 - sd / 0.03));
		n++;
	};
	tap(cx, cy);
	for (let k = 0; k < 6; k++) {
		const a = (k / 6) * Math.PI * 2;
		tap(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5);
	}
	for (let k = 0; k < 12; k++) {
		const a = ((k + 0.5) / 12) * Math.PI * 2;
		tap(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
	}
	return sum / n;
};

/** per glyph, the share of ink under each sample point, divided per point by the largest value any glyph has there (so a flat tone spreads over the whole set) */
export const glyphShapeTable = (): number[][] => {
	const raw = GLYPHS.map((g) =>
		SAMPLE_POINTS.map((sp) => {
			const m = toMetric(sp);
			return discCoverage(g, m[0], m[1], SAMPLE_RADIUS);
		}),
	);
	const peak = SAMPLE_POINTS.map((_, i) => Math.max(1e-6, ...raw.map((row) => row[i])));
	return raw.map((row) => row.map((v, i) => v / peak[i]));
};

/** GLSL: sdSeg, sdBox, glyphSd(int g, vec2 p, float T, float W) and the SHAPES table (GLYPH_COUNT * 6 floats) */
export const glyphGlsl = (): string => {
	const table = glyphShapeTable()
		.flat()
		.map((v) => v.toFixed(4))
		.join(', ');
	const cases = GLYPHS.map((g, i) => {
		const expr = g.prims.length === 0 ? '1000.0' : g.prims.map(primGlsl).reduce((acc, e) => `min(${acc}, ${e})`);
		return `\t\tcase ${i}: return ${expr};`;
	}).join('\n');
	return `
const int GLYPH_COUNT = ${GLYPHS.length};
const float SHAPES[${GLYPHS.length * 6}] = float[${GLYPHS.length * 6}](${table});
float sdSeg(vec2 p, vec2 a, vec2 b) {
	vec2 pa = p - a;
	vec2 ba = b - a;
	float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
	return length(pa - ba * h);
}
float sdBox(vec2 p, vec2 b) {
	vec2 q = abs(p) - b;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
// signed distance in cell heights to glyph g at p (x: -0.25..0.25 across the cell, y: -0.5 top .. 0.5 bottom); T = stroke, W = dot scale
float glyphSd(int g, vec2 p, float T, float W) {
	switch (g) {
${cases}
	}
	return 1000.0;
}
`;
};
