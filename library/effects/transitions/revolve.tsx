// Ported from gl-transitions Revolve_Left.glsl by bread (https://github.com/gl-transitions/gl-transitions/blob/master/transitions/Revolve_Left.glsl), MIT, Copyright (c) 2017-present gl-transitions contributors. Changes: direction given as 'left' | 'right', uniforms re-exposed as props, per-pixel dither on the temporal blur taps.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import type {LibraryEntry} from '../../core/types';
import {makeTransitionDemo} from './_gl-utils';

export type RevolveProps = {
	/** spin direction of the whirl */
	direction?: 'left' | 'right';
	/** whirl centre, 0..1 (y up) */
	center?: readonly [number, number];
	/** rotation at the edges at the peak, radians */
	maxRotation?: number;
	/** zoom at the peak */
	peakZoom?: number;
	/** extra twist near the centre, radians */
	swirl?: number;
	/** barrel distortion at the peak */
	barrel?: number;
	/** temporal motion blur (0 = none) */
	motionBlur?: number;
	/** progress at which A starts / finishes handing over to B (under the blur) */
	switchStart?: number;
	switchEnd?: number;
	/** vignette at the peak */
	shadow?: number;
};

const BODY = `
uniform vec2 center;
uniform float direction;
uniform float maxRotation;
uniform float peakZoom;
uniform float swirl;
uniform float barrel;
uniform float motionBlur;
uniform float switchStart;
uniform float switchEnd;
uniform float shadow;

float sat(float x) {
	return clamp(x, 0.0, 1.0);
}

float ease(float x) {
	x = sat(x);
	return x * x * (3.0 - 2.0 * x);
}

float revolveEnvelope(float t) {
	float rise = ease((t - 0.10) / 0.33);
	float fall = 1.0 - ease((t - 0.43) / 0.29);
	return rise * fall;
}

vec2 rotate2(vec2 p, float a) {
	float s = sin(a);
	float c = cos(a);
	return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

vec2 warpUv(vec2 uv, float t) {
	float e = revolveEnvelope(t);

	vec2 p = uv - center;
	p.x *= ratio;

	float r = length(p);
	float edgeSpin = maxRotation * e;
	float coreSpin = swirl * e * pow(1.0 - sat(r / 0.96), 1.55);
	float visibleAngle = direction * (edgeSpin + coreSpin);

	p = rotate2(p, -visibleAngle);

	float sc = 1.0 + (peakZoom - 1.0) * pow(e, 0.85);
	p /= sc;

	float rr = length(p);
	p *= 1.0 + barrel * e * rr * rr * 2.8;

	p.x /= ratio;
	return clamp(p + center, vec2(0.001), vec2(0.999));
}

vec4 sampleRevolve(vec2 uv, float t) {
	vec2 p = warpUv(uv, t);
	float reveal = smoothstep(switchStart, switchEnd, t);
	return mix(getFromColor(p), getToColor(p), reveal);
}

vec4 transition(vec2 uv) {
	if (progress <= 0.0) return getFromColor(uv);
	if (progress >= 1.0) return getToColor(uv);

	float e = revolveEnvelope(progress);
	float span = 0.060 * motionBlur * e;

	vec4 color = vec4(0.0);
	float total = 0.0;

	// per-pixel jitter of the temporal taps breaks the concentric banding of a 17-tap blur into fine grain
	float dither = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
	for (int i = -8; i <= 8; i++) {
		float x = (float(i) + dither) / 8.0;
		float w = max(1.0 - abs(x), 0.0);
		w = w * w + 0.01;

		float t = sat(progress + x * span);
		color += sampleRevolve(uv, t) * w;
		total += w;
	}

	color /= total;

	vec2 q = uv - vec2(0.5);
	q.x *= ratio;
	float vignette = 1.0 - shadow * e * smoothstep(0.35, 0.95, length(q));
	color.rgb *= vignette;

	return color;
}`;

const make = makeGlTransition(BODY, {
	center: [0.46, 0.52] as readonly [number, number],
	direction: -1,
	maxRotation: 1.95,
	peakZoom: 2.22,
	swirl: 2.85,
	barrel: 0.38,
	motionBlur: 1,
	switchStart: 0.3,
	switchEnd: 0.5,
	shadow: 0.16,
});

/**
 * Spin-zoom whirl: the whole frame whips around a centre like a spinning camera, zooming in and smearing, and the cut hides under the peak blur.
 * The first 10 % and last 28 % of the transition are static, so give it 24-36 frames (30 default).
 */
export const revolve = (props: RevolveProps = {}) => {
	const {direction = 'left', ...rest} = props;
	return make({...rest, direction: direction === 'left' ? -1 : 1});
};

const Demo = makeTransitionDemo([{presentation: revolve(), durationInFrames: 30, timing: linearTiming({durationInFrames: 30})}], 8, 12);

export const revolveEntry: LibraryEntry = {
	meta: {
		id: 'revolve',
		title: 'Revolve',
		category: 'transitions',
		looks: 'The frame whips around a point like a spinning camera: rotation, a core twist, zoom to 2.2x and motion blur, the scene swaps under the blur and unwinds into B.',
		use: 'High-energy action cuts, hero spin-to-ability moments, "world flips" beats in a hype PV.',
		exportName: 'revolve',
		durationInFrames: 50,
		source: {
			kind: 'ported',
			name: 'gl-transitions Revolve_Left (bread)',
			url: 'https://github.com/gl-transitions/gl-transitions/blob/master/transitions/Revolve_Left.glsl',
			license: 'MIT',
		},
	},
	Demo,
};
