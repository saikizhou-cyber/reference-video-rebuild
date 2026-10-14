// Ported from Shader-Image-Transition by Arlind Aliu (https://github.com/Arrlindii/Shader-Image-Transition/blob/main/src/shaders/fragment.glsl), MIT, Copyright (c) 2025 Arlind Aliu. Changes: uProgress and the texture become the transition progress and getFromColor / getToColor (makeGlTransition), pixel units become frame-width units so it is resolution independent, the hard step edge gets a softness and an optional edge line, the smooth minimum is rewritten overflow-safe, the radius schedule is fitted to the frame (it measures how big the circles must get to fill it and finishes there, instead of a fixed pixel radius), satellite count / wobble / merge / ease / centre exposed as props.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import {DEMO} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {hexToRgb, makeTransitionDemo} from './_gl-utils';

export type BlobRevealProps = {
	/** how far the blob's edge is pushed in and out by the angular wave: 0 = a plain circle, 0.5 = default, 0.9 = deeply lobed */
	wobble?: number;
	/** satellite circles in the outer ring (two inner rings of 3 are fixed). Default 5 */
	satellites?: number;
	/** how softly the circles merge (the smooth-minimum sharpness, higher = tighter joins; the joins also soften as the blob swells). Default 30 */
	merge?: number;
	/** width of the edge gradient as a share of the frame width (0 = crisp, anti-aliased). Default 0.004 */
	softness?: number;
	/** colour of the line around the blob, '#rrggbb'. Default '#ffffff' */
	edgeColor?: string;
	/** thickness of that line as a share of the frame width (0 = none). Default 0.012 */
	edgeWidth?: number;
	/** growth curve: the blob radius follows (progress / 0.96) ^ ease until it fills the frame (1 = linear, 2.5 = the original's slow start). Default 1.5 */
	ease?: number;
	/** where the blob grows from, [x, y] as 0..1 of the frame (y counted from the top). Default [0.5, 0.5] */
	center?: readonly [number, number];
};

const BODY = `
uniform float wobble;
uniform float satellites;
uniform float merge;
uniform float softness;
uniform vec3 edgeColor;
uniform float edgeWidth;
uniform float ease;
uniform vec2 center;

const float B_PI = 3.141592653589793;
// the original's satellites wobble by 15 px on a 1280 px wide plane
const float B_SAT_RAD = 15.0 / 1280.0;
// the share of the transition after which the circles have filled the frame
const float B_DONE = 0.96;

// the angular wave: three harmonics averaged, 0..1, turning half a revolution over the transition
float bWave(vec2 p, float prog) {
	float angle = atan(p.y, p.x + 1e-7) + prog * B_PI;
	float w0 = (cos(angle) + 1.0) * 0.5;
	float w1 = (sin(2.0 * angle) + 1.0) * 0.5;
	float w2 = (cos(3.0 * angle) + 1.0) * 0.5;
	return (w0 + w1 + w2) / 3.0;
}

// smooth minimum (the SDF union), overflow-safe form of -log(exp(-ka) + exp(-kb)) / k
float bSoftMin(float a, float b, float k) {
	return min(a, b) - log(1.0 + exp(-k * abs(a - b))) / k;
}

// distance from the circle's centre, pushed out by the wave: the edge is where this equals the radius
float bCircle(vec2 p, float rad, float amt, float prog) {
	return length(p) + bWave(p, prog) * rad * amt;
}

// the centre of the nearest of 'count' circles spread on a ring of radius o
vec2 bRingAt(vec2 p, float o, float count) {
	float sector = 2.0 * B_PI / count;
	float an = sector * round(atan(p.y, p.x + 1e-7) / sector);
	return o * vec2(cos(an), sin(an));
}

// the nearest of 'count' circles spread on a ring of radius o
float bRing(vec2 p, float o, float count, float amt, float prog) {
	return bCircle(p - bRingAt(p, o, count), B_SAT_RAD, amt, prog);
}

// how far point p is from the nearest circle centre (the radius the circles need to swallow p)
float bReach(vec2 p, float count) {
	float d = length(p);
	d = min(d, length(p - bRingAt(p, 0.20, 3.0)));
	d = min(d, length(p - bRingAt(p, 0.25, 3.0)));
	return min(d, length(p - bRingAt(p, 0.45, max(count, 1.0))));
}

vec4 transition(vec2 uv) {
	if (progress <= 0.0) {
		return getFromColor(uv);
	}
	if (progress >= 1.0) {
		return getToColor(uv);
	}
	// frame-width units, y up
	vec2 sc = vec2(1.0, 1.0 / ratio);
	vec2 p = (uv - center) * sc;

	// the radius that fills the frame: the farthest corner's distance to the nearest circle centre (it follows the
	// frame shape, the centre and the satellite count), so the bloom is complete just before the transition ends
	float need = max(
		max(bReach((vec2(0.0, 0.0) - center) * sc, satellites), bReach((vec2(1.0, 0.0) - center) * sc, satellites)),
		max(bReach((vec2(0.0, 1.0) - center) * sc, satellites), bReach((vec2(1.0, 1.0) - center) * sc, satellites))
	);
	float g = clamp(progress / B_DONE, 0.0, 1.0);
	// the last stretch swells the circles well past 'need' as a safety net for off-centre origins
	float rad = need * pow(g, ease) * (1.0 + 3.0 * smoothstep(B_DONE, 1.0, progress));
	float amt = wobble * (1.0 + 0.5 * sin(progress * 0.2));

	// like a liquid, the joins soften as the blob swells (this also pulls the finish slightly earlier than the geometric need), so the last pockets close round, not in sharp points
	float k = merge / (1.0 + 8.0 * max(rad - 0.12, 0.0));
	float c = bCircle(p, rad, amt, progress);
	c = bSoftMin(c, bRing(p, 0.20, 3.0, amt, progress), k);
	c = bSoftMin(c, bRing(p, 0.25, 3.0, amt, progress), k);
	c = bSoftMin(c, bRing(p, 0.45, max(satellites, 1.0), amt, progress), k);

	// signed edge distance: negative inside the blob. The soft band lies inside so nothing shows before the blob exists.
	float d = c - rad;
	float band = max(fwidth(d), softness);
	float ew = edgeWidth * smoothstep(0.0, 0.08, rad);
	float inner = 1.0 - smoothstep(-band, 0.0, d);
	float outer = 1.0 - smoothstep(ew - band, ew, d);

	vec4 from = getFromColor(uv);
	vec4 to = getToColor(uv);
	vec4 base = mix(from, vec4(edgeColor, 1.0), outer);
	return mix(base, to, inner);
}`;

const make = makeGlTransition(BODY, {
	wobble: 0.5,
	satellites: 5,
	merge: 30,
	softness: 0.004,
	edgeColor: hexToRgb('#ffffff') as readonly [number, number, number],
	edgeWidth: 0.012,
	ease: 1.5,
	center: [0.5, 0.5] as readonly [number, number],
});

/**
 * An organic blob reveals B: a central circle whose edge is pushed in and out by an angular wave, ringed by satellite circles
 * merged with it by a smooth minimum, all growing until B fills the frame, just before the transition ends (the size is measured from the frame shape, the origin and the satellite count). Works with linearTiming; 36-54 frames.
 */
export const blobReveal = (props: BlobRevealProps = {}) => {
	const {edgeColor, ...rest} = props;
	return make({...rest, ...(edgeColor === undefined ? {} : {edgeColor: hexToRgb(edgeColor)})});
};

const Demo = makeTransitionDemo(
	[
		{
			presentation: blobReveal({edgeColor: DEMO.yellow, edgeWidth: 0.014}),
			durationInFrames: 48,
			timing: linearTiming({durationInFrames: 48}),
		},
	],
	6,
	8,
);

export const blobRevealEntry: LibraryEntry = {
	meta: {
		id: 'blob-reveal',
		title: 'Blob reveal',
		category: 'transitions',
		looks: 'A lumpy central blob and rings of satellite bubbles bloom out of the middle, their edges wobbling with a rotating wave and melting together, and the next scene fills in through them.',
		use: 'Soft, organic scene changes: slime / liquid / spore / bubble themes, a magic bloom, an eye-opening reveal, a character-select card swap. Raise wobble for goo, set edgeWidth 0 for a clean mask.',
		exportName: 'blobReveal',
		durationInFrames: 62,
		source: {
			kind: 'ported',
			name: 'Shader-Image-Transition (Arlind Aliu)',
			url: 'https://github.com/Arrlindii/Shader-Image-Transition/blob/main/src/shaders/fragment.glsl',
			license: 'MIT',
		},
	},
	Demo,
};
