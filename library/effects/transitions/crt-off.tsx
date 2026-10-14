// Ported from Remocn tv-power-off (https://github.com/Remocn/remocn/blob/main/registry/remocn/tv-power-off/index.tsx), MIT, Copyright (c) 2026 Remocn, with the red/blue vertical split from gl-transitions squeeze.glsl by gre (https://github.com/gl-transitions/gl-transitions/blob/master/transitions/squeeze.glsl), MIT, Copyright (c) 2017-present gl-transitions contributors. Changes: filter turned into a transition (A powers off, black beat, B powers on in reverse), pixel size derived with dFdx/dFdy instead of a resolution uniform, 24 taps, colour fringe on the collapsing picture.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import type {LibraryEntry} from '../../core/types';
import {hexToRgb, makeTransitionDemo} from './_gl-utils';

export type CrtOffProps = {
	/** share of the transition spent fully black between power-off and power-on (0..0.5) */
	hold?: number;
	/** red / blue vertical split on the collapsing picture (1 = default, up to 4 % of the height) */
	fringe?: number;
	/** how much the light of the lost rows is pushed into the remaining line (1 = default, 0 = none) */
	gain?: number;
	/** strength of the bright line and dot at the end of the collapse */
	afterglow?: number;
	/** colour of the line / dot glow */
	phosphor?: string;
};

const BODY = `
uniform float hold;
uniform float fringe;
uniform float gain;
uniform float afterglow;
uniform vec3 phosphor;

const int TAPS = 24;
const int COLUMN_TAPS = 8;
const float GOLDEN = 0.6180339887;
const float COLLAPSE_END = 0.6;
const float PINCH_END = 0.82;
const float MIN_SQUASH = 0.0055;
const float MIN_PINCH = 0.004;
const float CONCENTRATION = 0.3;
const float DECAY_CURVE = 2.6;

vec3 scene(vec2 at, bool useTo) {
	return useTo ? getToColor(at).rgb : getFromColor(at).rgb;
}

vec4 transition(vec2 uv) {
	vec2 pxs = abs(vec2(dFdx(uv.x), dFdy(uv.y)));
	vec2 res = 1.0 / max(pxs, vec2(1e-6));

	// first half powers A off, a black beat, then B powers on: the same collapse played backwards
	float half_ = max(0.5 - 0.5 * hold, 0.05);
	bool useTo = progress >= 0.5;
	float p = useTo
		? 1.0 - clamp((progress - (1.0 - half_)) / half_, 0.0, 1.0)
		: clamp(progress / half_, 0.0, 1.0);

	if (p <= 0.0) return vec4(scene(uv, useTo), 1.0);
	if (p >= 1.0) return vec4(0.0, 0.0, 0.0, 1.0);

	float collapse = clamp(p / COLLAPSE_END, 0.0, 1.0);
	float pinch = clamp((p - COLLAPSE_END) / (PINCH_END - COLLAPSE_END), 0.0, 1.0);
	float decayed = clamp((p - PINCH_END) / (1.0 - PINCH_END), 0.0, 1.0);

	vec2 sc = vec2(pow(MIN_PINCH, pinch), pow(MIN_SQUASH, collapse));
	vec2 centered = (uv - 0.5) / sc + 0.5;
	vec2 span = 1.0 / (sc * res);

	// red / blue pulled apart vertically while the picture is still tall enough to see it
	float sep = fringe * 0.04 * smoothstep(0.0, 0.5, collapse) * (1.0 - pinch);

	vec3 sum = vec3(0.0);
	for (int i = 0; i < TAPS; i++) {
		float fi = float(i);
		vec2 at = centered + vec2(
			(fract(fi * GOLDEN + 0.5) - 0.5) * span.x,
			((fi + 0.5) / float(TAPS) - 0.5) * span.y
		);
		vec2 inside = step(vec2(0.0), at) * step(at, vec2(1.0));
		float m = inside.x * inside.y;
		vec3 c = vec3(0.0);
		if (sep > 1e-4) {
			c.r = scene(at - vec2(0.0, sep), useTo).r;
			c.g = scene(at, useTo).g;
			c.b = scene(at + vec2(0.0, sep), useTo).b;
		} else {
			c = scene(at, useTo);
		}
		sum += c * m;
	}

	float concentrate = pow(1.0 / (sc.x * sc.y), CONCENTRATION);
	vec3 light = (sum / float(TAPS)) * (1.0 + (concentrate - 1.0) * max(gain, 0.0));

	float glow = max(afterglow, 0.0);
	float bleed = smoothstep(0.2, 0.8, collapse) * (1.0 - pinch) * glow;

	if (bleed > 0.0) {
		vec3 column = vec3(0.0);
		float cx = clamp(centered.x, 0.0, 1.0);
		for (int i = 0; i < COLUMN_TAPS; i++) {
			column += scene(vec2(cx, (float(i) + 0.5) / float(COLUMN_TAPS)), useTo);
		}
		column /= float(COLUMN_TAPS);

		float dy = uv.y - 0.5;
		float reach = 0.02 + 0.03 * collapse;
		light += column * mix(vec3(1.0), phosphor, 0.65) * exp(-(dy * dy) / (reach * reach)) * bleed * 0.9;
	}

	if (pinch > 0.0) {
		vec2 d = (uv - 0.5) * vec2(ratio, 1.0);
		float radius = max(0.045 * glow, 0.0005);
		light += phosphor * exp(-dot(d, d) / (radius * radius)) * smoothstep(0.0, 0.5, pinch) * 1.15;
	}

	light *= pow(max(1.0 - decayed, 0.0001), DECAY_CURVE);
	return vec4(clamp(light, 0.0, 1.0), 1.0);
}`;

const make = makeGlTransition(BODY, {
	hold: 0.1,
	fringe: 1,
	gain: 1,
	afterglow: 1,
	phosphor: [0.847, 0.925, 1] as readonly [number, number, number],
});

/**
 * TV power-off cut: the old picture squashes into a blown-out white line, pinches to a dot and dies to black; after a short black
 * beat the new picture powers on in reverse (dot, line, full frame). Red/blue fringe on the way. About 30 frames.
 */
export const crtOff = (props: CrtOffProps = {}) => {
	const {phosphor, ...rest} = props;
	return make({...rest, ...(phosphor === undefined ? {} : {phosphor: hexToRgb(phosphor)})});
};

const Demo = makeTransitionDemo([{presentation: crtOff(), durationInFrames: 30, timing: linearTiming({durationInFrames: 30})}], 8, 10);

export const crtOffEntry: LibraryEntry = {
	meta: {
		id: 'crt-off',
		title: 'CRT off',
		category: 'transitions',
		looks: 'The picture squashes to a bright horizontal line with red/blue fringing, pinches to a dot and dies to black; B then powers on from a dot through a line to full frame.',
		use: 'Power-down / reboot beats, game over to menu, a hacked-screen cut, retro-tech scene changes.',
		exportName: 'crtOff',
		durationInFrames: 48,
		source: {
			kind: 'ported',
			name: 'Remocn tv-power-off + gl-transitions squeeze (gre)',
			url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/tv-power-off/index.tsx',
			license: 'MIT',
		},
	},
	Demo,
};
