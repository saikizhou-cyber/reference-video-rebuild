// Ported from Codrops Interlude spiral transition (https://github.com/codrops/interlude/blob/main/src/transitions/spiral.ts), MIT, Copyright (c) 2026 Codrops. Changes: the three.js TSL shader is translated by hand to a gl-transitions style GLSL body (makeGlTransition) where one progress runs the cover then the reveal, MaterialX fractal noise replaced by our own integer-hash gradient fbm, the seconds clock replaced by the transition progress, GSAP tweens replaced by in-shader eases, colours and the spiral settings exposed as props.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import {DEMO} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {CODROPS_NOISE_GLSL, CODROPS_PHASE_GLSL} from './_codrops-utils';
import {hexToRgb, makeTransitionDemo} from './_gl-utils';

export type SpiralCoverProps = {
	/** where the spiral starts, [x, y] as 0..1 of the frame (y counted from the top). Default [0.5, 0.5] */
	origin?: readonly [number, number];
	/** cover colour, '#rrggbb'. Default '#111111' (a dark spiral) */
	color?: string;
	/** colour of the glow along the spiral's edge. Default '#ff4d1c' */
	glowColor?: string;
	/** colour of the thin hot line right at the edge. Default '#ffe2c4' */
	hotColor?: string;
	/** spiral arms on the edge. Default 3 */
	arms?: number;
	/** how much faster the centre turns than the outside. Default 0.9 */
	twist?: number;
	/** how fast the whole thing turns, radians per second of `seconds`. Default 0.15 */
	spin?: number;
	/** how rough (smoky) the edge is. Default 0.2 */
	ragged?: number;
	/** how far the bright ring reaches past the edge (a fainter haze goes further). Default 0.1 */
	glow?: number;
	/** how bright the glow is, 0 (none) to 1. Default 0.5 */
	glowStrength?: number;
	/** width of the edge gradient (share of the distance to the far corner). Default 0.01 */
	softness?: number;
	/** how long the whole transition lasts in seconds: only sets how fast the spin and smoke drift run. Default 2.6 */
	seconds?: number;
	/** another seed = another smoke pattern (integer) */
	seed?: number;
};

const BODY = `
uniform vec2 origin;
uniform vec3 color;
uniform vec3 glowColor;
uniform vec3 hotColor;
uniform float arms;
uniform float twist;
uniform float spin;
uniform float ragged;
uniform float glow;
uniform float glowStrength;
uniform float softness;
uniform float seconds;
uniform float seed;
${CODROPS_NOISE_GLSL}
${CODROPS_PHASE_GLSL}

vec4 transition(vec2 uv) {
	float p;
	float rev;
	cPhase(progress, 2.5, 2.0, false, p, rev);
	float time = progress * seconds;

	// positions in frame heights: y from 0 (top) to 1 (bottom), x from 0 to ratio
	vec2 position = vec2(uv.x * ratio, 1.0 - uv.y);
	vec2 o = vec2(origin.x * ratio, origin.y);
	float reach = length(max(o, vec2(ratio, 1.0) - o));

	// where this pixel is around the origin: how far (0 there, 1 at the farthest corner) and which way (an angle)
	vec2 away = position - o;
	float dist = length(away) / reach;
	float angle = dot(away, away) > 1e-12 ? atan(away.y, away.x) : 0.0;

	// a whirlpool: the angle is turned by an amount that grows towards the centre, and with time
	float turned = angle + time * spin + twist / (dist + 0.2);
	// smoky noise in that turning frame, so the roughness spirals too
	float smoke = cFbm(vec3(cos(turned) * dist * 3.0, sin(turned) * dist * 3.0, time * 0.1 + rev * 7.0), seed);
	// the edge's shape: the distance, roughened by the smoke, pulled into spiral arms (kept inside the thresholds' range so the cover closes)
	float field = clamp(dist + smoke * ragged + sin(turned * arms) * 0.07, -0.28, 1.1);

	// where the edge is: covering, everything below it is covered; revealing, a hole grows from the same spot
	float level = mix(mix(-0.15, 1.12, p), mix(1.12, -0.15, p), rev);
	float dark = cBelow(field, level, softness);
	float covered = mix(dark, 1.0 - dark, rev);

	// how far this pixel is from the edge, on the open side (0 at the edge)
	float outside = max(mix(field - level, level - field, rev), 0.0);
	// the light: a soft glow past the edge and a thin hot line at it, brighter on one side, flickering with the smoke,
	// fading in and out with the progress so there is none before the spiral exists
	float side = cos(angle - 0.6 + time * 0.2) * 0.3 + 0.7;
	float flicker = smoke * 0.6 + 0.9;
	float envelope = smoothstep(0.0, 0.1, p) * smoothstep(0.0, 0.1, 1.0 - p);
	float streaks = sin(turned * arms * 2.0 - outside * 30.0) * 0.25 + 0.75;
	float ring = exp(-outside / max(glow, 1e-4)) + exp(-outside / (max(glow, 1e-4) * 4.0)) * 0.2;
	float light = clamp(ring * side * streaks * flicker * envelope * glowStrength, 0.0, 1.0);
	float line = exp(-outside / 0.006);
	vec3 glowLin = mix(cToLinear(glowColor), cToLinear(hotColor), line);

	// covered: the cover colour; open: the glow, as much as there is of it
	float open = 1.0 - covered;
	float alpha = clamp(covered + light * open, 0.0, 1.0);
	vec3 col = cToSrgb(mix(cToLinear(color), glowLin, open));
	return cComposite(uv, rev, p, col, alpha);
}`;

const make = makeGlTransition(BODY, {
	origin: [0.5, 0.5] as readonly [number, number],
	color: hexToRgb('#111111') as readonly [number, number, number],
	glowColor: hexToRgb('#ff4d1c') as readonly [number, number, number],
	hotColor: hexToRgb('#ffe2c4') as readonly [number, number, number],
	arms: 3,
	twist: 0.9,
	spin: 0.15,
	ragged: 0.2,
	glow: 0.1,
	glowStrength: 0.5,
	softness: 0.01,
	seconds: 2.6,
	seed: 0,
});

/**
 * A dark whirlpool spiral spreads from `origin` until it covers the frame, with a red glow and a hot line along its edge (first half);
 * then a hole opens from the same spot with the same glow (second half), uncovering B. The spiral keeps turning and the smoke drifts.
 * Ease in-out while covering, ease out while revealing; 42-72 frames feels right.
 */
export const spiralCover = (props: SpiralCoverProps = {}) => {
	const {color, glowColor, hotColor, ...rest} = props;
	return make({
		...rest,
		...(color === undefined ? {} : {color: hexToRgb(color)}),
		...(glowColor === undefined ? {} : {glowColor: hexToRgb(glowColor)}),
		...(hotColor === undefined ? {} : {hotColor: hexToRgb(hotColor)}),
	});
};

const Demo = makeTransitionDemo(
	[
		{
			presentation: spiralCover({origin: [0.62, 0.45], glowColor: DEMO.cyan, hotColor: '#e8fbff', color: '#1a1240', seconds: 2.2}),
			durationInFrames: 66,
			timing: linearTiming({durationInFrames: 66}),
		},
	],
	6,
	6,
);

export const spiralCoverEntry: LibraryEntry = {
	meta: {
		id: 'spiral-cover',
		title: 'Spiral cover',
		category: 'transitions',
		looks: 'A dark whirlpool of spiral arms with a smoky, glowing edge spreads from a point until it covers the frame, then a hole with the same glowing rim opens from that spot onto the next scene.',
		use: 'Portal, vortex or time-warp cuts: entering a dungeon or a rift, a magic or curse hit, a dream / memory jump. Tint glowColor to the spell.',
		exportName: 'spiralCover',
		durationInFrames: 78,
		source: {
			kind: 'ported',
			name: 'Codrops Interlude spiral',
			url: 'https://github.com/codrops/interlude/blob/main/src/transitions/spiral.ts',
			license: 'MIT',
		},
	},
	Demo,
};
