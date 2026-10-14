// Ported from glfx.js "Ink" (https://github.com/evanw/glfx.js/blob/master/src/filters/fun/ink.js), MIT, Copyright (C) 2011 by Evan Wallace,
// and from vfx-js "Colored edges" (https://github.com/fand/vfx-js/blob/main/packages/effects/src/colored-edges.ts), MIT, Copyright (c) 2020-present The VFX-JS developers.
// Changes: both merged into one makeShaderEffect body (mode ink | neon), tap spacing in 720p units, ink colour / paper / line-only / amount added,
// ink composited with mix() instead of subtraction and alpha-aware (silhouettes of cut-outs get an outline), neon colours as props.
import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Filter} from '../../core/filter';
import {Plate} from '../../core/scene';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {hex, type Vec3} from './_look-utils';

export type InkEdgesProps = {
	/** ink = dark pen lines along contours (difference of two blurs); neon = Sobel edges in a two-colour gradient on a flat background */
	mode?: 'ink' | 'neon';
	/** ink: 0..1, raised to the 5th power as in glfx.js, so 0.3 is light and 0.55 is heavy */
	strength?: number;
	/** width of the edge kernel in px at 720p */
	thickness?: number;
	/** ink: how much of the ink lands (0..1) */
	amount?: number;
	/** ink: colour of the line */
	color?: string;
	/** ink: 0 = lines over the scene, 1 = lines on flat `paper` only (line art) */
	lineOnly?: number;
	paper?: string;
	/** neon: edge gradient (weak -> strong), background, source blended back in (0..1), cut-off and gain */
	color1?: string;
	color2?: string;
	background?: string;
	opacity?: number;
	/** neon: soft halo around the lines (0..1) */
	glow?: number;
	threshold?: number;
	intensity?: number;
};

const BODY = `
uniform float mode;
uniform float strength;
uniform float thickness;
uniform float amount;
uniform float lineOnly;
uniform float threshold;
uniform float intensity;
uniform float opacity;
uniform float glow;
uniform vec3 inkColor;
uniform vec3 paper;
uniform vec3 color1;
uniform vec3 color2;
uniform vec3 background;

vec4 inkLines(vec2 uv) {
	float un = resolution.y / 720.0;
	vec2 d = vec2(thickness * un) / resolution;
	vec4 c = getColor(uv);
	vec3 bigSum = vec3(0.0);
	vec3 smallSum = vec3(0.0);
	for (int ix = -2; ix <= 2; ix++) {
		for (int iy = -2; iy <= 2; iy++) {
			vec3 s = getColor(uv + vec2(float(ix), float(iy)) * d).rgb;
			bigSum += s;
			if (abs(ix) + abs(iy) < 2) { smallSum += s; }
		}
	}
	vec3 edge = max(vec3(0.0), bigSum / 25.0 - smallSum / 5.0);
	float a = clamp(dot(edge, edge) * pow(strength, 5.0) * 100000.0, 0.0, 1.0) * amount;
	vec4 base = mix(c, vec4(paper, 1.0), lineOnly);
	return vec4(inkColor, 1.0) * a + base * (1.0 - a);
}

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Sobel magnitude of the luminance with the kernel spread by d (uv units)
float sobel(vec2 uv, vec2 d) {
	float tl = lum(getColor(uv + vec2(-d.x, d.y)).rgb);
	float tc = lum(getColor(uv + vec2(0.0, d.y)).rgb);
	float tr = lum(getColor(uv + vec2(d.x, d.y)).rgb);
	float ml = lum(getColor(uv + vec2(-d.x, 0.0)).rgb);
	float mr = lum(getColor(uv + vec2(d.x, 0.0)).rgb);
	float bl = lum(getColor(uv + vec2(-d.x, -d.y)).rgb);
	float bc = lum(getColor(uv + vec2(0.0, -d.y)).rgb);
	float br = lum(getColor(uv + vec2(d.x, -d.y)).rgb);
	float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
	float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
	return length(vec2(gx, gy));
}

vec4 neonEdges(vec2 uv) {
	float un = resolution.y / 720.0;
	vec2 d = vec2(thickness * un) / resolution;
	float g = sobel(uv, d);
	float e = clamp(g * intensity - threshold, 0.0, 1.0);
	vec3 edgeCol = mix(color1, color2, clamp(g, 0.0, 1.0));
	vec3 base = mix(background, edgeCol, e);
	if (glow > 0.0) {
		// the same detector with a 4x wider kernel gives a soft halo around the lines
		float gw = sobel(uv, d * 4.0);
		float ew = clamp(gw * intensity * 0.5 - threshold, 0.0, 1.0);
		base += mix(color1, color2, clamp(gw, 0.0, 1.0)) * ew * glow * 0.45 * (1.0 - e);
	}
	return vec4(mix(base, getColor(uv).rgb, opacity), 1.0);
}

vec4 effect(vec2 uv) {
	return mode < 0.5 ? inkLines(uv) : neonEdges(uv);
}
`;

const inkEdgesFx = makeShaderEffect({
	type: 's17-ink-edges',
	label: 'Ink edges',
	body: BODY,
	defaults: {
		mode: 0,
		strength: 0.45,
		thickness: 2,
		amount: 1,
		lineOnly: 0,
		threshold: 0.2,
		intensity: 4,
		opacity: 0,
		glow: 0.6,
		inkColor: [0.03, 0.025, 0.06] as Vec3,
		paper: [0.96, 0.94, 0.9] as Vec3,
		color1: [1, 0.18, 0.43] as Vec3,
		color2: [0.16, 0.88, 1] as Vec3,
		background: [0.02, 0.012, 0.05] as Vec3,
	},
});

/** Ink outline / neon edges as a Remotion effect: `<Filter effects={[inkEdges({strength: 0.45})]}>{scene}</Filter>`. */
export const inkEdges = ({
	mode = 'ink',
	strength = 0.45,
	thickness,
	amount = 1,
	color = '#08060f',
	lineOnly = 0,
	paper = '#f5f0e6',
	color1 = '#ff2e6e',
	color2 = '#29e0ff',
	background = '#05030d',
	opacity = 0,
	glow = 0.6,
	threshold = 0.2,
	intensity = 4,
}: InkEdgesProps = {}) =>
	inkEdgesFx({
		mode: mode === 'ink' ? 0 : 1,
		strength,
		thickness: thickness ?? (mode === 'ink' ? 2 : 2.5),
		glow,
		amount,
		lineOnly,
		threshold,
		intensity,
		opacity,
		inkColor: hex(color),
		paper: hex(paper),
		color1: hex(color1),
		color2: hex(color2),
		background: hex(background),
	});

const InkShot: React.FC = () => {
	const frame = useCurrentFrame();
	const amount = progress(frame, 0, 12, CURVES.snap);
	const lineOnly = progress(frame, 28, 18, CURVES.inOutCubic);
	return (
		<Filter effects={[inkEdges({mode: 'ink', strength: 0.5, amount, lineOnly})]}>
			<Plate />
		</Filter>
	);
};

const NeonShot: React.FC = () => {
	const frame = useCurrentFrame();
	const opacity = interpolate(frame, [0, 20], [1, 0], {extrapolateRight: 'clamp', easing: CURVES.expoOut});
	return (
		<Filter effects={[inkEdges({mode: 'neon', opacity})]}>
			<Plate />
		</Filter>
	);
};

const Demo: React.FC = () => (
	<AbsoluteFill>
		<Sequence durationInFrames={54}>
			<InkShot />
		</Sequence>
		<Sequence from={54}>
			<NeonShot />
		</Sequence>
	</AbsoluteFill>
);

export const inkEdgesEntry: LibraryEntry = {
	meta: {
		id: 'ink-edges',
		title: 'Ink edges',
		category: 'fx',
		looks: 'Pen-ink lines snap onto every contour, the colour falls away to leave line art on paper; then a second shot redraws the scene as pink-to-cyan neon contours on black.',
		use: 'Comic / anime outline over any scene, a blueprint or sketch reveal, neon wireframe for a hacker or night-city beat.',
		exportName: 'inkEdges',
		durationInFrames: 96,
		source: {
			kind: 'ported',
			name: 'glfx.js ink + vfx-js colored-edges',
			url: 'https://github.com/evanw/glfx.js/blob/master/src/filters/fun/ink.js',
			license: 'MIT',
		},
	},
	Demo,
};
