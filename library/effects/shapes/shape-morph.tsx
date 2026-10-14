// Inspired by flubber (https://github.com/veltman/flubber), MIT: the idea of normalising two shapes to rings with the same number of points, rotating one to minimise travel,
// and interpolating point by point. No flubber code is used; the implementation here is written from scratch and parses paths with @remotion/paths (parsePath / reduceInstructions).
import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {parsePath, reduceInstructions} from '@remotion/paths';
import {CURVES} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {MONO_FONT, clamp01, lerp, mixColor, polyPath} from './_hud-utils';

export type ShapeName = 'circle' | 'star' | 'burst' | 'badge' | 'hex' | 'diamond' | 'triangle' | 'cross' | 'shield';
/** a preset, or any single-outline SVG path (it is centred and fitted to the unit box automatically) */
export type ShapeSpec = ShapeName | {d: string};

export type ShapeMorphProps = {
	shapes?: ReadonlyArray<ShapeSpec>;
	/** one fill per shape, mixed while morphing (cycled if shorter) */
	fills?: ReadonlyArray<string>;
	/** frames each shape sits still before the next morph */
	holdFrames?: number;
	/** frames a morph takes */
	morphFrames?: number;
	/** after the last shape, morph back to the first (false = hold the last forever) */
	loop?: boolean;
	/** width of the shape's bounding circle, px at 720p */
	size?: number;
	/** constant rotation, degrees per second */
	spin?: number;
	/** extra rotation added during every morph, degrees */
	twist?: number;
	/** swell during a morph, 0.1 = 10 % bigger at the middle */
	punch?: number;
	/** 0..1: how much the morph sweeps round the outline instead of moving every point at once */
	ripple?: number;
	/** an outline copy that trails behind the shape at a larger scale */
	echo?: boolean;
	/** outline colour of the shape itself (null = none) */
	stroke?: string | null;
	strokeWidth?: number;
	/** points in the normalised ring: more = smoother curves, crisper corners */
	points?: number;
	easing?: (t: number) => number;
	/** centre in px at 720p (default: middle of the composition) */
	x?: number;
	y?: number;
};

type Pt = [number, number];

const DEFAULT_SHAPES: ShapeName[] = ['circle', 'star', 'badge', 'hex'];
const DEFAULT_FILLS = [DEMO.yellow, DEMO.red, DEMO.cyan, DEMO.paper];

const polar = (n: number, outer: number, inner: number | null, start = -Math.PI / 2): Pt[] => {
	const out: Pt[] = [];
	const count = inner === null ? n : n * 2;
	for (let i = 0; i < count; i++) {
		const a = start + (i / count) * Math.PI * 2;
		const r = inner === null || i % 2 === 0 ? outer : inner;
		out.push([Math.cos(a) * r, Math.sin(a) * r]);
	}
	return out;
};

const SHIELD = 'M0 -1 L0.86 -0.72 L0.86 0.08 C0.86 0.56 0.42 0.86 0 1 C-0.42 0.86 -0.86 0.56 -0.86 0.08 L-0.86 -0.72 Z';

/** an outline as a list of segments (each a polyline); corners always sit on segment ends */
type Seg = Pt[];

const closeSegs = (pts: Pt[]): Seg[] => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);

const chunk = (pts: Pt[], size: number): Seg[] => {
	const out: Seg[] = [];
	for (let i = 0; i < pts.length; i += size) {
		const part = pts.slice(i, i + size + 1);
		if (part.length < size + 1) {
			part.push(pts[0]);
		}
		out.push(part);
	}
	return out;
};

const cubic = (p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt => {
	const m = 1 - t;
	return [
		m * m * m * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * p1[0],
		m * m * m * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * p1[1],
	];
};

/** first outline of an SVG path as segments, fitted to the [-1, 1] box */
const segsFromPath = (d: string): Seg[] => {
	const ins = reduceInstructions(parsePath(d));
	const segs: Seg[] = [];
	let cur: Pt = [0, 0];
	let start: Pt = [0, 0];
	let started = false;
	for (const i of ins) {
		if (i.type === 'M') {
			if (started) {
				break;
			}
			started = true;
			cur = [i.x, i.y];
			start = cur;
		} else if (i.type === 'L') {
			segs.push([cur, [i.x, i.y]]);
			cur = [i.x, i.y];
		} else if (i.type === 'C') {
			const end: Pt = [i.x, i.y];
			const seg: Seg = [];
			for (let k = 0; k <= 16; k++) {
				seg.push(cubic(cur, [i.cp1x, i.cp1y], [i.cp2x, i.cp2y], end, k / 16));
			}
			segs.push(seg);
			cur = end;
		} else if (i.type === 'Z') {
			break;
		}
	}
	if (segs.length && (Math.abs(cur[0] - start[0]) > 1e-6 || Math.abs(cur[1] - start[1]) > 1e-6)) {
		segs.push([cur, start]);
	}
	return segs;
};

const fit = (segs: Seg[]): Seg[] => {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	segs.forEach((s) =>
		s.forEach(([x, y]) => {
			x0 = Math.min(x0, x);
			y0 = Math.min(y0, y);
			x1 = Math.max(x1, x);
			y1 = Math.max(y1, y);
		}),
	);
	const k = 2 / Math.max(1e-6, Math.max(x1 - x0, y1 - y0));
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;
	return segs.map((s) => s.map(([x, y]) => [(x - cx) * k, (y - cy) * k] as Pt));
};

const presetSegs = (name: ShapeName): Seg[] => {
	switch (name) {
		case 'circle':
			return chunk(polar(96, 1, null), 6);
		case 'star':
			return closeSegs(polar(5, 1, 0.46));
		case 'burst':
			return closeSegs(polar(12, 1, 0.68));
		case 'badge': {
			const pts: Pt[] = [];
			for (let i = 0; i < 336; i++) {
				const a = -Math.PI / 2 + (i / 336) * Math.PI * 2;
				const r = 0.88 + 0.12 * Math.cos(a * 14 + Math.PI * 7);
				pts.push([Math.cos(a) * r, Math.sin(a) * r]);
			}
			return chunk(pts, 8);
		}
		case 'hex':
			return closeSegs(polar(6, 1, null));
		case 'diamond':
			return closeSegs([
				[0, -1],
				[0.74, 0],
				[0, 1],
				[-0.74, 0],
			]);
		case 'triangle':
			return closeSegs(polar(3, 1, null).map(([x, y]) => [x, y + 0.2] as Pt));
		case 'cross': {
			const a = 0.34;
			const e = 0.95;
			return closeSegs([
				[-a, -e],
				[a, -e],
				[a, -a],
				[e, -a],
				[e, a],
				[a, a],
				[a, e],
				[-a, e],
				[-a, a],
				[-e, a],
				[-e, -a],
				[-a, -a],
			]);
		}
		case 'shield':
			return segsFromPath(SHIELD);
	}
};

const segLen = (s: Seg): number => {
	let l = 0;
	for (let i = 1; i < s.length; i++) {
		l += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
	}
	return l;
};

const pointAt = (s: Seg, d: number): Pt => {
	let left = d;
	for (let i = 1; i < s.length; i++) {
		const l = Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
		if (left <= l || i === s.length - 1) {
			const k = l > 0 ? Math.min(1, left / l) : 0;
			return [lerp(s[i - 1][0], s[i][0], k), lerp(s[i - 1][1], s[i][1], k)];
		}
		left -= l;
	}
	return s[0];
};

/** N points round the outline, every segment end (= corner) kept, the rest spread by length */
const ringFromSegs = (segs: Seg[], N: number): Pt[] => {
	const lens = segs.map(segLen);
	const total = lens.reduce((a, b) => a + b, 0) || 1;
	const ideal = lens.map((l) => (N * l) / total);
	const counts = ideal.map((v) => Math.max(1, Math.floor(v)));
	let rest = N - counts.reduce((a, b) => a + b, 0);
	const order = ideal.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
	for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) {
		counts[order[k][1]]++;
	}
	// too many (many tiny segments): take points back from the biggest counts
	for (let k = 0; rest < 0; k = (k + 1) % counts.length) {
		if (counts[k] > 1) {
			counts[k]--;
			rest++;
		}
	}
	const ring: Pt[] = [];
	segs.forEach((s, i) => {
		for (let k = 0; k < counts[i]; k++) {
			ring.push(pointAt(s, (k / counts[i]) * lens[i]));
		}
	});
	// clockwise on screen (y down) for every shape
	let area = 0;
	ring.forEach((p, i) => {
		const q = ring[(i + 1) % ring.length];
		area += p[0] * q[1] - q[0] * p[1];
	});
	return area < 0 ? ring.reverse() : ring;
};

const toRing = (s: ShapeSpec, N: number): Pt[] => ringFromSegs(typeof s === 'string' ? presetSegs(s) : fit(segsFromPath(s.d)), N);

/** `b` rotated along the ring so that its points travel the least to reach `a` */
const align = (a: Pt[], b: Pt[]): Pt[] => {
	const N = a.length;
	let best = 0;
	let bestCost = Infinity;
	for (let s = 0; s < N; s++) {
		let cost = 0;
		for (let k = 0; k < N; k++) {
			const q = b[(k + s) % N];
			cost += (a[k][0] - q[0]) ** 2 + (a[k][1] - q[1]) ** 2;
		}
		if (cost < bestCost) {
			bestCost = cost;
			best = s;
		}
	}
	return a.map((_, k) => b[(k + best) % N]);
};

/** Where a morph timeline stands at `frame`: which shape it leaves, which it heads for and how far (0..1, unclamped easing left to the caller). */
export const morphState = (frame: number, n: number, hold: number, morph: number, loop: boolean): {from: number; to: number; p: number; morphs: number} => {
	const S = Math.max(1, hold + morph);
	if (n < 2) {
		return {from: 0, to: 0, p: 0, morphs: 0};
	}
	const lastStart = (loop ? n : n - 1) * S;
	if (!loop && frame >= lastStart) {
		return {from: n - 1, to: n - 1, p: 0, morphs: n - 1};
	}
	const c = loop ? frame % (S * n) : frame;
	const cycles = loop ? Math.floor(frame / (S * n)) : 0;
	const i = Math.floor(c / S);
	const local = c - i * S;
	return {from: i, to: (i + 1) % n, p: local < hold ? 0 : clamp01((local - hold) / Math.max(1, morph)), morphs: cycles * n + i};
};

/**
 * One shape turns into the next: both outlines are normalised to the same number of points (corners kept), lined up so the
 * points travel the least, and interpolated while the colour mixes, the shape swells and twists. Starts at frame 0 of its <Sequence>.
 */
export const ShapeMorph: React.FC<ShapeMorphProps> = ({
	shapes = DEFAULT_SHAPES,
	fills = DEFAULT_FILLS,
	holdFrames = 12,
	morphFrames = 12,
	loop = true,
	size = 300,
	spin = 18,
	twist = 90,
	punch = 0.1,
	ripple = 0.14,
	echo = true,
	stroke = null,
	strokeWidth = 3,
	points = 160,
	easing = CURVES.inOutCubic,
	x,
	y,
}) => {
	const frame = useCurrentFrame();
	const {width: W, height: H, fps} = useVideoConfig();
	const u = useUnit();
	const key = JSON.stringify(shapes) + '|' + points;
	const rings = useMemo(() => {
		const base = shapes.map((s) => toRing(s, points));
		const next = base.map((b, i) => align(b, base[(i + 1) % base.length]));
		return {base, next};
	}, [key]); // eslint-disable-line react-hooks/exhaustive-deps

	const n = shapes.length;
	const st = morphState(frame, n, holdFrames, morphFrames, loop);
	const e = easing(st.p);
	const from = rings.base[st.from];
	const to = rings.next[st.from];
	const pts: Pt[] = from.map((a, k) => {
		// ripple: points further round the ring start a little later (but all finish together)
		const lag = ripple * (k / from.length);
		const local = ripple > 0 ? easing(clamp01((st.p - lag) / Math.max(0.0001, 1 - ripple))) : e;
		return [lerp(a[0], to[k][0], local), lerp(a[1], to[k][1], local)];
	});
	const fill = n > 1 && st.from !== st.to ? mixColor(fills[st.from % fills.length], fills[st.to % fills.length], e) : fills[0];
	const R = (size * u) / 2;
	const rot = (spin * frame) / fps + twist * (st.morphs + e);
	const swell = 1 + punch * Math.sin(Math.PI * st.p);
	const cx = x !== undefined ? x * u : W / 2;
	const cy = y !== undefined ? y * u : H / 2;
	const d = polyPath(pts);

	return (
		<AbsoluteFill>
			<svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
				{echo ? (
					<path
						d={d}
						transform={`translate(${cx} ${cy}) rotate(${-rot * 0.5}) scale(${R * 1.22 * swell})`}
						fill="none"
						stroke={fill}
						strokeWidth={(2.5 * u) / (R * 1.22 * swell)}
						strokeLinejoin="round"
						opacity={0.6}
					/>
				) : null}
				<path
					d={d}
					transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${R * swell})`}
					fill={fill}
					stroke={stroke ?? 'none'}
					strokeWidth={stroke ? (strokeWidth * u) / (R * swell) : 0}
					strokeLinejoin="round"
				/>
			</svg>
		</AbsoluteFill>
	);
};

const NAMES = ['CIRCLE', 'STAR', 'BADGE', 'HEX'];

const Demo: React.FC = () => {
	const u = useUnit();
	const frame = useCurrentFrame();
	const st = morphState(frame, 4, 12, 12, true);
	const name = NAMES[st.p > 0.5 ? st.to : st.from];
	return (
		<Backdrop color="#07090d">
			<AbsoluteFill
				style={{
					opacity: 0.5,
					backgroundImage: `linear-gradient(rgba(244,241,234,0.06) ${u}px, transparent ${u}px), linear-gradient(90deg, rgba(244,241,234,0.06) ${u}px, transparent ${u}px)`,
					backgroundSize: `${64 * u}px ${64 * u}px`,
				}}
			/>
			<ShapeMorph size={360} y={340} />
			<div style={{position: 'absolute', left: 0, right: 0, bottom: 58 * u, textAlign: 'center', fontFamily: DISPLAY_FONT, fontSize: 44 * u, letterSpacing: 10 * u, color: DEMO.paper}}>{name}</div>
			<div style={{position: 'absolute', left: 0, right: 0, bottom: 34 * u, textAlign: 'center', fontFamily: MONO_FONT, fontSize: 14 * u, letterSpacing: 6 * u, color: DEMO.paper, opacity: 0.4}}>
				{String(((st.p > 0.5 ? st.to : st.from) % 4) + 1).padStart(2, '0')} / 04
			</div>
		</Backdrop>
	);
};

export const shapeMorphEntry: LibraryEntry = {
	meta: {
		id: 'shape-morph',
		title: 'Shape morph',
		category: 'shapes',
		looks: 'A solid shape melts into the next (circle, star, badge, hexagon, or any SVG path) with a colour mix, a swell and a twist while an outline echo turns the other way.',
		use: 'Logo and icon transformations, rank / tier changes, loot-rarity swaps and rhythmic shape cuts on the beat.',
		exportName: 'ShapeMorph',
		durationInFrames: 96,
		source: {kind: 'inspired', name: 'flubber', url: 'https://github.com/veltman/flubber'},
	},
	Demo,
};
