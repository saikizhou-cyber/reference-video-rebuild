import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {Filter} from '../../core/filter';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {DemoPlate, GLSL_HASH, frameClock, glitchBursts} from './_signal-utils';

/**
 * Worn VHS tape in one pass. Own shader, written from the visual description of tape filters such as Remocn's
 * vhs-filter (MIT; none of its code is used): Y/C separation with a one-sided colour smear, per-line wobble, a head-switch tear
 * at the bottom, a tracking band that crawls up the picture, horizontal tape noise and a tired grade.
 * Pass `time` (seconds) and `seed` (frame) from the frame:
 *   vhs(vhsAt(frame, fps))
 */
const defaults = {
	/** seconds: moves the sway and the tracking band; use vhsAt() */
	time: 0,
	/** integer that re-rolls the line jitter and the noise; use vhsAt() */
	seed: 0,
	/** 0..2 master scale of wobble, tear, band and noise (0 = only colour smear and grade) */
	amount: 1,
	/** px at 720p: how far colour smears to the right of an edge */
	bleed: 14,
	/** px at 720p: line-to-line horizontal jitter */
	wobble: 2.4,
	/** 0..1 head-switch noise: the bottom lines skew and fill with static */
	tear: 0.8,
	/** 0..1 tracking band: a smeared, noisy stripe that crawls up the picture */
	track: 0.7,
	/** screen heights per second the band crawls up */
	trackSpeed: 0.25,
	/** 0..1 where the band starts (from the top) at time 0 */
	trackPhase: 0.6,
	/** 0..1 horizontal tape noise and white dropout dashes */
	noise: 0.5,
	/** 0..1 tape grade: lifted blacks, tired saturation, a cool cast */
	tone: 0.6,
	/** 0..1 depth of the dark interlace lines */
	scan: 0.35,
	/** scan lines across the frame height */
	lines: 360,
};

export const vhs = makeShaderEffect({
	type: 's17-vhs',
	label: 'VHS',
	defaults,
	body: `${GLSL_HASH}
uniform float time;
uniform float seed;
uniform float amount;
uniform float bleed;
uniform float wobble;
uniform float tear;
uniform float track;
uniform float trackSpeed;
uniform float trackPhase;
uniform float noise;
uniform float tone;
uniform float scan;
uniform float lines;

vec3 rgb2yiq(vec3 c) {
	return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.5959, -0.2746, -0.3213)), dot(c, vec3(0.2115, -0.5227, 0.3112)));
}
vec3 yiq2rgb(vec3 c) {
	return vec3(c.x + 0.956 * c.y + 0.619 * c.z, c.x - 0.272 * c.y - 0.647 * c.z, c.x - 1.106 * c.y + 1.703 * c.z);
}

vec4 effect(vec2 uv) {
	float u = min(resolution.x, resolution.y) / 720.0;
	float yTop = 1.0 - uv.y;
	float ln = floor(yTop * lines);
	uint s = uf(seed);
	uint L = uf(ln);

	// 1. line wobble: small jitter on every line, a jerk on a few, and a slow sway of the whole picture
	float jit = (hf(hu3(L, s, 1u)) - 0.5) * 2.0 * 0.35;
	jit *= hf(hu3(L, s, 2u)) > 0.985 ? 6.0 : 1.0;
	float sway = sin(yTop * 9.0 + time * 1.7) * 0.5 + sin(yTop * 23.0 - time * 2.9) * 0.25;
	float dx = (jit + sway * 0.6) * wobble * amount;

	// 2. head-switch zone at the bottom: lines skew and tear
	float z = smoothstep(0.915, 1.0, yTop);
	float zr = (hf(hu3(L, s, 3u)) - 0.5) * 2.0;
	dx += (zr * 60.0 * pow(z, 1.5) - 34.0 * z * z) * tear * amount;

	// 3. tracking band: crawls up, lines inside it slide and fill with noise
	float yb = fract(trackPhase - time * trackSpeed);
	float d = yTop - yb;
	d -= floor(d + 0.5);
	float wb = exp(-d * d / (0.045 * 0.045)) * track * amount;
	float br = (hf(hu3(L, s, 4u)) - 0.5) * 2.0;
	dx += (br * 42.0 + 10.0) * wb;

	float sx = uv.x + dx * u / resolution.x;

	// Y/C separation: luma stays sharp, chroma trails to the right of the edge
	float px = u / resolution.x;
	vec4 centre = getColor(vec2(sx, uv.y));
	// VHS luma is soft horizontally: 5 taps over about +-2 px
	float luma = rgb2yiq(centre.rgb).x * 0.4;
	luma += 0.2 * (rgb2yiq(getColor(vec2(sx - px, uv.y)).rgb).x + rgb2yiq(getColor(vec2(sx + px, uv.y)).rgb).x);
	luma += 0.1 * (rgb2yiq(getColor(vec2(sx - 2.0 * px, uv.y)).rgb).x + rgb2yiq(getColor(vec2(sx + 2.0 * px, uv.y)).rgb).x);
	vec2 chroma = vec2(0.0);
	float wsum = 0.0;
	for (int i = 0; i < 12; i++) {
		float t = float(i) / 11.0;
		float w = 1.0 - 0.75 * t;
		chroma += rgb2yiq(getColor(vec2(sx - (bleed * t + 1.5) * px, uv.y)).rgb).yz * w;
		wsum += w;
	}
	chroma /= wsum;

	// grade: lifted blacks, tired colour
	float sat = mix(1.0, 0.82, tone);
	luma = luma * (1.0 - 0.07 * tone) + 0.035 * tone;
	vec3 col = yiq2rgb(vec3(luma, chroma * sat));
	col += vec3(-0.012, 0.0, 0.022) * tone;

	// tape noise: streaks wider than tall, re-rolled with the seed
	float cell = floor(uv.x * resolution.x / (3.0 * u));
	float n = hf(hu3(uint(cell) + L * 7919u, s, 5u)) - 0.5;
	col += n * 0.11 * noise * amount * (1.0 + 2.2 * z * tear + 3.0 * wb);
	// inside the head-switch zone and the band the picture is eaten by static
	float static_ = clamp(z * z * tear * 1.2 + wb * 0.9, 0.0, 1.0) * amount;
	col = mix(col, vec3(luma * 0.5 + 0.25 + n * 0.9), static_ * 0.5);
	// white dropout dashes
	float dash = hf(hu3(L, s, 6u));
	float x0 = hf(hu3(L, s, 7u));
	float len = 0.02 + 0.14 * hf(hu3(L, s, 8u));
	float inDash = step(0.992 - 0.01 * noise, dash) * step(x0, uv.x) * step(uv.x, x0 + len);
	col += inDash * 0.55 * noise * amount;

	// interlace lines
	float odd = step(0.5, fract(yTop * lines * 0.5));
	col *= 1.0 - 0.14 * scan * odd;

	float a = centre.a;
	return vec4(clamp(col, 0.0, 1.0) * a, a);
}`,
});

export type VhsParams = Parameters<typeof vhs>[0];

/** time + seed from the frame: the two values every frame-driven effect needs */
export const vhsAt = frameClock;

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	// the tape gets worse in short bursts
	const burst = glitchBursts(frame, {seed: 8, gap: [8, 16], length: [4, 8], peak: [0.6, 1]});
	return (
		<Filter effects={[vhs({...vhsAt(frame, fps), amount: 0.85 + 0.9 * burst.intensity, trackSpeed: 0.4, trackPhase: 0.85})]}>
			<DemoPlate />
		</Filter>
	);
};

export const vhsEntry: LibraryEntry = {
	meta: {
		id: 'vhs',
		title: 'VHS tape',
		category: 'fx',
		looks: 'Colour smears right off every edge, lines wobble, a noisy band crawls up and the bottom tears like a worn tape.',
		use: 'Found-footage and flashback shots, a retro-tech section, a recorded-message insert.',
		exportName: 'vhs',
		durationInFrames: 72,
		source: {kind: 'inspired', name: 'Remocn VHS Tape filter', url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/vhs-filter/index.tsx'},
	},
	Demo,
};
