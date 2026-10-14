// Ported from gl-transitions DoomScreenTransition.glsl by Zeh Fernando (https://github.com/gl-transitions/gl-transitions/blob/master/transitions/DoomScreenTransition.glsl), MIT, Copyright (c) 2017-present gl-transitions contributors. Changes: int uniform/arguments turned into floats, seed added, timing normalised so the slowest column lands at the end, optional shadow under the falling edge.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import type {LibraryEntry} from '../../core/types';
import {makeTransitionDemo} from './_gl-utils';

export type ScreenMeltProps = {
	/** number of vertical columns (max 128) */
	bars?: number;
	/** speed variation between columns (0 = all fall together, higher = some columns run far ahead) */
	amplitude?: number;
	/** random per-column speed jitter, 0..1 */
	noise?: number;
	/** how short the speed waves across the width are */
	frequency?: number;
	/** how much the middle columns run ahead of the sides (0 = none) */
	dripScale?: number;
	/** changes the random column pattern */
	seed?: number;
	/** shadow each falling column throws on the scene it uncovers, so the sheet reads as a slab (0 = off) */
	edgeShade?: number;
};

const BODY = `
uniform float bars;
uniform float amplitude;
uniform float noise;
uniform float frequency;
uniform float dripScale;
uniform float seed;
uniform float edgeShade;

float rand(float num) {
	return fract(mod(num * 67123.313, 12.0) * sin(num * 10.3) * cos(num));
}

float wave(float num) {
	float fn = (num + seed * 7.0) * frequency * 0.1 * bars;
	return cos(fn * 0.5) * cos(fn * 0.13) * sin((fn + 10.0) * 0.3) / 2.0 + 0.5;
}

float drip(float num) {
	return sin(num / (bars - 1.0) * 3.141592) * dripScale;
}

float pos(float num) {
	return (noise == 0.0 ? wave(num) : mix(wave(num), rand(num + seed * 13.0), noise)) + (dripScale == 0.0 ? 0.0 : drip(num));
}

vec4 transition(vec2 uv) {
	float bar = floor(uv.x * bars);
	float scale = 1.0 + pos(bar) * amplitude;
	// the slowest column sets the pace: normalise so it just reaches the bottom when the move ends, then finish a few percent
	// early so the last frame of the transition is already clean B
	float slowest = scale;
	for (int i = 0; i < 128; i++) {
		if (float(i) >= bars) break;
		slowest = min(slowest, 1.0 + pos(float(i)) * amplitude);
	}
	float phase = min(progress / 0.96, 1.0) * scale / slowest;
	float posY = uv.y;
	vec4 c;
	if (phase + posY < 1.0) {
		c = getFromColor(vec2(uv.x, uv.y + phase));
	} else {
		c = getToColor(uv);
		// the falling slab throws a short shadow on the scene it uncovers
		float d = phase + posY - 1.0;
		c.rgb *= 1.0 - edgeShade * (1.0 - smoothstep(0.0, 0.06, d)) * step(0.001, phase);
	}
	return c;
}`;

const make = makeGlTransition(BODY, {
	bars: 30,
	amplitude: 2,
	noise: 0.1,
	frequency: 0.5,
	dripScale: 0.5,
	seed: 0,
	edgeShade: 0.35,
});

/** The old frame is cut into columns that slide down at different speeds and expose the next scene from the top (the classic screen melt). 30-45 frames, linear. */
export const screenMelt = (props: ScreenMeltProps = {}) => make(props);

const Demo = makeTransitionDemo([{presentation: screenMelt(), durationInFrames: 40, timing: linearTiming({durationInFrames: 40})}], 8, 8);

export const screenMeltEntry: LibraryEntry = {
	meta: {
		id: 'screen-melt',
		title: 'Screen melt',
		category: 'transitions',
		looks: 'The old picture is sliced into 30 hard-edged columns that slide off the bottom at different speeds, the middle columns running ahead, exposing the next scene behind them.',
		use: 'Retro-game and horror beats, "the world is breaking down" cuts, or a cheeky wipe in a game-trailer montage.',
		exportName: 'screenMelt',
		durationInFrames: 56,
		source: {
			kind: 'ported',
			name: 'gl-transitions DoomScreenTransition (Zeh Fernando)',
			url: 'https://github.com/gl-transitions/gl-transitions/blob/master/transitions/DoomScreenTransition.glsl',
			license: 'MIT',
		},
	},
	Demo,
};
