/**
 * Helpers of the text/codrops group. Plain TypeScript with no imports, so a scratch script can load it too.
 *
 * A frame-pure integer hash (lowbias32 by Chris Wellons, public domain) and a 3-octave value-noise "dissolve field" that exists
 * twice with identical maths: in TypeScript (to decide where dust is born) and in GLSL (to dissolve the glyphs), so the dust
 * leaves exactly the spots where the letters are vanishing.
 */

/** 32-bit avalanche hash of an unsigned integer (no sin(): same result on every machine). */
export const hashU = (x: number): number => {
	let h = x >>> 0;
	h = (h ^ (h >>> 16)) >>> 0;
	h = Math.imul(h, 0x7feb352d) >>> 0;
	h = (h ^ (h >>> 15)) >>> 0;
	h = Math.imul(h, 0x846ca68b) >>> 0;
	h = (h ^ (h >>> 16)) >>> 0;
	return h;
};

export const hash3 = (a: number, b: number, c: number): number =>
	hashU((hashU((hashU(a >>> 0) + (b >>> 0)) >>> 0) + (c >>> 0)) >>> 0);

/** seeded float in [0, 1) from up to three integers */
export const rnd = (a: number, b = 0, c = 0): number => (hash3(a, b, c) >>> 8) / 16777216;

const smooth = (t: number): number => t * t * (3 - 2 * t);

const valueNoise = (x: number, y: number, seed: number): number => {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = smooth(x - ix);
	const fy = smooth(y - iy);
	const a = rnd(ix, iy, seed);
	const b = rnd(ix + 1, iy, seed);
	const c = rnd(ix, iy + 1, seed);
	const d = rnd(ix + 1, iy + 1, seed);
	return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
};

/** the raw 3-octave value noise (lacunarity 2, gain 0.5) divided by its total amplitude, ~0.15..0.85 */
export const dissolveRaw = (x: number, y: number, seed: number): number =>
	(valueNoise(x, y, seed) + 0.5 * valueNoise(x * 2 + 17.3, y * 2 + 9.1, seed + 1) + 0.25 * valueNoise(x * 4 + 31.7, y * 4 + 23.9, seed + 2)) / 1.75;

/** the fbm is stretched from [NOISE_LO, NOISE_HI] (about its 3rd to 97th percentile) onto 0..1 so a dissolve ramp 0 -> 1 removes glyph area at an even pace */
export const NOISE_LO = 0.24;
export const NOISE_HI = 0.76;

/**
 * Dissolve time of a point: 0 = vanishes first, 1 = vanishes last. (px, py) are measured from the top-left in px at 720p,
 * `feature` is the size of the coarsest blobs in the same unit.
 */
export const dissolveField = (px: number, py: number, feature: number, seed: number): number => {
	const n = dissolveRaw(px / feature + 64, py / feature + 64, seed);
	return Math.min(1, Math.max(0, (n - NOISE_LO) / (NOISE_HI - NOISE_LO)));
};

/** GLSL twin of dissolveField: `float dissolveField(vec2 p720, float feature, uint seed)`; declares `precision highp int` */
export const DISSOLVE_GLSL = `
precision highp int;
uint hu(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float lat(vec2 i, uint s) { return float(hu(hu(hu(uint(i.x)) + uint(i.y)) + s) >> 8u) * (1.0 / 16777216.0); }
float vnoise(vec2 p, uint s) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = lat(i, s);
	float b = lat(i + vec2(1.0, 0.0), s);
	float c = lat(i + vec2(0.0, 1.0), s);
	float d = lat(i + vec2(1.0, 1.0), s);
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float dissolveField(vec2 p720, float feature, uint seed) {
	vec2 p = p720 / feature + 64.0;
	float n = (vnoise(p, seed) + 0.5 * vnoise(p * 2.0 + vec2(17.3, 9.1), seed + 1u) + 0.25 * vnoise(p * 4.0 + vec2(31.7, 23.9), seed + 2u)) / 1.75;
	return clamp((n - ${NOISE_LO.toFixed(4)}) / ${(NOISE_HI - NOISE_LO).toFixed(4)}, 0.0, 1.0);
}
`;
