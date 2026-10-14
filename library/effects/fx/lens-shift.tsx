// Ported from mouse-following-square-lens-effect (https://github.com/tomoyukinakata/mouse-following-square-lens-effect/blob/master/src/scripts/webgl/glsl/frag/frag.glsl, with chunks/ccLens.glsl), MIT, Copyright (c) 2026 Mouse Following Square Lens Effect contributors. Changes: the two textures became one scene (the grey outside is the same picture desaturated); GLSL ES 3.00 for makeShaderEffect; the lens centre is a prop on a scripted path (lensPath) instead of the eased mouse; the Nikita Miropolskiy random3 hash is replaced by our own integer hash re-rolled per frame; the square edge is anti-aliased and gets an optional outline; sizes are in px at 720p; time comes from the frame.
import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Filter} from '../../core/filter';
import {Plate} from '../../core/scene';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];

export type LensShiftProps = {
	/** centre of the square lens as [x, y] shares of the frame, y measured from the TOP (CSS-like). Animate it with lensPath(). */
	center?: Vec2;
	/** side of the square lens in px at 720p */
	size?: number;
	/** bulge inside the lens (CC Lens "Amount"): 0 = flat glass, 0.65 = clean magnifier toward the rim, above ~0.7 the corners fold over (the original uses 1.5), negative = pinch */
	distortion?: number;
	/** radial RGB split at the lens rim as a share of the frame (red moves out, blue in); 0.01 = ~13 px at the rim */
	rgbShift?: number;
	/** the grey outside is bent by sin(y * waveFrequency + time * waveSpeed) * waveStrength (uv units) */
	waveFrequency?: number;
	waveStrength?: number;
	waveSpeed?: number;
	/** px at 720p by which every outside pixel is scattered at random (re-rolled every frame): the grain */
	grain?: number;
	/** how grey the outside is (1 = no colour left) */
	desaturate?: number;
	/** brightness of the outside (1 = untouched) */
	dim?: number;
	/** width in px at 720p of a line around the lens, 0 = none */
	outline?: number;
	outlineColor?: string;
	/** seconds, drives the wave: pass frame / fps */
	time?: number;
	/** integer that re-rolls the grain: pass the frame */
	seed?: number;
};

const hex = (color: string): Vec3 => {
	let h = color.trim().replace('#', '');
	if (h.length === 3) {
		h = h
			.split('')
			.map((c) => c + c)
			.join('');
	}
	const n = parseInt(h.slice(0, 6), 16);
	return Number.isNaN(n) ? [1, 1, 1] : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const BODY = `
uniform vec2 centre;
uniform float size;
uniform float distortion;
uniform float rgbShift;
uniform float waveFrequency;
uniform float waveStrength;
uniform float waveSpeed;
uniform float grain;
uniform float desaturate;
uniform float dim;
uniform float outline;
uniform vec3 outlineColor;
uniform float time;
uniform float seed;

precision highp int;
uint hu(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
uint hu3(uint a, uint b, uint c) { return hu(hu(hu(a) + b) + c); }
float hf(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }

// CC Lens style radial distortion on square-local uv (0..1): how far the sample moves toward the centre
vec2 ccLensOffset(vec2 suv, float d) {
	vec2 c = suv - 0.5;
	float r2 = dot(c, c);
	float s = d >= 0.0 ? 1.0 + d * r2 : 1.0 / (1.0 - d * r2);
	return -c * (s - 1.0);
}

vec4 effect(vec2 uv) {
	float minRes = min(resolution.x, resolution.y);
	float un = minRes / 720.0;
	// q: 1 unit = half of the shorter side, centred on the lens, so the lens stays square at any aspect
	vec2 q = (uv - centre) * resolution / (0.5 * minRes);
	float hs = size / 720.0;
	vec2 aspect = vec2(min(resolution.y / resolution.x, 1.0), min(resolution.x / resolution.y, 1.0));
	vec2 suv = q / (2.0 * hs) + 0.5;

	// inside: full colour, bulged, with a radial RGB split that grows toward the rim
	vec2 lensUv = uv + ccLensOffset(suv, distortion) * hs * aspect;
	vec2 dir = (suv - 0.5) * 2.0;
	vec4 mid = getColor(lensUv);
	vec4 inside = vec4(getColor(lensUv + dir * rgbShift).r, mid.g, getColor(lensUv - dir * rgbShift).b, mid.a);

	// outside: grey, bent by a slow wave, scattered by per-pixel noise
	vec2 ouv = uv;
	ouv.y += sin(ouv.y * waveFrequency + time * waveSpeed) * waveStrength;
	uvec2 px = uvec2(floor(uv * resolution));
	uint h = hu3(px.x, px.y, uint(max(seed, 0.0)));
	ouv += (vec2(hf(h), hf(hu(h ^ 0x9e3779b9u))) - 0.5) * grain * un / resolution;
	vec4 oc = getColor(ouv);
	float l = dot(oc.rgb, vec3(0.2126, 0.7152, 0.0722));
	vec4 outside = vec4(mix(oc.rgb, vec3(l), desaturate) * dim, oc.a);

	float sdPx = (max(abs(q.x), abs(q.y)) - hs) * 0.5 * minRes;
	float mask = clamp(0.5 - sdPx, 0.0, 1.0);
	vec4 col = mix(outside, inside, mask);
	if (outline > 0.0) {
		float line = clamp(outline * un * 0.5 + 0.5 - abs(sdPx), 0.0, 1.0);
		col = col * (1.0 - line) + vec4(outlineColor, 1.0) * line;
	}
	return col;
}
`;

const lensShiftFx = makeShaderEffect({
	type: 's17-lens-shift',
	label: 'Lens shift',
	body: BODY,
	defaults: {
		centre: [0.5, 0.5] as Vec2,
		size: 300,
		distortion: 0.65,
		rgbShift: 0.01,
		waveFrequency: 10,
		waveStrength: 0.01,
		waveSpeed: 1,
		grain: 6,
		desaturate: 1,
		dim: 0.8,
		outline: 0,
		outlineColor: [1, 1, 1] as Vec3,
		time: 0,
		seed: 0,
	},
});

/**
 * Square lens over a grey, waving picture as a Remotion effect:
 * `<Filter effects={[lensShift({center: lensPath(frame, KEYS), time: frame / fps, seed: frame})]}>{scene}</Filter>`.
 */
export const lensShift = ({
	center = [0.5, 0.5],
	size = 300,
	distortion = 0.65,
	rgbShift = 0.01,
	waveFrequency = 10,
	waveStrength = 0.01,
	waveSpeed = 1,
	grain = 6,
	desaturate = 1,
	dim = 0.8,
	outline = 0,
	outlineColor = '#ffffff',
	time = 0,
	seed = 0,
}: LensShiftProps = {}) =>
	lensShiftFx({
		centre: [center[0], 1 - center[1]],
		size,
		distortion,
		rgbShift,
		waveFrequency,
		waveStrength,
		waveSpeed,
		grain,
		desaturate,
		dim,
		outline,
		outlineColor: hex(outlineColor),
		time,
		seed,
	});

/** One stop of a lens path: be at `at` (shares of the frame, y from the top) on `frame`. */
export type LensKey = {frame: number; at: Vec2};

const onPath = (f: number, keys: readonly LensKey[]): [number, number] => {
	const n = keys.length;
	if (f <= keys[0].frame) {
		return [keys[0].at[0], keys[0].at[1]];
	}
	if (f >= keys[n - 1].frame) {
		return [keys[n - 1].at[0], keys[n - 1].at[1]];
	}
	let i = 0;
	while (i < n - 2 && f >= keys[i + 1].frame) {
		i++;
	}
	const a = keys[i];
	const b = keys[i + 1];
	const dt = Math.max(1, b.frame - a.frame);
	const t = (f - a.frame) / dt;
	// cardinal tangents (Catmull-Rom with real frame spacing): the path passes through every key without stopping on it
	const slope = (k: number, axis: 0 | 1) => {
		const lo = keys[Math.max(0, k - 1)];
		const hi = keys[Math.min(n - 1, k + 1)];
		return (hi.at[axis] - lo.at[axis]) / Math.max(1, hi.frame - lo.frame);
	};
	const t2 = t * t;
	const t3 = t2 * t;
	const h00 = 2 * t3 - 3 * t2 + 1;
	const h10 = t3 - 2 * t2 + t;
	const h01 = -2 * t3 + 3 * t2;
	const h11 = t3 - t2;
	const at = (axis: 0 | 1) => h00 * a.at[axis] + h10 * dt * slope(i, axis) + h01 * b.at[axis] + h11 * dt * slope(i + 1, axis);
	return [at(0), at(1)];
};

/**
 * Lens centre on `frame`: a smooth path through `keys` (ascending frames), followed with a lag the way the original
 * lens eases toward the mouse. `follow` is the share of the remaining distance closed each frame (0.2 = soft, 1 = no lag).
 * A pure function of the frame (the lag is replayed from the first key), so any frame can be rendered alone.
 */
export const lensPath = (frame: number, keys: readonly LensKey[], follow = 0.22): Vec2 => {
	if (keys.length === 0) {
		return [0.5, 0.5];
	}
	if (follow >= 1) {
		return onPath(frame, keys);
	}
	const k = Math.max(0.001, follow);
	let [x, y] = onPath(keys[0].frame, keys);
	const last = Math.floor(frame);
	for (let f = keys[0].frame + 1; f <= last; f++) {
		const [tx, ty] = onPath(f, keys);
		x += (tx - x) * k;
		y += (ty - y) * k;
	}
	return [x, y];
};

const KEYS: LensKey[] = [
	{frame: 0, at: [0.3, 0.64]},
	{frame: 22, at: [0.2, 0.25]},
	{frame: 46, at: [0.68, 0.34]},
	{frame: 72, at: [0.8, 0.74]},
	{frame: 96, at: [0.3, 0.64]},
];

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const center = lensPath(frame, KEYS);
	const before = lensPath(frame - 1, KEYS);
	// the faster the lens moves, the wider the RGB split
	const speed = Math.hypot(center[0] - before[0], center[1] - before[1]);
	const rgbShift = interpolate(speed, [0, 0.03], [0.004, 0.012], {extrapolateRight: 'clamp'});
	const size = interpolate(Math.sin((frame / 96) * Math.PI * 4), [-1, 1], [280, 330]);
	return (
		<Filter effects={[lensShift({center, size, rgbShift, outline: 2, time: frame / fps, seed: frame})]}>
			<Plate />
		</Filter>
	);
};

export const lensShiftEntry: LibraryEntry = {
	meta: {
		id: 'lens-shift',
		title: 'Lens shift',
		category: 'fx',
		looks: 'The picture sinks to a grainy, gently waving grey while a square lens glides over it and shows the scene in full colour, bulged toward the rim with a radial RGB split.',
		use: 'Pick out one detail (a clue, a face, a HUD element) as a tracking viewfinder; drive center with lensPath() and widen rgbShift while the lens moves.',
		exportName: 'lensShift',
		durationInFrames: 96,
		source: {
			kind: 'ported',
			name: 'mouse-following-square-lens-effect',
			url: 'https://github.com/tomoyukinakata/mouse-following-square-lens-effect/blob/master/src/scripts/webgl/glsl/frag/frag.glsl',
			license: 'MIT',
		},
	},
	Demo,
};
