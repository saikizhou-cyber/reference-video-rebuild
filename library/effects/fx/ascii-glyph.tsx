// Ported from ascii-logo (https://github.com/edoardolunardi/ascii-logo/blob/main/src/ascii-logo/shaders/cell.frag.glsl, with glyph-atlas.js and post.frag.glsl), MIT, Copyright (c) 2009 - 2026 Codrops (https://codrops.com). Changes: the cell pass and the glyph pass are one makeShaderEffect body; glyphs are procedural signed-distance shapes in GLSL (no system font, no atlas) with their six-point shape vectors baked from the same primitives; 34 glyphs instead of the 95 ASCII ones; fewer taps per sample point; contrast, edge bias, gain, stroke weight, tint, backdrop and amount are props; sizes in px at 720p.
import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Filter} from '../../core/filter';
import {Plate} from '../../core/scene';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {GLYPH_ASPECT, OUTER_POINTS, SAMPLE_POINTS, SAMPLE_RADIUS, STROKE, glyphGlsl} from './_codrops-utils';

type Vec3 = readonly [number, number, number];

export type AsciiGlyphProps = {
	/** cell height in px at 720p (a cell is half as wide); 8-12 = fine print, 24+ = chunky */
	cell?: number;
	/** glyph colour; null = tinted by the scene (each glyph takes the colour of the picture under it) */
	color?: string | null;
	/** colour behind the glyphs; null = transparent, glyphs only */
	background?: string | null;
	/** exponent that pulls the six tone values of a cell apart before the search: > 1 crisper shapes and darker mids, 1 = soft */
	contrast?: number;
	/** how hard a sample point that is darker than the neighbours beyond the cell is pushed down, so glyphs follow edges; 1 = off, 3 = default */
	edge?: number;
	/** brightness of the picture before the search; > 1 prints more ink */
	gain?: number;
	/** stroke thickness multiplier (1 = nominal, small cells always keep ~1 px strokes) */
	weight?: number;
	/** 0..1, how much of the scene colour the cell background carries (needs a background colour) */
	backdrop?: number;
	/** 0 = the scene, 1 = full print */
	amount?: number;
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

const v2 = (p: readonly [number, number]) => `vec2(${p[0]}, ${p[1]})`;

const BODY = `
uniform float cellPx;
uniform float contrast;
uniform float edge;
uniform float gain;
uniform float weight;
uniform float backdrop;
uniform float amount;
uniform float tint;
uniform float bgAlpha;
uniform vec3 inkColor;
uniform vec3 bgColor;

const float ASPECT = ${GLYPH_ASPECT};
const float STROKE = ${STROKE};
const float SAMPLE_RADIUS = ${SAMPLE_RADIUS};
${glyphGlsl()}
const vec2 INNER[6] = vec2[6](${SAMPLE_POINTS.map(v2).join(', ')});
const vec2 OUTER[10] = vec2[10](${OUTER_POINTS.map(v2).join(', ')});
const vec2 DIAG[4] = vec2[4](vec2(0.7071, 0.7071), vec2(-0.7071, 0.7071), vec2(-0.7071, -0.7071), vec2(0.7071, -0.7071));
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec2 cellOrigin; // px from the top-left of the frame
vec2 cellSize;
float ch;

// one tap at a pixel position measured from the top-left (the cell grid counts rows from the top)
vec4 tap(vec2 pd) {
	vec2 uv = vec2(pd.x / resolution.x, 1.0 - pd.y / resolution.y);
	if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
		return vec4(0.0);
	}
	return getColor(uv);
}

// average of four taps around a point of the cell (u, v as shares of the cell)
vec4 around(vec2 c) {
	vec2 mid = cellOrigin + c * cellSize;
	float r = ch * SAMPLE_RADIUS;
	return (tap(mid + DIAG[0] * r) + tap(mid + DIAG[1] * r) + tap(mid + DIAG[2] * r) + tap(mid + DIAG[3] * r)) * 0.25;
}

float lumOf(vec4 a) {
	return clamp(dot(a.rgb / max(a.a, 1e-4), LUMA), 0.0, 1.0) * a.a;
}

float dirContrast(float value, float ext) {
	float peak = max(value, ext);
	if (peak < 1e-4) {
		return value;
	}
	return pow(value / peak, edge) * peak;
}

vec4 effect(vec2 uv) {
	float un = min(resolution.x, resolution.y) / 720.0;
	ch = max(cellPx * un, 3.0);
	cellSize = vec2(ch * ASPECT, ch);
	vec2 pd = vec2(uv.x * resolution.x, (1.0 - uv.y) * resolution.y);
	vec2 cell = floor(pd / cellSize);
	cellOrigin = cell * cellSize;
	vec2 local = pd / cellSize - cell;

	// six tone values + the average colour of the cell
	float v[6];
	vec3 colAcc = vec3(0.0);
	float alphaAcc = 0.0;
	for (int i = 0; i < 6; i++) {
		vec4 a = around(INNER[i]);
		v[i] = clamp(lumOf(a) * gain, 0.0, 1.0);
		colAcc += a.rgb;
		alphaAcc += a.a;
	}
	// ten points around the cell: only used to find which way an edge runs through it
	float e[10];
	for (int i = 0; i < 10; i++) {
		e[i] = clamp(lumOf(tap(cellOrigin + OUTER[i] * cellSize)) * gain, 0.0, 1.0);
	}
	v[0] = dirContrast(v[0], max(max(e[0], e[1]), max(e[2], e[4])));
	v[1] = dirContrast(v[1], max(max(e[0], e[1]), max(e[3], e[5])));
	v[2] = dirContrast(v[2], max(e[2], max(e[4], e[6])));
	v[3] = dirContrast(v[3], max(e[3], max(e[5], e[7])));
	v[4] = dirContrast(v[4], max(max(e[4], e[6]), max(e[8], e[9])));
	v[5] = dirContrast(v[5], max(max(e[5], e[7]), max(e[8], e[9])));
	float peak = max(max(max(v[0], v[1]), max(v[2], v[3])), max(v[4], v[5]));
	if (peak > 1e-4) {
		for (int i = 0; i < 6; i++) {
			v[i] = pow(v[i] / peak, contrast) * peak;
		}
	}

	// nearest glyph by shape
	int best = 0;
	float bestD = 1e9;
	for (int g = 0; g < GLYPH_COUNT; g++) {
		float d = 0.0;
		for (int i = 0; i < 6; i++) {
			float diff = v[i] - SHAPES[g * 6 + i];
			d += diff * diff;
		}
		if (d < bestD) {
			bestD = d;
			best = g;
		}
	}

	// draw it: signed distance in cell heights, anti-aliased over one pixel
	vec2 p = vec2((local.x - 0.5) * ASPECT, local.y - 0.5);
	float T = max(STROKE * weight, 1.15 / ch);
	float cover = clamp(0.5 - glyphSd(best, p, T, weight) * ch, 0.0, 1.0);

	vec3 avg = colAcc / max(alphaAcc, 1e-4);
	vec3 ink = mix(inkColor, avg / max(max(avg.r, max(avg.g, avg.b)), 0.3), tint);
	vec4 print;
	if (bgAlpha > 0.5) {
		vec3 bg = mix(bgColor, avg * 0.35, backdrop);
		print = vec4(mix(bg, ink, cover), 1.0);
	} else {
		print = vec4(ink * cover, cover);
	}
	return mix(getColor(uv), print, amount);
}
`;

const asciiGlyphFx = makeShaderEffect({
	type: 's17-ascii-glyph',
	label: 'ASCII glyph',
	body: BODY,
	defaults: {
		cellPx: 10,
		contrast: 1.5,
		edge: 3,
		gain: 1,
		weight: 1,
		backdrop: 0,
		amount: 1,
		tint: 0,
		bgAlpha: 1,
		inkColor: [0.9, 1, 0.92] as Vec3,
		bgColor: [0.02, 0.03, 0.04] as Vec3,
	},
});

/**
 * Prints the picture as characters, picking each glyph by how well its SHAPE matches the tone pattern of the cell
 * (six sample points and the edge direction), not by average brightness:
 * `<Filter effects={[asciiGlyph({cell: 10, color: '#9dffcb'})]}>{scene}</Filter>`.
 */
export const asciiGlyph = ({
	cell = 10,
	color = '#d9fbe6',
	background = '#04070a',
	contrast = 1.5,
	edge = 3,
	gain = 1,
	weight = 1,
	backdrop = 0,
	amount = 1,
}: AsciiGlyphProps = {}) =>
	asciiGlyphFx({
		cellPx: cell,
		contrast,
		edge,
		gain,
		weight,
		backdrop,
		amount,
		tint: color === null ? 1 : 0,
		bgAlpha: background === null ? 0 : 1,
		inkColor: color === null ? [1, 1, 1] : hex(color),
		bgColor: background === null ? [0, 0, 0] : hex(background),
	});

const MonoShot: React.FC = () => {
	const frame = useCurrentFrame();
	const cell = interpolate(progress(frame, 0, 44, CURVES.quintOut), [0, 1], [40, 12]);
	const amount = interpolate(frame, [0, 6], [0, 1], {extrapolateRight: 'clamp'});
	return (
		<Filter effects={[asciiGlyph({cell, color: '#a8ffd0', background: '#03070a', gain: 1.25, amount})]}>
			<Plate />
		</Filter>
	);
};

const TintShot: React.FC = () => {
	const frame = useCurrentFrame();
	const cell = interpolate(progress(frame, 0, 44, CURVES.inOutCubic), [0, 1], [18, 11]);
	return (
		<Filter effects={[asciiGlyph({cell, color: null, background: '#05040c', backdrop: 0.45, gain: 1.3, weight: 1.15})]}>
			<Plate />
		</Filter>
	);
};

const Demo: React.FC = () => (
	<AbsoluteFill>
		<Sequence durationInFrames={48}>
			<MonoShot />
		</Sequence>
		<Sequence from={48}>
			<TintShot />
		</Sequence>
	</AbsoluteFill>
);

export const asciiGlyphEntry: LibraryEntry = {
	meta: {
		id: 'ascii-glyph',
		title: 'ASCII glyph',
		category: 'fx',
		looks: 'The picture re-printed as terminal characters, each cell choosing the glyph whose shape fits its tones and edges (strokes follow outlines); mono phosphor or tinted by the scene.',
		use: 'Hacker / terminal / system-scan look for a flashback, a data feed or a reveal; animate cell from big to small for a picture that resolves into detail.',
		exportName: 'asciiGlyph',
		durationInFrames: 96,
		source: {
			kind: 'ported',
			name: 'ascii-logo',
			url: 'https://github.com/edoardolunardi/ascii-logo/blob/main/src/ascii-logo/shaders/cell.frag.glsl',
			license: 'MIT',
		},
	},
	Demo,
};
