import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Filter} from '../../core/filter';
import {Plate} from '../../core/scene';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {GLSL_UTIL, hex, toUv, type Vec2, type Vec3} from './_look-utils';

export type GodRaysProps = {
	/** light position as fractions of the frame, y from the top (may sit outside 0..1) */
	light?: Vec2;
	/** brightness (0..1) above which pixels feed the shafts; dark objects in front of the light cut them */
	threshold?: number;
	/** march samples per pixel (quality) */
	samples?: number;
	/** how far each pixel marches toward the light: 1 = all the way */
	density?: number;
	/** share of the light left at the far end of the march (0..1, lower = shorter shafts) */
	decay?: number;
	weight?: number;
	/** overall gain of the shafts */
	exposure?: number;
	tint?: string;
	/** 0..1: 0 = a pure radial blur of the picture, 1 = hard-edged sunburst rays even through empty sky */
	shafts?: number;
	/** number of rays around the light (whole number) */
	rayCount?: number;
	/** seconds (frame / fps) and turns per second: the sunburst slowly rotates */
	time?: number;
	spin?: number;
	/** only pixels within this distance of the light (in frame heights) can emit shafts */
	sourceRadius?: number;
	/** 0..1 blend of the effect over the scene */
	amount?: number;
};

const BODY = `
uniform vec2 light;
uniform float threshold;
uniform float samples;
uniform float density;
uniform float decay;
uniform float weight;
uniform float exposure;
uniform float shafts;
uniform float rayCount;
uniform float phase;
uniform float amount;
uniform float srcRadius;
uniform vec3 tint;
${GLSL_UTIL}
float mask(vec2 uv) {
	vec4 c = getColor(uv);
	float m = smoothstep(threshold, threshold + 0.25, luma709(c.rgb));
	// only bright things near the light emit shafts: bright text across the frame does not
	float d = length((uv - light) * resolution) / resolution.y;
	return m * (1.0 - smoothstep(srcRadius, srcRadius * 1.35, d));
}

// value noise that wraps after 'period' cells, so the rays close around the full circle
float rayNoise(float x, float period) {
	float i = floor(x);
	float f = fract(x);
	float a = hash12(vec2(mod(i, period), 3.7));
	float b = hash12(vec2(mod(i + 1.0, period), 3.7));
	return mix(a, b, f * f * (3.0 - 2.0 * f));
}

vec4 effect(vec2 uv) {
	vec4 src = getColor(uv);
	if (exposure <= 0.0 || amount <= 0.0) { return src; }
	float n = max(samples, 4.0);
	vec2 delta = (light - uv) * (density / n);
	// per-pixel start jitter hides the banding of a fixed sample step
	vec2 p = uv + delta * hash12(gl_FragCoord.xy);
	float dec = pow(max(decay, 1e-3), 1.0 / n);
	float illum = 1.0;
	float acc = 0.0;
	for (int i = 0; i < 160; i++) {
		if (float(i) >= n) { break; }
		acc += mask(p) * illum;
		illum *= dec;
		p += delta;
	}
	acc = acc / n * weight * 2.0;

	vec2 v = (uv - light) * resolution;
	float th = atan(v.y, v.x) / 6.2831853 + 0.5;
	float p1 = max(floor(rayCount), 3.0);
	float p2 = p1 * 2.0 + 3.0;
	float rn = 0.65 * rayNoise(fract(th + phase) * p1, p1) + 0.35 * rayNoise(fract(th - phase * 1.7) * p2, p2);
	float rays = smoothstep(0.25, 0.8, rn) * 1.5;
	// near the light the angle is meaningless: fade the modulation in with distance
	float nearL = smoothstep(0.0, 0.1, length(v) / resolution.y);
	acc *= mix(1.0, mix(1.0, rays, nearL), shafts);

	vec3 ray = clamp(tint * acc * exposure, 0.0, 1.0) * amount;
	vec3 rgb = 1.0 - (1.0 - src.rgb) * (1.0 - ray);
	return vec4(rgb, max(src.a, max(ray.r, max(ray.g, ray.b))));
}
`;

const godRaysFx = makeShaderEffect({
	type: 's17-god-rays',
	label: 'God rays',
	body: BODY,
	defaults: {
		light: [0.7, 0.65] as Vec2,
		threshold: 0.6,
		samples: 64,
		density: 0.96,
		decay: 0.12,
		weight: 0.5,
		exposure: 1.8,
		shafts: 0.6,
		rayCount: 14,
		phase: 0,
		amount: 1,
		srcRadius: 0.5,
		tint: [1, 0.85, 0.62] as Vec3,
	},
});

/** God rays as a Remotion effect: `<Filter effects={[godRays({light: [0.7, 0.35], time: frame / fps})]}>{scene}</Filter>`. */
export const godRays = ({
	light = [0.7, 0.35],
	threshold = 0.6,
	samples = 64,
	density = 0.96,
	decay = 0.12,
	weight = 0.5,
	exposure = 1.8,
	tint = '#ffd99e',
	shafts = 0.6,
	rayCount = 14,
	time = 0,
	spin = 0.02,
	amount = 1,
	sourceRadius = 0.5,
}: GodRaysProps = {}) =>
	godRaysFx({
		light: toUv(light),
		threshold,
		samples: Math.min(160, Math.max(8, Math.round(samples))),
		density,
		decay,
		weight,
		exposure,
		shafts,
		rayCount,
		phase: time * spin,
		amount,
		srcRadius: sourceRadius,
		tint: hex(tint),
	});

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	// the light ignites on a snap curve with a brief overshoot, then holds while the rays sharpen and turn
	const ignite = progress(frame, 3, 14, CURVES.snap);
	const exposure = 1.9 * ignite * (1 + 0.5 * Math.exp(-Math.max(0, frame - 10) / 6));
	const light: Vec2 = [0.697, 0.349];
	const shafts = interpolate(frame, [30, 60], [0.55, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	return (
		<AbsoluteFill>
			<Filter effects={[godRays({light, exposure, shafts, time: frame / fps, spin: 0.06})]}>
				<Plate />
			</Filter>
		</AbsoluteFill>
	);
};

export const godRaysEntry: LibraryEntry = {
	meta: {
		id: 'god-rays',
		title: 'God rays',
		category: 'fx',
		looks: 'Warm light shafts fan out from the light, cut by the mountains and the figure, and sharpen from a soft radial smear into a rotating hard-edged sunburst.',
		use: 'Reveal shots, dawn / backlit hero beats, a portal or relic lighting up; animate exposure on a snap curve for the ignition.',
		exportName: 'godRays',
		durationInFrames: 78,
		source: {
			kind: 'inspired',
			name: 'GPU Gems 3 radial-blur light scattering (as in pmndrs/postprocessing GodRaysEffect)',
			url: 'https://github.com/pmndrs/postprocessing/blob/main/src/effects/GodRaysEffect.js',
		},
	},
	Demo,
};
