import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Filter} from '../../core/filter';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {DemoPlate, hitEnvelope, lastHit, lerp, rnd, type HitEnvelope} from './_signal-utils';

/**
 * Per-channel offset ("chromatic split"): red and blue ghosts pull apart, green stays.
 * Linear (one axis, any angle) or radial (0 px at `center`, `amount` px at the horizontal edge, red outward / blue inward).
 * The radial mode generalises the author's own radial split from a finished PV project into a single shader pass
 * (no triple render of the scene).
 */
const defaults = {
	/** px at 720p: how far the red ghost sits from the picture (blue sits the same distance the other way) */
	amount: 14,
	/** degrees, direction the red ghost moves in (0 = right, 90 = up); linear mode */
	angle: 0,
	/** 0 = one straight axis, 1 = radial from `center` (mixes in between) */
	radial: 0,
	/** radial origin, [x, y] as a share of the frame from the top-left */
	center: [0.5, 0.5] as readonly [number, number],
	/** 0 = two hard ghosts, 1 = the ghost smears all the way back into the picture (prism streak) */
	smear: 0.35,
};

export const rgbSplit = makeShaderEffect({
	type: 's17-rgb-split',
	label: 'RGB split',
	defaults,
	body: `
uniform float amount;
uniform float angle;
uniform float radial;
uniform vec2 center;
uniform float smear;

vec4 effect(vec2 uv) {
	float u = min(resolution.x, resolution.y) / 720.0;
	float a = radians(angle);
	// uv shift of the red ghost: linear = a fixed vector, radial = proportional to the distance from the centre
	vec2 lin = vec2(cos(a), sin(a)) * (amount * u) / resolution;
	vec2 c = vec2(center.x, 1.0 - center.y);
	vec2 rad = (uv - c) * (amount * u) / (0.5 * resolution.x);
	vec2 off = mix(lin, rad, radial);

	vec4 g = getColor(uv);
	float r = 0.0;
	float b = 0.0;
	float ar = 0.0;
	float ab = 0.0;
	const int N = 8;
	for (int i = 0; i < N; i++) {
		float t = float(i) / float(N - 1);
		float k = 1.0 - smear * t;
		vec4 sr = getColor(uv - off * k);
		vec4 sb = getColor(uv + off * k);
		r += sr.r;
		ar += sr.a;
		b += sb.b;
		ab += sb.a;
	}
	float inv = 1.0 / float(N);
	return vec4(r * inv, g.g, b * inv, max(g.a, max(ar, ab) * inv));
}`,
});

export type RgbSplitParams = Parameters<typeof rgbSplit>[0];

export type RgbSplitHitOptions = HitEnvelope & {
	/** px at 720p on the hit frame */
	peak?: number;
	/** direction the first ghost goes in, degrees */
	baseAngle?: number;
	/** +- degrees the angle may stray from baseAngle; 180 = any direction */
	spread?: number;
	seed?: number;
};

/**
 * Beat-hit timing: jumps to `peak` on each hit frame, holds, eases back to 0, and picks a new seeded axis for every hit.
 * Spread it into the effect: rgbSplit({...rgbSplitHit(frame, [30, 60, 90]), radial: 0}).
 */
export const rgbSplitHit = (
	frame: number,
	hits: readonly number[],
	{peak = 18, baseAngle = 0, spread = 180, seed = 1, hold = 1, decay = 9, power = 2}: RgbSplitHitOptions = {},
): {amount: number; angle: number} => {
	const h = lastHit(frame, hits);
	if (!h) {
		return {amount: 0, angle: baseAngle};
	}
	return {
		amount: peak * hitEnvelope(frame, h.at, {hold, decay, power}),
		angle: baseAngle + lerp(-spread, spread, rnd(seed, h.at, 7)),
	};
};

// irregular on purpose: some stills land on a fresh hit, some on the tail, so the ease-back reads
const HITS = [4, 15, 27, 33, 51, 62];

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const h = lastHit(frame, HITS);
	const index = h ? h.index : 0;
	// every third hit is radial and bigger; the others pick a new seeded axis, mostly horizontal
	const radial = index % 3 === 2;
	const hit = rgbSplitHit(frame, HITS, {peak: radial ? 30 : 20, baseAngle: 0, spread: 50, seed: 5, decay: 10});
	return (
		<Filter effects={[rgbSplit({...hit, radial: radial ? 1 : 0, smear: radial ? 0.2 : 0.4})]}>
			<DemoPlate scale={1 + 0.035 * (h ? hitEnvelope(frame, h.at, {decay: 8}) : 0)} />
		</Filter>
	);
};

export const rgbSplitEntry: LibraryEntry = {
	meta: {
		id: 'rgb-split',
		title: 'RGB split',
		category: 'fx',
		looks: 'Red and blue ghosts jump apart on a beat (any angle, or radial from the centre) and ease back, green stays put.',
		use: 'Every hit in a hype PV: on a downbeat, a title slam, a cut; keep amount 0 in between.',
		exportName: 'rgbSplit',
		durationInFrames: 72,
		source: {kind: 'original'},
	},
	Demo,
};
