// Ported from Codrops Interlude ink transition (https://github.com/codrops/interlude/blob/main/src/transitions/ink.ts), MIT, Copyright (c) 2026 Codrops. Changes: the three.js TSL shader is translated by hand to a gl-transitions style GLSL body (makeGlTransition) where one progress runs the cover then the reveal, MaterialX fractal noise replaced by our own integer-hash gradient fbm, GSAP tweens replaced by in-shader eases, origin / colour / ragged / softness / seed exposed as props.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import {DEMO} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {CODROPS_NOISE_GLSL, CODROPS_PHASE_GLSL} from './_codrops-utils';
import {hexToRgb, makeTransitionDemo} from './_gl-utils';

export type InkBlotProps = {
	/** where the ink starts, [x, y] as 0..1 of the frame (y counted from the top). Default [0.5, 0.5] */
	origin?: readonly [number, number];
	/** ink colour, '#rrggbb'. Default '#ff4d1c' */
	color?: string;
	/** how ragged the edge is (0 = a clean circle, 0.25 = default, 0.5 = very torn) */
	ragged?: number;
	/** width of the edge gradient as a share of the frame height (0 = crisp). Default 0.02 */
	softness?: number;
	/** another seed = another ragged shape (integer) */
	seed?: number;
};

const BODY = `
uniform vec2 origin;
uniform vec3 color;
uniform float ragged;
uniform float softness;
uniform float seed;
${CODROPS_NOISE_GLSL}
${CODROPS_PHASE_GLSL}

vec4 transition(vec2 uv) {
	float p;
	float rev;
	cPhase(progress, 2.0, 2.0, false, p, rev);

	// positions in frame heights: y from 0 (top) to 1 (bottom), x from 0 to ratio
	vec2 position = vec2(uv.x * ratio, 1.0 - uv.y);
	vec2 o = vec2(origin.x * ratio, origin.y);
	float reach = length(max(o, vec2(ratio, 1.0) - o));

	// distance from the origin (0 there, 1 at the farthest corner) roughened by noise; the hole gets its own noise slice
	float dist = length(position - o) / reach;
	float noise = cFbm(vec3(position * 2.5, rev * 5.0), seed);
	// kept within the thresholds' range, so the cover always closes
	float field = clamp(dist + noise * ragged, -0.08, 1.15);

	float blot = cBelow(field, mix(-0.1, 1.2, p), softness);
	float hole = cBelow(field, mix(1.2, -0.1, p), softness);
	float alpha = mix(blot, 1.0 - hole, rev);
	return cComposite(uv, rev, p, color, alpha);
}`;

const make = makeGlTransition(BODY, {
	origin: [0.5, 0.5] as readonly [number, number],
	color: hexToRgb('#ff4d1c') as readonly [number, number, number],
	ragged: 0.25,
	softness: 0.02,
	seed: 0,
});

/**
 * A coloured blot spreads from `origin` with a ragged noise edge until it fills the frame (first half), then a ragged hole opens
 * from the same spot and pushes the ink out past the edges (second half), uncovering B.
 * Ease in-out while covering, ease out while revealing, so it works with linearTiming; 36-60 frames feels right.
 */
export const inkBlot = (props: InkBlotProps = {}) => {
	const {color, ...rest} = props;
	return make({...rest, ...(color === undefined ? {} : {color: hexToRgb(color)})});
};

const Demo = makeTransitionDemo(
	[
		{
			presentation: inkBlot({color: DEMO.yellow, origin: [0.3, 0.62], ragged: 0.28}),
			durationInFrames: 60,
			timing: linearTiming({durationInFrames: 60}),
		},
	],
	6,
	6,
);

export const inkBlotEntry: LibraryEntry = {
	meta: {
		id: 'ink-blot',
		title: 'Ink blot',
		category: 'transitions',
		looks: 'A coloured ink blot spreads from a point with a ragged, smoky edge until it swallows the frame, then a ragged hole opens from the same spot and pushes the ink out past the edges onto the next scene.',
		use: 'A hard scene change that wants a graphic, hand-made feel: title card to gameplay, chapter breaks, a hit or a blackout beat, ink / blood / paint themes. Set origin to where the action is.',
		exportName: 'inkBlot',
		durationInFrames: 72,
		source: {
			kind: 'ported',
			name: 'Codrops Interlude ink',
			url: 'https://github.com/codrops/interlude/blob/main/src/transitions/ink.ts',
			license: 'MIT',
		},
	},
	Demo,
};
