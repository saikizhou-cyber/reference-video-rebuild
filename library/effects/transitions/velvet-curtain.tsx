// Ported from Codrops Interlude velvet transition (https://github.com/codrops/interlude/blob/main/src/transitions/velvet.ts), MIT, Copyright (c) 2026 Codrops. Changes: the three.js TSL shader is translated by hand to a gl-transitions style GLSL body (makeGlTransition) where one progress runs the curtain closing then opening, MaterialX noise replaced by our own integer-hash gradient noise, the seconds clock replaced by the transition progress, GSAP tweens replaced by in-shader eases, colour and the cloth settings exposed as props.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import type {LibraryEntry} from '../../core/types';
import {CODROPS_NOISE_GLSL, CODROPS_PHASE_GLSL} from './_codrops-utils';
import {hexToRgb, makeTransitionDemo} from './_gl-utils';

export type VelvetCurtainProps = {
	/** curtain colour, '#rrggbb'. Default '#c4122e' (deep red) */
	color?: string;
	/** folds across the cloth: closer together while it is gathered, further apart when it is drawn. Default 10 */
	folds?: number;
	/** how deep the folds are: steeper sides, darker shadows. Default 0.5 */
	depth?: number;
	/** how far the hem trails behind the top while moving, in frame heights. Default 0.3 */
	trail?: number;
	/** how much the folds sway, in folds. Default 0.35 */
	sway?: number;
	/** how fast they sway. Default 0.25 */
	swaySpeed?: number;
	/** the velvet's soft light on the sides of its folds, 0 (none) to 1. Default 0.35 */
	sheen?: number;
	/** the shadow the curtain casts on the page beside it, in frame heights. Default 0.05 */
	shadow?: number;
	/** how dark the page gets as the curtain closes (house lights going down), 0 (not at all) to 1 (black). Default 0.55 */
	dim?: number;
	/** how long the whole transition lasts in seconds: only sets how fast the sway runs. Default 2.4 */
	seconds?: number;
	/** another seed = another fold pattern (integer) */
	seed?: number;
};

const BODY = `
uniform vec3 color;
uniform float folds;
uniform float depth;
uniform float trail;
uniform float sway;
uniform float swaySpeed;
uniform float sheen;
uniform float shadow;
uniform float dim;
uniform float seconds;
uniform float seed;
${CODROPS_NOISE_GLSL}
${CODROPS_PHASE_GLSL}

vec4 transition(vec2 uv) {
	float p;
	float rev;
	cPhase(progress, 2.0, 2.0, true, p, rev);
	float time = progress * seconds;

	// positions in frame heights: y from 0 (top) to 1 (bottom), x from 0 to ratio
	float x = uv.x * ratio;
	float y = 1.0 - uv.y;
	// how far past the screen's edges the curtain starts and stops, shadow included
	float pad = shadow + 0.03;
	vec3 red = cToLinear(color);

	// the curtain's leading edge, from past the right of the screen to past its left. While it moves the hem trails:
	// further behind the lower it is, most in the middle of the move. Covering it moves left so the hem is to the right
	// of the top; revealing it moves right, so the other way. And a slight, slow ripple along it.
	float travel = mix(ratio + pad, -pad, p);
	float moving = sin(p * C_PI);
	float way = mix(1.0, -1.0, rev);
	float hemTrail = pow(y, 1.5) * trail * moving * way;
	float ripple = cNoise(vec3(y * 2.5, time * 0.4, 0.0), seed) * 0.008;
	float edge = travel + hemTrail + ripple;
	float inside = x - edge; // how far into the curtain this pixel is (negative: beside it)

	// the folds: across goes from 0 at the edge to 1 at the right of the screen, where the curtain hangs from, so the same folds
	// always fit in the cloth that shows. Noise makes them uneven and moves them slowly with time: the sway
	float across = inside / max(ratio - edge, 0.05);
	float uneven = cNoise(vec3(across * 4.0, y * 0.8, time * swaySpeed + 3.7), seed) * sway;
	float phase = (across + uneven / folds) * folds * C_PI * 2.0;
	// where folds are tighter than the pixels can show, they flatten out rather than flicker
	float sharp = 1.0 - smoothstep(0.6, 1.6, fwidth(phase));

	// light on the cloth: the folds' slope tilts the surface left and right; light from the upper left lights the sides facing it,
	// the others fall into deep colour, not grey. Velvet also glows softly where its surface turns away from you: the sheen
	float slope = (sin(phase) + sin(phase * 2.0 + 1.0) * 0.35) * depth * sharp;
	vec3 normal = vec3(slope, 0.0, 1.0) / sqrt(slope * slope + 1.0);
	float lit = clamp(dot(normal, vec3(-0.5, -0.3, 0.81)), 0.0, 1.0);
	float sheenAmt = pow(max(1.0 - normal.z, 0.0), 1.2) * sheen * (lit * 0.6 + 0.4);
	// a stage light from above: brighter at the top, darker at the hem; the edge rolls under: a darker hem along it
	float stage = mix(1.1, 0.7, y);
	float hem = mix(0.55, 1.0, smoothstep(0.0, 0.014, inside));
	vec3 body = mix(red * 0.2, red * 1.05, lit) * stage * hem;
	vec3 glow = mix(red, vec3(1.0, 0.85, 0.8), 0.35) * sheenAmt;
	vec3 cloth = body + glow;

	// the curtain, with an anti-aliased edge, and its shadow on the page beside it
	float aa = max(fwidth(inside), 1e-5);
	float covered = smoothstep(-aa, aa, inside);
	float shade = (1.0 - smoothstep(0.0, max(shadow, 1e-4), -inside)) * 0.35;
	// the page beside it dims as the curtain closes and brightens as it opens, a little darker towards the edges of the screen
	float edges = length(vec2(x, y) - vec2(ratio * 0.5, 0.5)) / (ratio * 0.6);
	float dimming = smoothstep(0.0, 1.0, p) * dim * mix(0.9, 1.1, clamp(edges, 0.0, 1.0));
	// the shadow and the dimming together: what light gets through both
	float dark = 1.0 - (1.0 - shade) * (1.0 - dimming);
	float alpha = covered + dark * (1.0 - covered);
	vec3 col = cToSrgb(cloth) * covered;
	return cComposite(uv, rev, p, col, alpha);
}`;

const make = makeGlTransition(BODY, {
	color: hexToRgb('#c4122e') as readonly [number, number, number],
	folds: 10,
	depth: 0.5,
	trail: 0.3,
	sway: 0.35,
	swaySpeed: 0.25,
	sheen: 0.35,
	shadow: 0.05,
	dim: 0.55,
	seconds: 2.4,
	seed: 0,
});

/**
 * A stage curtain is drawn in from the right over the frame, its hem trailing behind its top, with deep folds, a velvet sheen and a
 * shadow; the picture beside it dims as it closes (first half). It is drawn back to the right onto B, which brightens as it opens (second half).
 * Ease in-out both ways; 42-72 frames feels right.
 */
export const velvetCurtain = (props: VelvetCurtainProps = {}) => {
	const {color, ...rest} = props;
	return make({...rest, ...(color === undefined ? {} : {color: hexToRgb(color)})});
};

const Demo = makeTransitionDemo(
	[
		{
			presentation: velvetCurtain({seconds: 2.2}),
			durationInFrames: 66,
			timing: linearTiming({durationInFrames: 66}),
		},
	],
	6,
	6,
);

export const velvetCurtainEntry: LibraryEntry = {
	meta: {
		id: 'velvet-curtain',
		title: 'Velvet curtain',
		category: 'transitions',
		looks: 'A heavy red stage curtain with deep sheened folds sweeps in from the right with its hem trailing, the picture dims beside it; then it is drawn back and the next scene brightens up behind it.',
		use: 'Theatrical beats: act breaks, a stage / theatre / circus reveal, a showtime or boss-entrance cue, a classy end-of-trailer closer. Pick the colour to match the studio.',
		exportName: 'velvetCurtain',
		durationInFrames: 78,
		source: {
			kind: 'ported',
			name: 'Codrops Interlude velvet',
			url: 'https://github.com/codrops/interlude/blob/main/src/transitions/velvet.ts',
			license: 'MIT',
		},
	},
	Demo,
};
