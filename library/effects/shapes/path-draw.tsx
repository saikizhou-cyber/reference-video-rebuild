// Ported from anime.js drawable (https://github.com/juliangarnier/anime/blob/master/src/svg/drawable.js), MIT, Copyright (c) 2025 Julian Garnier.
// Changes: the "draw = start end" dash maths (trim window along a path) now runs from React props with pathLength={1} instead of a DOM proxy; added comet taper (opacity / width steps), wrap-around
// loops, a head dot, glow, @remotion/paths length / point lookups and per-path timing modes (delayed / sync / oneByOne / scenario) in the spirit of Vivus (MIT), whose code is not used. Modified.
import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, useCurrentFrame} from 'remotion';
import {getLength, getPointAtLength} from '@remotion/paths';
import {Backdrop, DEMO, useUnit} from '../../core/scene';
import {progress} from '../../core/easing';
import type {LibraryEntry} from '../../core/types';
import {MONO_FONT, clamp01, dashWindow} from './_hud-utils';

export type PathSpec = {
	d: string;
	color?: string;
	/** stroke width in design units (see `viewBox`) */
	width?: number;
	/** fill that fades in once this path has finished drawing (draw mode) */
	fill?: string;
	/** `scenario` sequence: start frame and length in frames, relative to `delay` */
	start?: number;
	duration?: number;
};

export type PathDrawProps = {
	paths: ReadonlyArray<string | PathSpec>;
	/** the design space the path data lives in; the drawing scales to fit the composition */
	viewBox?: {width: number; height: number};
	/** draw = the stroke grows from the start; trim = a window (comet / laser) travels along the path */
	mode?: 'draw' | 'trim';
	/** delayed = staggered overlap, sync = together, oneByOne = back to back (time ~ length), scenario = per-path start / duration */
	sequence?: 'delayed' | 'sync' | 'oneByOne' | 'scenario';
	/** frames for the whole set (draw) or for one lap (trim, loop) */
	duration?: number;
	delay?: number;
	easing?: (t: number) => number;
	color?: string;
	colors?: ReadonlyArray<string>;
	strokeWidth?: number;
	linecap?: 'butt' | 'round' | 'square';
	/** trim mode: share of the path length inside the window */
	windowSize?: number;
	/** trim mode: keep lapping (best on closed paths) */
	loop?: boolean;
	/** trim + loop: lap offset between consecutive paths (0..1) */
	phase?: number;
	/** bright dot riding the leading end */
	head?: boolean;
	/** wide faint underlay along the drawn part */
	glow?: boolean;
	/** trim mode: fade and thin the tail into a comet */
	taper?: boolean;
	/** frames the per-path fills take to fade in */
	fillFrames?: number;
	style?: React.CSSProperties;
};

type Timing = {start: number; dur: number};

const timings = (n: number, lens: number[], sequence: NonNullable<PathDrawProps['sequence']>, duration: number, specs: PathSpec[]): Timing[] => {
	if (sequence === 'sync') {
		return specs.map(() => ({start: 0, dur: duration}));
	}
	if (sequence === 'oneByOne') {
		const total = lens.reduce((a, b) => a + b, 0) || 1;
		let at = 0;
		return lens.map((l) => {
			const dur = (duration * l) / total;
			const out = {start: at, dur};
			at += dur;
			return out;
		});
	}
	if (sequence === 'scenario') {
		return specs.map((s) => ({start: s.start ?? 0, dur: Math.max(1, s.duration ?? duration)}));
	}
	// delayed: every path takes `dur`, each one starts a third of that after the previous
	const dur = duration / (1 + (n - 1) / 3);
	return specs.map((_, i) => ({start: (i * dur) / 3, dur}));
};

/** [a, b] on an unwrapped 0..1 axis -> the pieces that lie on the path (wrapping once when `wrap`). */
const pieces = (a: number, b: number, wrap: boolean): Array<[number, number]> => {
	if (b <= a) {
		return [];
	}
	if (!wrap) {
		const lo = Math.max(0, a);
		const hi = Math.min(1, b);
		return hi > lo ? [[lo, hi]] : [];
	}
	if (b <= 0) {
		return [[a + 1, b + 1]];
	}
	if (a < 0) {
		return [
			[a + 1, 1],
			[0, b],
		];
	}
	return [[a, Math.min(1, b)]];
};

/**
 * Draws SVG paths on, or runs a comet / laser window along them. Several paths can be staggered, synced, played one
 * after another or scripted. Starts at frame `delay` of its <Sequence>.
 */
export const PathDraw: React.FC<PathDrawProps> = ({
	paths,
	viewBox = {width: 1280, height: 720},
	mode = 'draw',
	sequence = 'delayed',
	duration = 48,
	delay = 0,
	easing = Easing.out(Easing.cubic),
	color = DEMO.cyan,
	colors,
	strokeWidth = 4,
	linecap = 'round',
	windowSize = 0.18,
	loop = false,
	phase = 0,
	head = false,
	glow = true,
	taper = true,
	fillFrames = 10,
	style,
}) => {
	const frame = useCurrentFrame();
	const specs = useMemo<PathSpec[]>(() => paths.map((p) => (typeof p === 'string' ? {d: p} : p)), [paths]);
	const lens = useMemo(() => specs.map((s) => getLength(s.d)), [specs]);
	const tm = useMemo(() => timings(specs.length, lens, sequence, duration, specs), [specs, lens, sequence, duration]);
	const t = frame - delay;
	if (t < 0) {
		return null;
	}

	return (
		<AbsoluteFill style={style}>
			<svg viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
				{specs.map((sp, i) => {
					const c = sp.color ?? colors?.[i % colors.length] ?? color;
					const w = sp.width ?? strokeWidth;
					const {start, dur} = tm[i];
					const raw = (t - start) / Math.max(1, dur);
					if (raw < 0) {
						return null;
					}
					const shown: React.ReactNode[] = [];
					let headU: number | null = null;

					if (mode === 'draw') {
						const p = easing(clamp01(raw));
						if (sp.fill) {
							const f = progress(t, start + dur, fillFrames, Easing.out(Easing.quad));
							if (f > 0) {
								shown.push(<path key="fill" d={sp.d} fill={sp.fill} stroke="none" opacity={f} />);
							}
						}
						if (p > 0.0004) {
							if (glow) {
								shown.push(<path key="glow" d={sp.d} pathLength={1} fill="none" stroke={c} strokeWidth={w * 3.2} strokeLinecap={linecap} opacity={0.14} {...dashWindow(0, p)} />);
							}
							shown.push(<path key="main" d={sp.d} pathLength={1} fill="none" stroke={c} strokeWidth={w} strokeLinecap={linecap} strokeLinejoin="round" {...dashWindow(0, p)} />);
							headU = p < 0.999 ? p : null;
						}
					} else {
						// trim: window [tail, head] on the path
						let hd: number;
						if (loop) {
							hd = (((raw + i * phase) % 1) + 1) % 1;
						} else {
							hd = easing(clamp01(raw)) * (1 + windowSize);
						}
						const tail = hd - windowSize;
						if (!loop && (hd <= 0 || tail >= 1)) {
							return null;
						}
						// the comet is built from nested windows that all end at the head: each layer starts a little later, is a little
						// wider and adds a little opacity, so the tail ramps up smoothly with no seams (a stack of abutting pieces shows dashes)
						const K = taper ? 14 : 1;
						if (glow) {
							const G = taper ? 4 : 1;
							for (let s = 0; s < G; s++) {
								pieces(tail + (windowSize * s) / G, hd, loop).forEach(([a, b], k) =>
									shown.push(<path key={`g${s}-${k}`} d={sp.d} pathLength={1} fill="none" stroke={c} strokeWidth={w * 3.4} strokeLinecap="butt" opacity={0.06} {...dashWindow(a, b)} />),
								);
							}
						}
						const layerAlpha = taper ? 1 - Math.pow(0.04, 1 / K) : 1;
						for (let s = 0; s < K; s++) {
							const a = tail + (windowSize * s) / K;
							const k = (s + 1) / K;
							pieces(a, hd, loop).forEach(([x0, x1], j) =>
								shown.push(
									<path
										key={`s${s}-${j}`}
										d={sp.d}
										pathLength={1}
										fill="none"
										stroke={c}
										strokeWidth={taper ? w * (0.25 + 0.75 * k) : w}
										strokeLinecap="butt"
										opacity={layerAlpha}
										{...dashWindow(x0, x1)}
									/>,
								),
							);
						}
						headU = loop ? hd : hd > 0 && hd < 1 ? hd : null;
					}

					if (head && headU !== null) {
						const pt = getPointAtLength(sp.d, headU * lens[i]);
						if (pt) {
							shown.push(
								<g key="head">
									<circle cx={pt.x} cy={pt.y} r={w * 2.6} fill={c} opacity={0.28} />
									<circle cx={pt.x} cy={pt.y} r={w * 1.15} fill="#ffffff" />
								</g>,
							);
						}
					}
					return <g key={i}>{shown}</g>;
				})}
			</svg>
		</AbsoluteFill>
	);
};

const HEX = 'M320 170 L484.5 265 L484.5 455 L320 550 L155.5 455 L155.5 265 Z';
const RING = 'M440 360 A120 120 0 1 1 200 360 A120 120 0 1 1 440 360 Z';
const BOLT = 'M348 246 L268 372 L322 372 L294 478 L382 336 L328 336 Z';
const INFINITY = 'M930 360 C1010 250 1190 250 1190 360 C1190 470 1010 470 930 360 C850 250 670 250 670 360 C670 470 850 470 930 360 Z';

const Demo: React.FC = () => {
	const u = useUnit();
	const cap: React.CSSProperties = {position: 'absolute', fontFamily: MONO_FONT, fontSize: 15 * u, letterSpacing: 5 * u, color: DEMO.paper, opacity: 0.45, top: 618 * u};
	return (
		<Backdrop color="#06080c">
			<PathDraw
				paths={[
					{d: HEX, color: DEMO.cyan, width: 5},
					{d: RING, color: DEMO.paper, width: 3},
					{d: BOLT, color: DEMO.yellow, width: 5, fill: DEMO.yellow},
				]}
				sequence="delayed"
				duration={54}
			/>
			<PathDraw paths={[INFINITY]} sequence="sync" duration={26} delay={10} color="rgba(41,224,255,0.28)" strokeWidth={4} glow={false} />
			<PathDraw paths={[INFINITY, INFINITY]} mode="trim" loop phase={0.5} duration={46} delay={16} windowSize={0.2} colors={[DEMO.cyan, DEMO.yellow]} strokeWidth={9} head easing={Easing.linear} />
			<div style={{...cap, left: 150 * u}}>DRAW-ON / DELAYED</div>
			<div style={{...cap, left: 690 * u}}>TRIM WINDOW / LOOP</div>
		</Backdrop>
	);
};

export const pathDrawEntry: LibraryEntry = {
	meta: {
		id: 'path-draw',
		title: 'Path draw',
		category: 'shapes',
		looks: 'SVG paths draw themselves on (staggered, in sync, one after another or scripted) with a fill that fades in after, or a tapered comet window with a bright head runs round them.',
		use: 'Logo and emblem build-ons, map routes, circuit lines, laser sweeps and light-trail loops.',
		exportName: 'PathDraw',
		durationInFrames: 96,
		source: {
			kind: 'ported',
			name: 'anime.js drawable',
			url: 'https://github.com/juliangarnier/anime/blob/master/src/svg/drawable.js',
			license: 'MIT',
		},
	},
	Demo,
};
