// Ported from vfx-js (https://github.com/fand/vfx-js/blob/main/packages/effects/src/gradient-map.ts), MIT, Copyright (c) 2020-present The VFX-JS developers.
// Changes: rewritten as a makeShaderEffect body (stops as c0..c5 uniforms, 720p-independent); added levels (black/white), amount and flat `bands`;
// colour space / repeat / scatter kept. Includes hash12 by David Hoskins ("Hash without Sine", MIT) and the OKLab matrices by Bjorn Ottosson (MIT).
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Filter} from '../../core/filter';
import {Plate} from '../../core/scene';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {GLSL_UTIL, hex, mixHex, type Vec3} from './_look-utils';

export type GradientMapProps = {
	/** 2..6 colour stops from shadows to highlights: 2 = duotone, 3 = tritone, more = full gradient map */
	colors?: string[];
	/** slides the ramp along the luminance axis; animate it (or use `repeat`) for colour cycling */
	offset?: number;
	/** how many times the ramp runs over the luminance range */
	frequency?: number;
	/** what happens past the ends of the ramp: clamp, repeat (saw) or mirror (triangle) */
	repeat?: 'clamp' | 'repeat' | 'mirror';
	/** colour space used between two stops */
	space?: 'srgb' | 'linear' | 'oklab';
	/** 0 = smooth ramp, N = N flat colour bands (poster look) */
	bands?: number;
	/** static noise added to the luminance before lookup, breaks up banding */
	scatter?: number;
	/** input levels: luminance <= black maps to the first stop, >= white to the last */
	black?: number;
	white?: number;
	/** 0 = the scene, 1 = fully mapped */
	amount?: number;
};

const MAX_STOPS = 6;

const BODY = `
uniform vec3 c0;
uniform vec3 c1;
uniform vec3 c2;
uniform vec3 c3;
uniform vec3 c4;
uniform vec3 c5;
uniform float count;
uniform float offset;
uniform float frequency;
uniform float repeatType;
uniform float mixSpace;
uniform float bands;
uniform float scatter;
uniform float blackPt;
uniform float whitePt;
uniform float amount;
${GLSL_UTIL}
vec3 srgb2lin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 lin2srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

vec3 lin2oklab(vec3 c) {
	float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
	float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
	float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
	vec3 lms = pow(max(vec3(l, m, s), 0.0), vec3(1.0 / 3.0));
	return vec3(
		0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
		1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
		0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z
	);
}
vec3 oklab2lin(vec3 lab) {
	float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
	float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
	float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
	vec3 lms = vec3(l_, m_, s_);
	lms = lms * lms * lms;
	return vec3(
		4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
		-1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
		-0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z
	);
}

vec3 mixColor(vec3 a, vec3 b, float t) {
	if (mixSpace > 1.5) {
		return lin2srgb(oklab2lin(mix(lin2oklab(srgb2lin(a)), lin2oklab(srgb2lin(b)), t)));
	}
	if (mixSpace > 0.5) {
		return lin2srgb(mix(srgb2lin(a), srgb2lin(b), t));
	}
	return mix(a, b, t);
}

float applyRepeat(float t) {
	if (repeatType > 1.5) { return 1.0 - abs(1.0 - fract(t * 0.5) * 2.0); }
	if (repeatType > 0.5) { return fract(t); }
	return clamp(t, 0.0, 1.0);
}

vec3 sampleGradient(float t) {
	vec3 stops[6] = vec3[6](c0, c1, c2, c3, c4, c5);
	int n = int(count + 0.5);
	float f = t * float(n - 1);
	int i = clamp(int(floor(f)), 0, n - 2);
	float fr = clamp(f - float(i), 0.0, 1.0);
	return clamp(mixColor(stops[i], stops[i + 1], fr), 0.0, 1.0);
}

vec4 effect(vec2 uv) {
	vec4 c = getColor(uv);
	vec3 s = unpremul(c);
	float l = dot(s, vec3(0.299, 0.587, 0.114));
	l = (l - blackPt) / max(whitePt - blackPt, 1e-3);
	l += scatter * (hash12(gl_FragCoord.xy) - 0.5);
	float t = applyRepeat((l + offset) * frequency);
	if (bands > 1.5) {
		t = min(floor(t * bands), bands - 1.0) / (bands - 1.0);
	}
	vec3 mapped = sampleGradient(t);
	return vec4(mix(s, mapped, amount) * c.a, c.a);
}
`;

const gradientMapFx = makeShaderEffect({
	type: 's17-gradient-map',
	label: 'Gradient map',
	body: BODY,
	defaults: {
		c0: [0, 0, 0] as Vec3,
		c1: [1, 1, 1] as Vec3,
		c2: [1, 1, 1] as Vec3,
		c3: [1, 1, 1] as Vec3,
		c4: [1, 1, 1] as Vec3,
		c5: [1, 1, 1] as Vec3,
		count: 2,
		offset: 0,
		frequency: 1,
		repeatType: 0,
		mixSpace: 0,
		bands: 0,
		scatter: 0,
		blackPt: 0,
		whitePt: 1,
		amount: 1,
	},
});

const REPEAT = {clamp: 0, repeat: 1, mirror: 2} as const;
const SPACE = {srgb: 0, linear: 1, oklab: 2} as const;

/** Gradient map as a Remotion effect: `<Filter effects={[gradientMap({colors: ['#0a0830', '#ff3d7a', '#ffd25e']})]}>{scene}</Filter>`. */
export const gradientMap = ({
	colors = ['#080625', '#7a1fb8', '#ff3d7a', '#ffd25e', '#fffbe8'],
	offset = 0,
	frequency = 1,
	repeat = 'clamp',
	space = 'oklab',
	bands = 0,
	scatter = 0,
	black = 0,
	white = 1,
	amount = 1,
}: GradientMapProps = {}) => {
	const stops = (colors.length >= 2 ? colors : ['#000000', '#ffffff']).slice(0, MAX_STOPS);
	const rgb = Array.from({length: MAX_STOPS}, (_, i) => hex(stops[Math.min(i, stops.length - 1)]));
	return gradientMapFx({
		c0: rgb[0],
		c1: rgb[1],
		c2: rgb[2],
		c3: rgb[3],
		c4: rgb[4],
		c5: rgb[5],
		count: stops.length,
		offset,
		frequency,
		repeatType: REPEAT[repeat],
		mixSpace: SPACE[space],
		bands,
		scatter,
		blackPt: black,
		whitePt: white,
		amount,
	});
};

const NIGHT = ['#080625', '#7a1fb8', '#ff3d7a', '#ffd25e', '#fffbe8'];
const ICE = ['#02101c', '#08406b', '#1aa0b8', '#9af0e0', '#f4fffb'];

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const amount = interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp', easing: CURVES.snap});
	// palette swap on a 14 frame crossfade, then the ramp slides over the picture
	const swap = progress(frame, 44, 14, CURVES.inOutCubic);
	const colors = NIGHT.map((c, i) => mixHex(c, ICE[i], swap));
	const offset = interpolate(frame, [18, 96], [0, 0.9]);
	const bands = frame >= 72 ? 5 : 0;
	return (
		<AbsoluteFill>
			<Filter effects={[gradientMap({colors, offset, repeat: 'mirror', frequency: 1.4, bands, amount})]}>
				<Plate />
			</Filter>
		</AbsoluteFill>
	);
};

export const gradientMapEntry: LibraryEntry = {
	meta: {
		id: 'gradient-map',
		title: 'Gradient map',
		category: 'fx',
		looks: 'The whole picture re-inked in a 2..6 colour ramp by luminance: indigo-pink-gold, then a colour swap to ice, with the ramp sliding over the image and a final 5-band poster step.',
		use: 'Duotone / tritone looks, per-scene colour identity, heat-vision or flashback grades; animate offset for colour cycling.',
		exportName: 'gradientMap',
		durationInFrames: 96,
		source: {
			kind: 'ported',
			name: 'vfx-js gradient-map',
			url: 'https://github.com/fand/vfx-js/blob/main/packages/effects/src/gradient-map.ts',
			license: 'MIT',
		},
	},
	Demo,
};
