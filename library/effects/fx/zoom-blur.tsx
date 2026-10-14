// Ported from glfx.js (https://github.com/evanw/glfx.js), MIT, Copyright (C) 2011 Evan Wallace. Changes: GLSL ES 3.00 for makeShaderEffect; the sin-hash used to jitter the sample offset is an integer hash seeded from the frame; samples are already premultiplied so the alpha round-trip is dropped; centre given from the top-left; optional chroma split along the streaks and a clear focus zone added; hit envelope helper added.
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Filter} from '../../core/filter';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {DemoPlate, GLSL_HASH, hitEnvelope, lastHit, type HitEnvelope} from './_signal-utils';

/**
 * Radial zoom blur toward a centre (glfx.js "Zoom Blur"): 41 samples along the line from each pixel to the centre,
 * weighted 4 (p - p^2) so the middle of the line counts most, the start offset jittered per pixel to hide the fixed sample
 * count. The picture streaks outward from the centre like a fast dolly or warp speed.
 * strength 0.1-0.3 is a punch, 0.5+ is extreme. `center` is [x, y] from the TOP-LEFT as a share of the frame.
 */
const defaults = {
	/** 0 = nothing, 0.1-0.3 punch-in, 0.5+ extreme */
	strength: 0.2,
	/** [x, y] share of the frame from the top-left: the point everything streaks away from */
	center: [0.5, 0.5] as readonly [number, number],
	/** 0..0.3 red streaks longer and blue shorter by this share: a colour fringe along the blur */
	chroma: 0.06,
	/** 0..1 radius around the centre (as a share of the half-height) where the blur fades out, keeps the subject sharp */
	focus: 0.08,
	/** integer that re-rolls the sample jitter: pass the frame */
	seed: 1,
};

export const zoomBlur = makeShaderEffect({
	type: 's17-zoom-blur',
	label: 'Zoom blur',
	defaults,
	body: `${GLSL_HASH}
uniform float strength;
uniform vec2 center;
uniform float chroma;
uniform float focus;
uniform float seed;

vec4 effect(vec2 uv) {
	vec2 c = vec2(center.x, 1.0 - center.y);
	vec2 toCenter = c - uv;
	float aspect = resolution.x / resolution.y;
	float k = focus > 0.0 ? smoothstep(0.0, focus, length(toCenter * vec2(aspect, 1.0)) * 2.0) : 1.0;
	float st = strength * k;

	// randomize the lookup values to hide the fixed number of samples
	uvec2 p = uvec2(uv * resolution);
	float offset = hf(hu3(p.x, p.y, uf(seed)));

	vec4 color = vec4(0.0);
	float total = 0.0;
	for (float t = 0.0; t <= 40.0; t++) {
		float percent = (t + offset) / 40.0;
		float weight = 4.0 * (percent - percent * percent);
		vec2 d = toCenter * percent * st;
		vec4 sg = getColor(uv + d);
		vec4 sr = chroma > 0.0 ? getColor(uv + d * (1.0 + chroma)) : sg;
		vec4 sb = chroma > 0.0 ? getColor(uv + d * (1.0 - chroma)) : sg;
		color += vec4(sr.r, sg.g, sb.b, sg.a) * weight;
		total += weight;
	}
	return color / total;
}`,
});

export type ZoomBlurParams = Parameters<typeof zoomBlur>[0];

export type ZoomBlurHitOptions = HitEnvelope & {
	/** strength on the hit frame */
	peak?: number;
};

/** Punch-in timing: strength jumps to `peak` on each hit frame, holds, and eases back to 0. Pair it with a scale punch on the scene. */
export const zoomBlurHit = (frame: number, hits: readonly number[], {peak = 0.3, hold = 1, decay = 9, power = 2}: ZoomBlurHitOptions = {}): number => {
	const h = lastHit(frame, hits);
	return h ? peak * hitEnvelope(frame, h.at, {hold, decay, power}) : 0;
};

const HITS = [4, 16, 28, 40, 52, 64];
// alternate between the figure and the sun
const CENTERS = [
	[0.3, 0.5],
	[0.72, 0.3],
	[0.3, 0.5],
	[0.72, 0.3],
	[0.3, 0.5],
	[0.72, 0.3],
] as const;

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const h = lastHit(frame, HITS);
	const index = h ? h.index : 0;
	const center = CENTERS[index % CENTERS.length];
	const env = h ? hitEnvelope(frame, h.at, {hold: 1, decay: 9, power: 1.6}) : 0;
	return (
		<Filter effects={[zoomBlur({strength: 0.2 * env, center, seed: frame})]}>
			<DemoPlate scale={1 + 0.04 * env} origin={center} />
		</Filter>
	);
};

export const zoomBlurEntry: LibraryEntry = {
	meta: {
		id: 'zoom-blur',
		title: 'Zoom blur',
		category: 'fx',
		looks: 'The picture streaks outward from a point, a fast dolly-in smear that snaps back sharp, with a faint colour fringe.',
		use: 'Punch-ins on a beat, whip into a title, impact on a character; set the centre on the subject.',
		exportName: 'zoomBlur',
		durationInFrames: 72,
		source: {kind: 'ported', name: 'glfx.js (Zoom Blur)', url: 'https://github.com/evanw/glfx.js', license: 'MIT'},
	},
	Demo,
};
