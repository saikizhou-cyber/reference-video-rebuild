// Ported from Remocn glitch-cut (https://github.com/Remocn/remocn/blob/main/registry/remocn/glitch-cut/index.tsx), MIT, Copyright (c) 2026 Remocn ('light' preset), and from gl-transitions StripDatamoshGlitch.glsl by bread (https://github.com/gl-transitions/gl-transitions/blob/master/transitions/StripDatamoshGlitch.glsl), MIT, Copyright (c) 2017-present gl-transitions contributors ('heavy' preset). Changes: both fragment shaders re-targeted to the gl-transitions convention (makeGlTransition), tick count exposed as a parameter, one factory with two presets, no CSS fallback.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import type {LibraryEntry} from '../../core/types';
import {makeTransitionDemo} from './_gl-utils';

export type GlitchCutProps = {
	/** 'light' = short digital tear (~12 frames); 'heavy' = broadcast-corruption burst (~30 frames) */
	preset?: 'light' | 'heavy';
	/** overall strength of the tear, both presets (light: 1 = default tear width, heavy: scales the whole burst) */
	intensity?: number;
	/** how many times the pattern is re-rolled across the transition (~1 per frame: set it to the transition length). light 22, heavy 30 */
	steps?: number;
	/** light: number of horizontal slices */
	slices?: number;
	/** light: red/blue channel split (1 = default, ~1.5% of the width at peak) */
	rgbSplit?: number;
	/** light: share of 16-column blocks that are corrupted */
	blockNoise?: number;
	/** heavy: number of horizontal tear bars */
	horizontalBars?: number;
	/** heavy: number of thin vertical slits */
	verticalSlits?: number;
	/** heavy: sideways tear distance (share of width) */
	tear?: number;
	/** heavy: base RGB split (share of width, up to 2.7x inside the bars) */
	chroma?: number;
	/** heavy: how much the bars flash the other clip */
	residue?: number;
	/** heavy: grain amount */
	noiseAmount?: number;
	/** heavy: scanline darkening */
	scanAmount?: number;
	/** heavy: strobe flash brightness */
	flashAmount?: number;
};

// ---- light: a 12-frame hard cut disguised as a digital tear (Remocn) ----
const LIGHT_BODY = `
uniform float intensity;
uniform float steps;
uniform float slices;
uniform float rgbSplit;
uniform float blockNoise;

const float PI = 3.141592653589793;
const float BLOCK_COLUMNS = 16.0;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec4 splitFrom(vec2 uv, float split) {
	vec4 c = getFromColor(uv);
	return vec4(getFromColor(vec2(uv.x + split, uv.y)).r, c.g, getFromColor(vec2(uv.x - split, uv.y)).b, c.a);
}
vec4 splitTo(vec2 uv, float split) {
	vec4 c = getToColor(uv);
	return vec4(getToColor(vec2(uv.x + split, uv.y)).r, c.g, getToColor(vec2(uv.x - split, uv.y)).b, c.a);
}

vec4 transition(vec2 v_uv) {
	float energy = pow(max(sin(progress * PI), 0.0), 0.7);
	float clock = floor(progress * steps);

	float row = floor(v_uv.y * slices);
	float torn = step(0.45, hash(vec2(row, clock)));
	float amount = hash(vec2(row + 17.0, clock * 1.7 + 3.0)) - 0.5;
	float sliceShift = amount * 0.3 * intensity * energy * torn;

	vec2 block = vec2(floor(v_uv.x * BLOCK_COLUMNS), row);
	float corrupt = step(1.0 - blockNoise * 0.5 * energy, hash(block + clock * 7.3));
	float blockShift = (hash(block + clock * 3.1 + 5.0) - 0.5) * 0.2 * intensity * corrupt;

	vec2 uv = vec2(fract(v_uv.x + sliceShift + blockShift), v_uv.y);
	float split = rgbSplit * 0.018 * energy * (0.35 + abs(amount));

	// every slice hands over A -> B at its own moment, so the cut is torn rather than simultaneous
	float cut = 0.5 + (hash(vec2(row, 91.0)) - 0.5) * 0.32;
	float handed = step(cut, progress);

	vec4 from = splitFrom(uv, split);
	vec4 to = splitTo(uv, split);
	vec4 color = mix(from, to, handed);
	vec4 leaked = mix(to, from, handed);

	float leak = corrupt * step(0.55, hash(block + clock * 11.0 + 13.0));
	color = mix(color, leaked, leak * 0.8);

	color.rgb += vec3(0.05, 0.015, 0.09) * energy * torn * hash(vec2(row, clock + 41.0)) * color.a;
	return color;
}`;

// ---- heavy: strip datamosh burst (gl-transitions StripDatamoshGlitch, bread) ----
const HEAVY_BODY = `
uniform float intensity;
uniform float steps;
uniform float horizontalBars;
uniform float verticalSlits;
uniform float tear;
uniform float chroma;
uniform float residue;
uniform float noiseAmount;
uniform float scanAmount;
uniform float flashAmount;

const float PI = 3.141592653589793;

float hash(float n) {
	return fract(sin(n) * 43758.5453123);
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float sat(float v) {
	return clamp(v, 0.0, 1.0);
}

float burst() {
	return pow(max(0.0, sin(progress * PI)), 0.42) * intensity;
}

vec2 safeUv(vec2 uv) {
	return clamp(uv, vec2(0.0), vec2(1.0));
}

float stripeY(vec2 uv, float density, float seed, float minWidth, float maxWidth) {
	float y = uv.y * density + seed * 0.137;
	float id = floor(y);
	float f = fract(y);
	float c = hash(vec2(id, seed));
	float w = mix(minWidth, maxWidth, hash(vec2(id + 9.17, seed + 2.31)));
	return 1.0 - smoothstep(w, w + 0.018, abs(f - c));
}

float stripeX(vec2 uv, float density, float seed, float minWidth, float maxWidth) {
	float x = uv.x * density + seed * 0.091;
	float id = floor(x);
	float f = fract(x);
	float c = hash(vec2(id, seed + 41.0));
	float w = mix(minWidth, maxWidth, hash(vec2(id + 4.7, seed + 8.9)));
	return 1.0 - smoothstep(w, w + 0.012, abs(f - c));
}

float brokenGate(vec2 uv, float row, float rnd, float frame) {
	float segs = mix(1.0, 9.0, hash(vec2(row, frame + 44.0)));
	float seg = floor(uv.x * segs);
	return step(0.16, hash(vec2(seg, row + frame * 3.0 + rnd)));
}

float horizontalMask(vec2 uv, float frame) {
	float r1 = floor((uv.y + hash(frame) * 0.031) * horizontalBars * 0.38);
	float r2 = floor((uv.y + hash(frame + 2.0) * 0.013) * horizontalBars);
	float r3 = floor((uv.y + hash(frame + 7.0) * 0.006) * horizontalBars * 3.4);

	float thick = stripeY(uv, horizontalBars * 0.38, frame + 1.0, 0.035, 0.22);
	float mid   = stripeY(uv, horizontalBars,        frame + 4.0, 0.014, 0.11);
	float hair  = stripeY(uv, horizontalBars * 3.4,  frame + 9.0, 0.004, 0.035);

	thick *= step(0.42, hash(vec2(r1, frame + 10.0)));
	mid   *= step(0.48, hash(vec2(r2, frame + 20.0)));
	hair  *= step(0.62, hash(vec2(r3, frame + 30.0)));

	thick *= brokenGate(uv, r1, hash(vec2(r1, frame)), frame);
	mid   *= brokenGate(uv, r2, hash(vec2(r2, frame)), frame + 3.0);

	return sat(max(thick, max(mid, hair)));
}

float verticalMask(vec2 uv, float frame) {
	float col = floor((uv.x + hash(frame + 12.0) * 0.017) * verticalSlits);
	float slit = stripeX(uv, verticalSlits, frame + 13.0, 0.01, 0.075);
	slit *= step(0.66, hash(vec2(col, frame + 19.0)));
	return sat(slit);
}

vec4 chromaFrom(vec2 uv, vec2 s) {
	uv = safeUv(uv);
	return vec4(getFromColor(safeUv(uv + s)).r, getFromColor(uv).g, getFromColor(safeUv(uv - s)).b, 1.0);
}

vec4 chromaTo(vec2 uv, vec2 s) {
	uv = safeUv(uv);
	return vec4(getToColor(safeUv(uv - s)).r, getToColor(uv).g, getToColor(safeUv(uv + s)).b, 1.0);
}

vec2 distortUv(vec2 uv, float dir, float b, float h, float v, float frame) {
	float row = floor(uv.y * horizontalBars);
	float col = floor(uv.x * verticalSlits);

	float rowRnd = hash(vec2(row, frame));
	float colRnd = hash(vec2(col, frame + 27.0));

	float xTear = (rowRnd - 0.5) * 2.0 * tear * b * h;
	xTear += sin(uv.y * 120.0 + progress * 95.0) * 0.006 * b;

	float yDrag = (colRnd - 0.5) * 0.13 * b * v;
	float micro = (hash(vec2(row, col + frame)) - 0.5) * 0.018 * b * max(h, v);

	return uv + vec2(xTear * dir + micro, yDrag);
}

vec4 transition(vec2 uv) {
	if (progress <= 0.0) return getFromColor(uv);
	if (progress >= 1.0) return getToColor(uv);

	float b = burst();
	float frame = floor(progress * steps);

	float h = horizontalMask(uv, frame);
	float v = verticalMask(uv, frame);
	float glitch = sat(max(h, v * 0.75));

	float row = floor(uv.y * horizontalBars);
	float rowRnd = hash(vec2(row, frame + 5.0));

	float bandDelay = (rowRnd - 0.5) * 0.30 * h;
	float reveal = smoothstep(0.18, 0.84, progress + bandDelay);

	vec2 split = vec2(chroma * b * (1.0 + 1.7 * glitch), chroma * 0.22 * b * v);

	vec2 fromUv = distortUv(uv,  1.0, b, h, v, frame);
	vec2 toUv   = distortUv(uv, -1.0, b, h, v, frame);

	vec4 color = mix(chromaFrom(fromUv, split), chromaTo(toUv, split), reveal);

	// horizontal time-slice residue: old/new frames dragged through uneven scan bands
	vec2 smearUv = uv;
	smearUv.x += (rowRnd - 0.5) * 0.46 * b * h;
	smearUv.y += (hash(vec2(row, frame + 31.0)) - 0.5) * 0.045 * b * h;

	float sliceReveal = smoothstep(0.28, 0.78, progress + (rowRnd - 0.5) * 0.22);
	vec4 sliceColor = mix(
		chromaFrom(smearUv, split * 1.65),
		chromaTo(smearUv - vec2((rowRnd - 0.5) * 0.18 * b, 0.0), split * 1.65),
		sliceReveal
	);

	color = mix(color, sliceColor, h * b * residue);

	// thin scan sparks and broken white lines
	float hairLine = stripeY(uv, 190.0, frame + 55.0, 0.002, 0.012);
	hairLine *= step(0.70, hash(vec2(floor(uv.y * 190.0), frame + 56.0)));
	color.rgb += vec3(0.72, 0.90, 1.0) * hairLine * b * 0.28;

	float scan = 0.5 + 0.5 * sin(uv.y * 980.0 + progress * 130.0);
	color.rgb *= 1.0 - scanAmount * b * scan;

	vec2 nCell = floor(uv * vec2(360.0 * ratio, 210.0));
	float n = hash(nCell + vec2(frame * 7.0, frame * 13.0));
	color.rgb += (n - 0.5) * noiseAmount * b * (0.55 + glitch);

	// slight desaturation at the damage peak: more broadcast-signal than clean digital
	float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
	color.rgb = mix(color.rgb, vec3(luma), 0.18 * b * glitch);

	float strobe = step(0.78, hash(vec2(frame, 3.14))) * pow(b, 1.65);
	color.rgb += vec3(strobe * flashAmount);

	return vec4(clamp(color.rgb, vec3(0.0), vec3(1.0)), 1.0);
}`;

const makeLight = makeGlTransition(LIGHT_BODY, {intensity: 1, steps: 22, slices: 24, rgbSplit: 1, blockNoise: 0.6});
const makeHeavy = makeGlTransition(HEAVY_BODY, {
	intensity: 1,
	steps: 30,
	horizontalBars: 42,
	verticalSlits: 18,
	tear: 0.18,
	chroma: 0.032,
	residue: 0.62,
	noiseAmount: 0.16,
	scanAmount: 0.13,
	flashAmount: 0.2,
});

/**
 * Digital tear cut. 'light' (default): horizontal slices shift, R/B split, block leaks, each slice swaps A -> B at its own moment;
 * works at 8-14 frames. 'heavy': datamosh burst with bars, slits, scanlines, grain and a strobe; works at 24-36 frames.
 * Pass `steps` = the transition's durationInFrames for one new glitch pattern per frame.
 * Needs the HTML-in-canvas render path (Remotion 4.0.5xx with a recent Chrome); there is no CSS fallback.
 */
export const glitchCut = (props: GlitchCutProps = {}) => {
	const {preset = 'light', ...rest} = props;
	return preset === 'heavy' ? makeHeavy(rest) : makeLight(rest);
};

const Demo = makeTransitionDemo(
	[
		{presentation: glitchCut({preset: 'light', steps: 14}), durationInFrames: 14, timing: linearTiming({durationInFrames: 14}), hold: 10},
		{presentation: glitchCut({preset: 'heavy', steps: 30}), durationInFrames: 30, timing: linearTiming({durationInFrames: 30})},
	],
	8,
	8,
);

export const glitchCutEntry: LibraryEntry = {
	meta: {
		id: 'glitch-cut',
		title: 'Glitch cut',
		category: 'transitions',
		looks: 'The frame tears into horizontal slices with RGB split and block leaks and hard-swaps scenes inside the mess: a 14-frame light tear, then a 30-frame heavy datamosh burst with scanlines and strobe.',
		use: 'Cyber / sci-fi / corrupted-signal beats, a boss reveal, an "interference" cut on a drum hit. Use light for a snap, heavy for a full-second set piece.',
		exportName: 'glitchCut',
		durationInFrames: 70,
		source: {
			kind: 'ported',
			name: 'Remocn glitch-cut + gl-transitions StripDatamoshGlitch (bread)',
			url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/glitch-cut/index.tsx',
			license: 'MIT',
		},
	},
	Demo,
};
