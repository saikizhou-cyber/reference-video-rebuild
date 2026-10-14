// Ported from gl-transitions pixelize.glsl by gre (https://github.com/gl-transitions/gl-transitions/blob/master/transitions/pixelize.glsl), MIT, Copyright (c) 2017-present gl-transitions contributors (shader by gre, forked from https://gist.github.com/benraziel/c528607361d90a072e98). Changes: uniforms as floats, globals moved into transition(), 16:9 square blocks by default, per-block swap time with a sharp swap at the coarsest grid instead of a full-length crossfade.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import type {LibraryEntry} from '../../core/types';
import {makeTransitionDemo} from './_gl-utils';

export type PixelateProps = {
	/** squares across / down at the coarsest point (32 x 18 = square blocks on 16:9) */
	squaresMin?: readonly [number, number];
	/** block size is quantised into this many steps so it visibly ticks; 0 = smooth */
	steps?: number;
	/** how far apart in time the blocks flip A -> B (0 = all blocks flip together at the midpoint, 1 = each flips at its own moment within the middle half) */
	scatter?: number;
	/** softness of the flip as a share of the transition: ~0 = hard flip, 0.5 = slow crossfade over the whole move (the classic pixelize) */
	blend?: number;
};

const BODY = `
uniform vec2 squaresMin;
uniform float steps;
uniform float scatter;
uniform float blend;

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec4 transition(vec2 uv) {
	float d = min(progress, 1.0 - progress);
	float dist = steps > 0.5 ? ceil(d * steps) / steps : d;
	vec2 squareSize = 2.0 * dist / squaresMin;
	vec2 cell = squareSize.x > 0.0 ? floor(uv / squareSize) : vec2(0.0);
	vec2 p = dist > 0.0 ? (cell + 0.5) * squareSize : uv;
	// every block swaps scenes at its own moment around the midpoint, where the grid is coarsest
	float swapAt = 0.5 + (hash21(cell) - 0.5) * 0.5 * scatter;
	float w = max(blend, 0.0001);
	float m = smoothstep(swapAt - w, swapAt + w, progress);
	return mix(getFromColor(p), getToColor(p), m);
}`;

const make = makeGlTransition(BODY, {
	squaresMin: [32, 18] as readonly [number, number],
	steps: 14,
	scatter: 0.4,
	blend: 0.06,
});

/** Mosaic out and in: the picture breaks into growing square blocks, swaps scene at the coarsest grid, then sharpens into B. */
export const pixelate = (props: PixelateProps = {}) => make(props);

const Demo = makeTransitionDemo([{presentation: pixelate(), durationInFrames: 20, timing: linearTiming({durationInFrames: 20})}], 12, 16);

export const pixelateEntry: LibraryEntry = {
	meta: {
		id: 'pixelate',
		title: 'Pixelate',
		category: 'transitions',
		looks: 'The frame breaks into square blocks that tick up to a coarse 32 x 18 grid, blocks flip to the next scene around the midpoint, then the grid ticks back down to sharp.',
		use: 'Hard cut with a digital feel: hacking / system boot / glitch-y UI moments, or a retro game-menu to gameplay switch.',
		exportName: 'pixelate',
		durationInFrames: 48,
		source: {
			kind: 'ported',
			name: 'gl-transitions pixelize (gre)',
			url: 'https://github.com/gl-transitions/gl-transitions/blob/master/transitions/pixelize.glsl',
			license: 'MIT',
		},
	},
	Demo,
};
