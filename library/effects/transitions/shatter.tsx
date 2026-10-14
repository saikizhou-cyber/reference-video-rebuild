// Ported from gl-transitions fragment.glsl by lbl (https://github.com/gl-transitions/gl-transitions/blob/master/transitions/fragment.glsl), MIT, Copyright (c) 2017-present gl-transitions contributors. Changes: voronoi shards from a jittered grid (seedable count) instead of 10 fixed points, full-circle explosion from an impact point, per-shard stagger / spin / growth, crack lines and edge highlights, parallax and dimmed B behind, aspect-correct.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import type {LibraryEntry} from '../../core/types';
import {hexToRgb, makeTransitionDemo} from './_gl-utils';

export type ShatterProps = {
	/** approximate number of shards (max 64) */
	cells?: number;
	/** changes the shard layout and directions */
	seed?: number;
	/** impact point the shards burst away from, 0..1 (y up) */
	origin?: readonly [number, number];
	/** maximum tumble of a shard, radians */
	spin?: number;
	/** how much flying shards grow towards the camera (0.35 = up to +35 %) */
	grow?: number;
	/** colour of the crack lines and shard edges */
	edgeColor?: string;
	/** brightness of the crack lines and shard edges (0 = none) */
	edgeGlow?: number;
	/** white flash on impact, 0..1 */
	flash?: number;
	/** the next scene starts this much zoomed in and settles as the shards clear (0 = static) */
	parallax?: number;
	/** how dark the next scene is behind the shards at first (0 = not at all) */
	backDim?: number;
};

const BODY = `
uniform float cells;
uniform float seed;
uniform vec2 origin;
uniform float spin;
uniform float grow;
uniform vec3 edgeColor;
uniform float edgeGlow;
uniform float flash;
uniform float parallax;
uniform float backDim;

const float CRACK = 0.12;
const float SETTLE = 0.04;

float hash12(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 hash22(vec2 p) {
	float r = hash12(p);
	return vec2(r, hash12(p + r + 19.19));
}

vec2 gridSize() {
	float cols = max(1.0, floor(sqrt(cells * ratio) + 0.5));
	float rows = max(1.0, floor(cells / cols + 0.5));
	return vec2(cols, rows);
}

vec2 cellSeed(vec2 id, vec2 grid) {
	vec2 cs = vec2(ratio, 1.0) / grid;
	return (id + 0.18 + 0.64 * hash22(id + seed * 3.7)) * cs;
}

// shard (voronoi cell of a jittered grid) that the aspect-space point q belongs to
vec2 nearestId(vec2 q, vec2 grid) {
	vec2 cs = vec2(ratio, 1.0) / grid;
	vec2 base = floor(q / cs);
	float best = 1e9;
	vec2 bid = base;
	for (int dy = -1; dy <= 1; dy++) {
		for (int dx = -1; dx <= 1; dx++) {
			vec2 id = base + vec2(float(dx), float(dy));
			if (id.x < 0.0 || id.y < 0.0 || id.x >= grid.x || id.y >= grid.y) continue;
			float d = distance(q, cellSeed(id, grid));
			if (d < best) {
				best = d;
				bid = id;
			}
		}
	}
	return bid;
}

// distance from q to the nearest border of its own shard
float edgeDist(vec2 q, vec2 id, vec2 grid) {
	vec2 s = cellSeed(id, grid);
	float best = 1e9;
	for (int dy = -1; dy <= 1; dy++) {
		for (int dx = -1; dx <= 1; dx++) {
			if (dx == 0 && dy == 0) continue;
			vec2 nid = id + vec2(float(dx), float(dy));
			if (nid.x < 0.0 || nid.y < 0.0 || nid.x >= grid.x || nid.y >= grid.y) continue;
			vec2 n = cellSeed(nid, grid);
			best = min(best, dot(0.5 * (s + n) - q, normalize(n - s)));
		}
	}
	return best;
}

vec4 transition(vec2 uv) {
	float p = clamp(progress / (1.0 - SETTLE), 0.0, 1.0);
	vec2 grid = gridSize();
	vec2 cs = vec2(ratio, 1.0) / grid;
	float reach = length(cs);
	vec2 q = vec2(uv.x * ratio, uv.y);
	vec2 org = vec2(origin.x * ratio, origin.y);
	float maxD = length(vec2(ratio, 1.0));

	// the next scene sits behind, darker and a little too close until the shards clear
	float eb = smoothstep(0.0, 1.0, p);
	vec4 col = getToColor(0.5 + (uv - 0.5) / (1.0 + parallax * (1.0 - eb)));
	col.rgb *= 1.0 - backDim * (1.0 - eb) * (1.0 - eb);

	int cols = int(grid.x + 0.5);
	int total = cols * int(grid.y + 0.5);
	float crack = smoothstep(0.0, CRACK, p);
	float hit = exp(-pow((p - CRACK) / 0.05, 2.0));

	for (int k = 0; k < 64; k++) {
		if (k >= total) break;
		vec2 id = vec2(float(k % cols), float(k / cols));
		vec2 s = cellSeed(id, grid);
		vec3 r = vec3(hash12(id + seed * 1.3 + 0.1), hash12(id + seed * 2.7 + 7.7), hash12(id + seed * 3.1 + 13.3));

		vec2 d = s - org;
		vec2 dirv = normalize(d + (r.xy - 0.5) * 0.8 + vec2(1e-4));
		// shards nearest the impact go first
		float start = CRACK + clamp(length(d) / maxD, 0.0, 1.0) * 0.16 + r.z * 0.06;
		float t = clamp((p - start) / (1.0 - start), 0.0, 1.0);
		float e = t * (0.3 + 0.7 * t);

		float tx = dirv.x > 0.0 ? (ratio - s.x) / dirv.x : (dirv.x < 0.0 ? -s.x / dirv.x : 1e9);
		float ty = dirv.y > 0.0 ? (1.0 - s.y) / dirv.y : (dirv.y < 0.0 ? -s.y / dirv.y : 1e9);
		float travel = min(tx, ty) + 0.5 + reach * (1.0 + grow);
		vec2 off = dirv * travel * e;
		float ang = (r.y - 0.5) * 2.0 * spin * e;
		float sc = 1.0 + grow * e * (0.5 + r.x);

		vec2 rel = (q - s - off) / sc;
		float ca = cos(ang);
		float sa = sin(ang);
		vec2 urel = vec2(ca * rel.x + sa * rel.y, -sa * rel.x + ca * rel.y);
		if (length(urel) > reach) continue;
		vec2 u = s + urel;
		if (u.x < 0.0 || u.x > ratio || u.y < 0.0 || u.y > 1.0) continue;
		if (nearestId(u, grid) != id) continue;

		vec4 c = getFromColor(vec2(u.x / ratio, u.y));
		float line = 1.0 - smoothstep(0.0, 0.0045, edgeDist(u, id, grid));
		c.rgb *= 1.0 - 0.3 * e;
		c.rgb += edgeColor * line * edgeGlow * crack * (1.0 - 0.45 * e);
		c.rgb += vec3(flash * hit);
		col = c;
		break;
	}
	return vec4(col.rgb, 1.0);
}`;

const make = makeGlTransition(BODY, {
	cells: 18,
	seed: 0,
	origin: [0.5, 0.5] as readonly [number, number],
	spin: 1.4,
	grow: 0.35,
	edgeColor: [0.82, 0.95, 1] as readonly [number, number, number],
	edgeGlow: 0.9,
	flash: 0.22,
	parallax: 0.06,
	backDim: 0.45,
});

/**
 * Glass-break: after a crack beat the old frame splits into voronoi shards that burst away from an impact point, tumbling and
 * growing towards the camera, until the next scene is clear. 24-36 frames.
 * Cost grows with the shard count (about cells x 9 distance tests per pixel): keep it under ~40 for 4K.
 */
export const shatter = (props: ShatterProps = {}) => {
	const {edgeColor, cells, ...rest} = props;
	return make({
		...rest,
		...(cells === undefined ? {} : {cells: Math.min(Math.max(cells, 2), 64)}),
		...(edgeColor === undefined ? {} : {edgeColor: hexToRgb(edgeColor)}),
	});
};

const Demo = makeTransitionDemo([{presentation: shatter(), durationInFrames: 32, timing: linearTiming({durationInFrames: 32})}], 8, 8);

export const shatterEntry: LibraryEntry = {
	meta: {
		id: 'shatter',
		title: 'Shatter',
		category: 'transitions',
		looks: 'A crack flashes across the frame, then it splits into glass shards that burst outward from the centre, spinning and swelling past the camera to uncover the next scene.',
		use: 'Impact cuts: a hit that breaks the scene, a boss slam, a reveal where the old world is destroyed.',
		exportName: 'shatter',
		durationInFrames: 48,
		source: {
			kind: 'ported',
			name: 'gl-transitions fragment (lbl)',
			url: 'https://github.com/gl-transitions/gl-transitions/blob/master/transitions/fragment.glsl',
			license: 'MIT',
		},
	},
	Demo,
};
