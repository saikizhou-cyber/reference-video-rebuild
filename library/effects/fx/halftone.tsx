// Ported from vfx-js (https://github.com/fand/vfx-js/blob/main/packages/effects/src/halftone.ts), MIT, Copyright (c) 2020-present The VFX-JS developers.
// Changes: rewritten as a makeShaderEffect body in 720p units; multiplicative ink mixing over a paper colour (additive in RGB mode);
// 5-tap averaged dot-centre sample; added mono dot / line screens, plate misregistration, contrast, amount and transparent paper;
// kept the ink presets table and the per-ink screen angles; dropped trimEdge. hash12 in _look-utils is David Hoskins' "Hash without Sine" (MIT).
import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Filter} from '../../core/filter';
import {Plate} from '../../core/scene';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {GLSL_UTIL, hex, type Vec3} from './_look-utils';

export type HalftoneInkPreset = 'pure' | 'newsprint' | 'fogra51' | 'swop';

export type HalftoneProps = {
	/** cmyk = four rotated ink screens (subtractive), rgb = three additive screens on black (LED look),
	 *  mono = one ink, dots at 45 deg, lines = one ink, ruled lines whose width follows the tone */
	mode?: 'cmyk' | 'rgb' | 'mono' | 'lines';
	/** ink set for cmyk / rgb */
	preset?: HalftoneInkPreset;
	/** screen pitch in px at 720p */
	size?: number;
	/** dot size relative to the cell: 1 = a full-ink dot just touches the cell corners, > 1 lets dots merge, 0 = no dots */
	dot?: number;
	/** soft-edge share of the dot radius (0..1) */
	smoothing?: number;
	/** rotation added to every screen angle, degrees */
	angle?: number;
	/** cmyk only: how much of the dark tones goes to black ink (1) instead of C+M+Y (0) */
	black?: number;
	/** contrast applied to the scene before separating it into inks */
	contrast?: number;
	/** px at 720p by which the ink plates sit out of register (cmyk / rgb); animate it to 0 for plates landing in register */
	misregister?: number;
	/** 0 = the scene, 1 = full halftone */
	amount?: number;
	/** paper colour (mono / cmyk default a warm off-white, rgb default near-black); null = transparent paper, dots only */
	paper?: string | null;
	/** ink colour of mono / lines */
	ink?: string;
};

const PRESETS: Record<HalftoneInkPreset, {c: Vec3; m: Vec3; y: Vec3; k: Vec3}> = {
	pure: {c: [0, 1, 1], m: [1, 0, 1], y: [1, 1, 0], k: [0, 0, 0]},
	newsprint: {c: [0.15, 0.73, 0.88], m: [0.88, 0.12, 0.55], y: [0.97, 0.93, 0.08], k: [0.1, 0.1, 0.1]},
	fogra51: {c: [0.0, 0.525, 0.765], m: [0.827, 0.0, 0.486], y: [0.984, 0.91, 0.0], k: [0.145, 0.145, 0.145]},
	swop: {c: [0.0, 0.557, 0.769], m: [0.827, 0.02, 0.478], y: [0.984, 0.902, 0.027], k: [0.169, 0.169, 0.169]},
};

const MODES = {mono: 0, lines: 1, rgb: 2, cmyk: 3} as const;

const BODY = `
uniform float mode;
uniform float gridSize;
uniform float dotSize;
uniform float smoothing;
uniform float angle;
uniform float blackAmount;
uniform float contrast;
uniform float misreg;
uniform float amount;
uniform float paperAlpha;
uniform vec3 paper;
uniform vec3 ink0;
uniform vec3 ink1;
uniform vec3 ink2;
uniform vec3 ink3;
${GLSL_UTIL}
const vec3 RGB_ANGLES = vec3(15.0, 45.0, 75.0);
const vec4 CMYK_ANGLES = vec4(15.0, 75.0, 0.0, 45.0);
const vec2 CELLS[9] = vec2[9](vec2(0.0), vec2(-1.0, 0.0), vec2(1.0, 0.0), vec2(0.0, -1.0), vec2(0.0, 1.0),
	vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
const vec2 MISREG[4] = vec2[4](vec2(-1.0, 0.55), vec2(0.9, 0.7), vec2(0.35, -1.0), vec2(-0.5, -0.4));

// average of 5 taps around a dot centre: steadier tone than a single bilinear tap
vec4 srcAt(vec2 p, float g) {
	vec2 o = vec2(g * 0.24);
	vec4 s = getColor(p / resolution);
	s += getColor((p + vec2(o.x, 0.0)) / resolution);
	s += getColor((p - vec2(o.x, 0.0)) / resolution);
	s += getColor((p + vec2(0.0, o.y)) / resolution);
	s += getColor((p - vec2(0.0, o.y)) / resolution);
	return s * 0.2;
}

// how much of ink i this colour needs (0..1)
float inkAmount(vec3 rgb, int i) {
	rgb = clamp((rgb - 0.5) * contrast + 0.5, 0.0, 1.0);
	if (mode < 1.5) { return 1.0 - luma709(rgb); }
	if (mode < 2.5) { return rgb[i]; }
	float k = blackAmount * (1.0 - max(rgb.r, max(rgb.g, rgb.b)));
	if (i == 3) { return k; }
	return (1.0 - rgb[i] - k) / max(1.0 - k, 1e-4);
}

float dotPlate(int i, vec2 frag, float g, float rotDeg) {
	float rot = radians(rotDeg);
	float c = cos(rot);
	float s = sin(rot);
	mat2 toGrid = mat2(c, -s, s, c);
	mat2 toScreen = mat2(c, s, -s, c);
	vec2 centre = resolution * 0.5;
	vec2 gridFrag = toGrid * (frag - centre);
	vec2 cell0 = floor(gridFrag / g);
	float maxR = g * dotSize * 0.7071068;
	int cellCount = dotSize < 0.7071068 ? 1 : (dotSize < 1.0 ? 5 : 9);
	float cov = 0.0;
	for (int j = 0; j < 9; j++) {
		if (j >= cellCount) { break; }
		vec2 cell = cell0 + CELLS[j];
		vec2 dotPos = toScreen * (cell * g + vec2(g * 0.5)) + centre;
		float d = distance(frag, dotPos);
		if (d > maxR + 1.0) { continue; }
		vec4 sc = srcAt(dotPos, g);
		float r = inkAmount(unpremul(sc), i) * sc.a * maxR;
		float aa = max(r * smoothing, 0.75);
		cov += 1.0 - smoothstep(r - aa, r, d);
	}
	return clamp(cov, 0.0, 1.0);
}

float linePlate(vec2 frag, float g, float rotDeg) {
	float rot = radians(rotDeg);
	float c = cos(rot);
	float s = sin(rot);
	mat2 toGrid = mat2(c, -s, s, c);
	mat2 toScreen = mat2(c, s, -s, c);
	vec2 centre = resolution * 0.5;
	vec2 gf = toGrid * (frag - centre);
	float cy = (floor(gf.y / g) + 0.5) * g;
	vec4 sc = srcAt(toScreen * vec2(gf.x, cy) + centre, g);
	float hw = inkAmount(unpremul(sc), 0) * sc.a * g * 0.5 * dotSize * 1.05;
	float aa = max(hw * smoothing, 0.75);
	return 1.0 - smoothstep(hw - aa, hw, abs(gf.y - cy));
}

vec4 effect(vec2 uv) {
	float un = resolution.y / 720.0;
	float g = max(gridSize * un, 2.0);
	vec2 frag = uv * resolution;
	vec4 src = getColor(uv);
	vec4 a = vec4(0.0);
	if (mode < 0.5) {
		a.x = dotPlate(0, frag, g, angle + 45.0);
	} else if (mode < 1.5) {
		a.x = linePlate(frag, g, angle + 45.0);
	} else if (mode < 2.5) {
		for (int i = 0; i < 3; i++) {
			a[i] = dotPlate(i, frag - MISREG[i] * misreg * un, g, RGB_ANGLES[i] + angle);
		}
	} else {
		for (int i = 0; i < 4; i++) {
			a[i] = dotPlate(i, frag - MISREG[i] * misreg * un, g, CMYK_ANGLES[i] + angle);
		}
	}
	vec3 inks[4] = vec3[4](ink0, ink1, ink2, ink3);
	float cover = 1.0 - (1.0 - a.x) * (1.0 - a.y) * (1.0 - a.z) * (1.0 - a.w);
	vec3 col;
	vec3 only;
	if (mode < 1.5) {
		col = mix(paper, ink0, a.x);
		only = ink0;
	} else if (mode < 2.5) {
		vec3 add = ink0 * a.x + ink1 * a.y + ink2 * a.z;
		col = min(paper + add, vec3(1.0));
		only = cover > 1e-4 ? min(add / cover, vec3(1.0)) : vec3(0.0);
	} else {
		vec3 prod = vec3(1.0);
		for (int i = 0; i < 4; i++) {
			prod *= mix(vec3(1.0), inks[i], a[i]);
		}
		col = paper * prod;
		only = cover > 1e-4 ? clamp((prod - (1.0 - cover)) / cover, 0.0, 1.0) : vec3(0.0);
	}
	vec4 ht = mix(vec4(only * cover, cover), vec4(col, 1.0), paperAlpha);
	return mix(src, ht, amount);
}
`;

const halftoneFx = makeShaderEffect({
	type: 's17-halftone',
	label: 'Halftone',
	body: BODY,
	defaults: {
		mode: 3,
		gridSize: 10,
		dotSize: 1,
		smoothing: 0.15,
		angle: 0,
		blackAmount: 1,
		contrast: 1.1,
		misreg: 0,
		amount: 1,
		paperAlpha: 1,
		paper: [0.957, 0.937, 0.894] as Vec3,
		ink0: [0.15, 0.73, 0.88] as Vec3,
		ink1: [0.88, 0.12, 0.55] as Vec3,
		ink2: [0.97, 0.93, 0.08] as Vec3,
		ink3: [0.1, 0.1, 0.1] as Vec3,
	},
});

/** Print halftone as a Remotion effect: `<Filter effects={[halftone({mode: 'cmyk', size: 10})]}>{scene}</Filter>`. */
export const halftone = ({
	mode = 'cmyk',
	preset = 'newsprint',
	size = 10,
	dot = 1,
	smoothing = 0.15,
	angle = 0,
	black = 1,
	contrast = 1.1,
	misregister = 0,
	amount = 1,
	paper,
	ink = '#1b1630',
}: HalftoneProps = {}) => {
	const set = PRESETS[preset];
	const single = mode === 'mono' || mode === 'lines';
	const inks: [Vec3, Vec3, Vec3, Vec3] = single
		? [hex(ink), [0, 0, 0], [0, 0, 0], [0, 0, 0]]
		: mode === 'rgb'
			? [[1, 0.12, 0.16], [0.1, 1, 0.3], [0.12, 0.3, 1], [0, 0, 0]]
			: [set.c, set.m, set.y, set.k];
	const paperColor = paper === null ? ([1, 1, 1] as Vec3) : hex(paper ?? (mode === 'rgb' ? '#050409' : '#f4efe4'));
	return halftoneFx({
		mode: MODES[mode],
		gridSize: size,
		dotSize: dot,
		smoothing,
		angle,
		blackAmount: black,
		contrast,
		misreg: misregister,
		amount,
		paperAlpha: paper === null ? 0 : 1,
		paper: paperColor,
		ink0: inks[0],
		ink1: inks[1],
		ink2: inks[2],
		ink3: inks[3],
	});
};

const CmykShot: React.FC = () => {
	const frame = useCurrentFrame();
	const amount = interpolate(frame, [0, 5], [0, 1], {extrapolateRight: 'clamp'});
	const dot = interpolate(progress(frame, 0, 34, CURVES.expoOut), [0, 1], [0.12, 1]);
	const misregister = interpolate(progress(frame, 2, 40, CURVES.quintOut), [0, 1], [16, 0.8]);
	return (
		<Filter effects={[halftone({mode: 'cmyk', size: 10, dot, misregister, amount})]}>
			<Plate />
		</Filter>
	);
};

const LineShot: React.FC = () => {
	const frame = useCurrentFrame();
	const size = interpolate(progress(frame, 0, 36, CURVES.inOutCubic), [0, 1], [7, 14]);
	const dot = interpolate(progress(frame, 0, 14, CURVES.expoOut), [0, 1], [0.3, 1]);
	return (
		<Filter effects={[halftone({mode: 'lines', size, dot, paper: '#f6f1e6', ink: '#1a1740', angle: -20, contrast: 1.25})]}>
			<Plate />
		</Filter>
	);
};

const Demo: React.FC = () => (
	<AbsoluteFill>
		<Sequence durationInFrames={60}>
			<CmykShot />
		</Sequence>
		<Sequence from={60}>
			<LineShot />
		</Sequence>
	</AbsoluteFill>
);

export const halftoneEntry: LibraryEntry = {
	meta: {
		id: 'halftone',
		title: 'Halftone',
		category: 'fx',
		looks: 'The scene re-printed as rotated CMYK (or RGB, one-ink dot, ruled line) screens; plates pull into register as the dots grow in.',
		use: 'Comic / retro-print look for a flashback or a stylised hit; animate dot 0 -> 1 and misregister -> 0 for ink-in.',
		exportName: 'halftone',
		durationInFrames: 96,
		source: {
			kind: 'ported',
			name: 'vfx-js halftone',
			url: 'https://github.com/fand/vfx-js/blob/main/packages/effects/src/halftone.ts',
			license: 'MIT',
		},
	},
	Demo,
};
