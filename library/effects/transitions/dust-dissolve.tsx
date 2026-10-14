// Original gather-style particle shader, inspired by Remocn particle-dissolve (https://github.com/Remocn/remocn/blob/main/registry/remocn/particle-dissolve/index.tsx, MIT, Copyright (c) 2026 Remocn); no code copied. Integer hash = lowbias32 by Chris Wellons (public domain / Unlicense, https://github.com/skeeto/hash-prospector).
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import type {LibraryEntry} from '../../core/types';
import {makeTransitionDemo} from './_gl-utils';

export type DustDissolveDirection = 'reveal' | 'upRight' | 'up' | 'down' | 'left' | 'right';

export type DustDissolveProps = {
	/** size of one speck in px at 720p (the frame is cut into square cells this big) */
	particleSize?: number;
	/** how far the dust travels (share of the frame height; the fastest specks go about 1.6x this) */
	scatter?: number;
	/** sparkle on the specks (0 = none) */
	shimmer?: number;
	/** red / cyan fringing on the outer streams of the dust (0 = none) */
	aberration?: number;
	/** wind: 'reveal' = dust bursts outward from the middle, otherwise it is blown that way (dissolve starts downwind) */
	direction?: DustDissolveDirection;
	/** 0 = whole frame turns to dust at once, towards 1 = it crumbles in a wave (0..0.92) */
	stagger?: number;
	/** 0 = brightness is ignored, 1 = bright shapes and lettering crumble well before flat dark areas (-1 = the reverse) */
	lumaOrder?: number;
	/** fan angle of the dust streams in radians */
	spread?: number;
	/** share of the cells that fly off as specks (0..1); the rest just vanishes. Lower = airier dust */
	density?: number;
};

const AXES: Record<DustDissolveDirection, [number, number]> = {
	reveal: [0, 0.3],
	upRight: [0.82, 0.57],
	up: [0, 1],
	down: [0, -1],
	left: [-1, 0],
	right: [1, 0],
};

/**
 * How it works (one pass, gather style, no randomness outside integer hashes):
 *  - the frame is a grid of square cells; every cell has a release time (sweep + soft noise + hash + brightness);
 *  - before its release a cell is the untouched outgoing picture, afterwards the next scene shows through its home;
 *  - a released cell flies off as a real fragment of the picture, shrinking and fading, along one of NL "lanes"
 *    (own fan angle and speed). Cells released around the same time (a "bucket") and sharing a lane move as one rigid
 *    translation, so a pixel finds the fragments covering it by walking back along each active bucket x lane.
 */
const BODY = `
uniform float cells;
uniform float scatter;
uniform float shimmer;
uniform float aberration;
uniform float stagger;
uniform float lumaOrder;
uniform float spread;
uniform vec2 dir;
uniform float radial;
uniform float keep;

const int NB = 24;
const int NL = 8;
const float T0 = 0.02;

float gCs;
float gLife;
float gSpan;
float gReach;
vec2 gCtr;
vec2 gWind;

uint ihash(uint x) {
	x ^= x >> 16;
	x *= 0x7feb352du;
	x ^= x >> 15;
	x *= 0x846ca68bu;
	x ^= x >> 16;
	return x;
}

uint cellHash(ivec2 id) {
	uvec2 u = uvec2(id + ivec2(16384));
	return ihash(u.x * 0x9e3779b1u + ihash(u.y ^ 0x68e31da4u));
}

float luma(vec3 c) {
	return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// smooth blobs (no texture, no random): organic edge for the release front
float swirl(vec2 c) {
	return 0.5
		+ 0.20 * sin(c.x * 4.1 + c.y * 2.3 + 0.7)
		+ 0.17 * sin(c.x * 2.4 - c.y * 5.3 + 2.1)
		+ 0.13 * sin(c.x * 9.3 + c.y * 7.7 + 4.2);
}

// release order of a cell, 0 = first to go .. 1 = last
float orderOf(ivec2 id, float jit) {
	vec2 cc = (vec2(id) + 0.5) * gCs;
	vec2 rel = cc - gCtr;
	float spatial = radial > 0.5
		? clamp(length(rel) / gReach, 0.0, 1.0)
		: clamp(0.5 - dot(rel, gWind) / (2.0 * gReach), 0.0, 1.0);
	float lum = luma(getFromColor(vec2(cc.x / ratio, cc.y)).rgb);
	float raw = 0.56 * spatial + 0.22 * swirl(cc) + 0.12 * jit - lumaOrder * (lum - 0.45) * 0.45;
	return clamp((raw - 0.10) / 0.80, 0.0, 1.0);
}

vec4 transition(vec2 v_uv) {
	if (progress <= 0.0) {
		return getFromColor(v_uv);
	}
	if (progress >= 1.0) {
		return getToColor(v_uv);
	}

	float cs = 1.0 / cells;
	gCs = cs;
	gLife = max(1.0 - stagger, 0.08) * (1.0 - T0);
	gSpan = 1.0 - T0 - gLife;
	gCtr = vec2(0.5 * ratio, 0.5);
	float windLen = length(dir);
	gWind = windLen > 0.001 ? dir / windLen : vec2(0.0, 1.0);
	gReach = radial > 0.5 ? length(gCtr) : 0.5 * (abs(gWind.x) * ratio + abs(gWind.y));

	vec2 p = vec2(v_uv.x * ratio, v_uv.y);
	float px = fwidth(v_uv.y) / cs;

	// lanes: golden-ratio scrambled fan angle and speed, so neighbouring lanes differ in both
	vec2 laneDir[NL];
	float laneSpd[NL];
	for (int l = 0; l < NL; l++) {
		float fl = float(l);
		float ang = (fract(fl * 0.61803399 + 0.17) - 0.5) * spread;
		laneSpd[l] = 0.38 + 1.22 * fract(fl * 0.38196601 + 0.43);
		float ca = cos(ang);
		float sa = sin(ang);
		laneDir[l] = vec2(gWind.x * ca - gWind.y * sa, gWind.x * sa + gWind.y * ca);
	}

	// home: untouched outgoing picture until this cell is released, then the next scene (with a dark ash rim)
	ivec2 hid = ivec2(floor(p / cs));
	uint hr = cellHash(hid);
	float hStart = T0 + orderOf(hid, float(hr & 255u) / 255.0) * gSpan;
	vec4 col;
	if (progress < hStart) {
		col = getFromColor(v_uv);
	} else {
		float since = clamp((progress - hStart) / (gLife * 0.4), 0.0, 1.0);
		col = getToColor(v_uv);
		col.rgb *= 1.0 - 0.45 * (1.0 - since) * (1.0 - since);
	}

	// flying fragments, oldest bucket first so younger ones are painted on top
	for (int b = 0; b < NB; b++) {
		float tb = T0 + gSpan * float(b) / float(NB);
		float phb = (progress - tb) / gLife;
		if (phb <= 0.0 || phb >= 1.0) {
			continue;
		}
		float e = pow(phb, 1.5);
		for (int l = 0; l < NL; l++) {
			vec2 hd = laneDir[l];
			float spd = laneSpd[l];
			vec2 off = hd * (windLen * scatter * spd * e);
			off += vec2(-hd.y, hd.x) * (sin(phb * 5.5 + float(l) * 2.3) * 0.05 * scatter * spd * e);
			float zoom = 1.0 + radial * 1.5 * scatter * spd * e;
			vec2 q = gCtr + (p - gCtr - off) / zoom;

			ivec2 id = ivec2(floor(q / cs));
			uint r = cellHash(id);
			if (int(float((r >> 8) & 255u) * float(NL) / 256.0) != l) {
				continue;
			}
			vec2 cc = (vec2(id) + 0.5) * cs;
			if (cc.x < -0.5 * cs || cc.y < -0.5 * cs || cc.x > ratio + 0.5 * cs || cc.y > 1.0 + 0.5 * cs) {
				continue;
			}
			// only part of the cells survive as flying specks, the rest is simply gone
			if (float(r >> 24) / 255.0 > keep) {
				continue;
			}
			float order = orderOf(id, float(r & 255u) / 255.0);
			if (min(NB - 1, int(order * float(NB))) != b) {
				continue;
			}
			float start = T0 + order * gSpan;
			if (progress < start) {
				continue;
			}

			float ph = clamp((progress - start) / gLife, 0.0, 1.0);
			float life = clamp(ph * (0.7 + 0.6 * float((r >> 16) & 255u) / 255.0), 0.0, 1.0);
			vec2 f = q / cs - (vec2(id) + 0.5);
			float size = 0.5 * (1.0 - 0.66 * life);
			float cover = clamp((size - max(abs(f.x), abs(f.y))) / (px / zoom) + 0.5, 0.0, 1.0);
			float alpha = cover * (1.0 - smoothstep(0.3, 0.95, life));
			if (alpha <= 0.0) {
				continue;
			}

			vec4 src = getFromColor(vec2(q.x / ratio, q.y));
			float tw = 0.5 + 0.5 * sin(progress * (24.0 + 50.0 * float((r >> 16) & 255u) / 255.0) + float(r & 255u) * 0.1);
			float side = float(l) / float(NL - 1) * 2.0 - 1.0;
			vec3 dust = mix(src.rgb, vec3(luma(src.rgb) + 0.04), 0.3 * life);
			dust *= vec3(1.0 + 0.35 * aberration * side * life, 1.0, 1.0 - 0.35 * aberration * side * life);
			dust += vec3(shimmer * (0.12 * tw + 0.7 * pow(tw, 14.0)) * life);
			col.rgb = mix(col.rgb, dust, alpha);
			col.a = max(col.a, alpha);
		}
	}
	return col;
}`;

const make = makeGlTransition(BODY, {
	cells: 180,
	scatter: 0.42,
	shimmer: 0.6,
	aberration: 0.5,
	stagger: 0.66,
	lumaOrder: 0.8,
	spread: 1.1,
	dir: [0.82, 0.57] as readonly [number, number],
	radial: 0,
	keep: 0.5,
});

/** The outgoing frame crumbles into fine specks of itself that the wind blows away (bright shapes first) while the next scene is uncovered. ~36 frames. */
export const dustDissolve = (props: DustDissolveProps = {}) => {
	const {particleSize = 4, direction = 'upRight', scatter, shimmer, aberration, stagger, lumaOrder, spread, density} = props;
	const axis = AXES[direction] ?? AXES.upRight;
	return make({
		cells: 720 / Math.max(particleSize, 1),
		dir: axis,
		radial: direction === 'reveal' ? 1 : 0,
		...(scatter === undefined ? {} : {scatter}),
		...(shimmer === undefined ? {} : {shimmer}),
		...(aberration === undefined ? {} : {aberration}),
		...(lumaOrder === undefined ? {} : {lumaOrder}),
		...(spread === undefined ? {} : {spread}),
		...(density === undefined ? {} : {keep: Math.min(Math.max(density, 0), 1)}),
		...(stagger === undefined ? {} : {stagger: Math.min(Math.max(stagger, 0), 0.92)}),
	});
};

const Demo = makeTransitionDemo([{presentation: dustDissolve(), durationInFrames: 36, timing: linearTiming({durationInFrames: 36})}], 6, 6);

export const dustDissolveEntry: LibraryEntry = {
	meta: {
		id: 'dust-dissolve',
		title: 'Dust dissolve',
		category: 'transitions',
		looks: 'The outgoing frame crumbles into fine square specks of itself, bright shapes and lettering first, that shrink and blow off downwind in a fan of streams while the next scene is uncovered behind a dark ash rim.',
		use: 'Loss, memory and death beats; a character crumbling out of a scene; title cards that turn to dust before the next act.',
		exportName: 'dustDissolve',
		durationInFrames: 48,
		source: {
			kind: 'inspired',
			name: 'Remocn particle-dissolve',
			url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/particle-dissolve/index.tsx',
		},
	},
	Demo,
};
