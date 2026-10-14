import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {
	TransitionSeries,
	linearTiming,
	type TransitionPresentation,
	type TransitionPresentationComponentProps,
} from '@remotion/transitions';
import {useGsapAt, type GsapBuild} from '../../core/gsap';
import {DEMO, SceneA, SceneB} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

/** where the tiles start from: a grid cell [col, row] (0-based, from the top left) or a named pattern */
export type TileOrigin = 'center' | 'edges' | 'start' | 'end' | readonly [number, number];

export type TileWipeProps = {
	/** tiles across */
	cols?: number;
	/** tiles down */
	rows?: number;
	/**
	 * where the cover starts: 'center' spreads outwards, 'edges' closes inwards, 'start' / 'end' sweep diagonally from the
	 * top-left / bottom-right corner, [col, row] radiates from that tile. The tiles leave from the opposite origin.
	 */
	from?: TileOrigin;
	/** tile colours, cycled diagonally (col + row), so two colours make a checkerboard and three a diagonal weave */
	colors?: readonly string[];
	/** visible gap between tiles while the grid is still opening / closing, px at 720p */
	gap?: number;
	/** degrees each tile spins through while it scales (alternating direction) */
	rotate?: number;
	/** 0 = square tiles, 1 = round tiles (the corners square off while the grid is closed) */
	roundness?: number;
	/** share of the transition the grid stays fully closed (the scenes swap inside it) */
	hold?: number;
	/** ease of the stagger distribution (GSAP ease name): how the start times spread over the grid */
	ease?: string;
};

const DEFAULTS = {
	cols: 16,
	rows: 9,
	from: 'center' as TileOrigin,
	colors: [DEMO.yellow, DEMO.ink] as readonly string[],
	gap: 6,
	rotate: 24,
	roundness: 0.35,
	hold: 0.14,
	ease: 'power1.inOut',
};

/** the last transition frame of a linear timing is (T - 1) / T: finish a little early so that frame is already clean */
const FINISH = 0.92;

const opposite = (o: TileOrigin, cols: number, rows: number): TileOrigin => {
	if (o === 'center') {
		return 'edges';
	}
	if (o === 'edges') {
		return 'center';
	}
	if (o === 'start') {
		return 'end';
	}
	if (o === 'end') {
		return 'start';
	}
	return [cols - 1 - o[0], rows - 1 - o[1]];
};

/** GSAP's stagger `from` takes ratios 0..1 of the grid, not cell indices */
const staggerFrom = (o: TileOrigin, cols: number, rows: number): 'center' | 'edges' | 'start' | 'end' | [number, number] =>
	typeof o === 'string' ? o : [(Math.min(cols - 1, Math.max(0, o[0])) + 0.5) / cols, (Math.min(rows - 1, Math.max(0, o[1])) + 0.5) / rows];

/**
 * The 1-second timeline, as fractions of it: tiles pop in over [0, L] (`d` each, starts spread over `a`), snap shut
 * (lock), stay closed (flat), open the gaps again (lock) and shrink away over [L + hold, 1].
 */
const layout = (hold: number) => {
	const h = Math.min(0.4, Math.max(0.06, hold));
	const L = (1 - h) / 2;
	const lock = h * 0.35;
	const flat = h - 2 * lock;
	return {h, L, d: L * 0.5, a: L * 0.5, lock, flat, swapAt: L + lock + flat / 2};
};

const TileWipePresentation: React.FC<TransitionPresentationComponentProps<TileWipeProps>> = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}) => {
	const {width: W, height: H} = useVideoConfig();
	const u = Math.min(W, H) / 720;
	const cols = Math.max(1, Math.round(passedProps.cols ?? DEFAULTS.cols));
	const rows = Math.max(1, Math.round(passedProps.rows ?? DEFAULTS.rows));
	const from = passedProps.from ?? DEFAULTS.from;
	const colors = passedProps.colors?.length ? passedProps.colors : DEFAULTS.colors;
	const rotate = passedProps.rotate ?? DEFAULTS.rotate;
	const roundness = Math.min(1, Math.max(0, passedProps.roundness ?? DEFAULTS.roundness));
	const ease = passedProps.ease ?? DEFAULTS.ease;
	const T = layout(passedProps.hold ?? DEFAULTS.hold);

	// geometry in real pixels: every tile is a bw x bh box centred in its cell; the `lock` scale makes it overlap its
	// neighbours by 2 px so a closed grid is one solid sheet (no anti-aliasing seams, no corner holes)
	const cw = W / cols;
	const ch = H / rows;
	const gap = Math.min((passedProps.gap ?? DEFAULTS.gap) * u, Math.min(cw, ch) * 0.8);
	const bw = cw - gap;
	const bh = ch - gap;
	const closeX = (cw + 2 * u) / bw;
	const closeY = (ch + 2 * u) / bh;
	const radius = (roundness * Math.min(bw, bh)) / 2;
	const sig = [cols, rows, JSON.stringify(from), rotate, roundness, ease, T.h, W, H, u, gap].join('~');

	const build: GsapBuild<HTMLDivElement> = (tl, q) => {
		const tiles = q('.tile');
		const grid: [number, number] = [rows, cols];
		const sign = (i: number) => (((i % cols) + Math.floor(i / cols)) % 2 ? 1 : -1);
		const stagIn = {grid, from: staggerFrom(from, cols, rows), amount: T.a, ease};
		const stagOut = {grid, from: staggerFrom(opposite(from, cols, rows), cols, rows), amount: T.a, ease};
		// pop in: scale from 0 with a spin
		tl.fromTo(
			tiles,
			{scaleX: 0, scaleY: 0, rotation: (i: number) => sign(i) * rotate},
			{scaleX: 1, scaleY: 1, rotation: 0, duration: T.d, ease: 'power3.out', stagger: stagIn},
			0,
		);
		// snap shut: close the gaps, square the corners
		tl.fromTo(
			tiles,
			{scaleX: 1, scaleY: 1, borderRadius: radius},
			{scaleX: closeX, scaleY: closeY, borderRadius: 0, duration: T.lock, ease: 'power2.in', immediateRender: false},
			T.L,
		);
		// open again, then shrink away from the opposite origin, spinning on in the same direction
		tl.fromTo(
			tiles,
			{scaleX: closeX, scaleY: closeY, borderRadius: 0},
			{scaleX: 1, scaleY: 1, borderRadius: radius, duration: T.lock, ease: 'power2.out', immediateRender: false},
			T.L + T.lock + T.flat,
		);
		tl.fromTo(
			tiles,
			{scaleX: 1, scaleY: 1, rotation: 0},
			{scaleX: 0, scaleY: 0, rotation: (i: number) => -sign(i) * rotate, duration: T.d, ease: 'power3.in', stagger: stagOut, immediateRender: false},
			T.L + T.h,
		);
	};

	// a timeline of exactly 1 s: its time is the (slightly accelerated) transition progress
	const t = Math.min(1, presentationProgress / FINISH);
	const scope = useGsapAt<HTMLDivElement>(build, t, [sig]);

	if (presentationDirection === 'exiting') {
		return <AbsoluteFill>{children}</AbsoluteFill>;
	}
	const tiles: React.ReactNode[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			tiles.push(
				<div
					key={r * cols + c}
					className="tile"
					style={{
						position: 'absolute',
						left: c * cw + gap / 2,
						top: r * ch + gap / 2,
						width: bw,
						height: bh,
						borderRadius: radius,
						background: colors[(c + r) % colors.length],
					}}
				/>,
			);
		}
	}
	return (
		<AbsoluteFill>
			{/* the incoming scene stays hidden until the grid is shut; the old scene is under it all along */}
			<AbsoluteFill style={{visibility: t >= T.swapAt ? 'visible' : 'hidden'}}>{children}</AbsoluteFill>
			<div ref={scope} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
				{tiles}
			</div>
		</AbsoluteFill>
	);
};

/**
 * A grid of solid tiles pops in over the old scene in a GSAP grid-stagger wave (from the centre, the edges or a corner),
 * snaps shut, the scenes swap inside the closed grid, then the tiles shrink away from the opposite origin.
 * Use with linearTiming, 24-45 frames.
 */
export const tileWipe = (props: TileWipeProps = {}): TransitionPresentation<TileWipeProps> => ({
	component: TileWipePresentation,
	props,
});

/** demo: one 36-frame transition with 6 frames of scene A before it and 8 frames of scene B after it */
const TT = 36;
const LEAD_A = 6;
const LEAD_B = 8;

const Demo: React.FC = () => (
	<TransitionSeries>
		<TransitionSeries.Sequence durationInFrames={LEAD_A + TT}>
			<SceneA />
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition presentation={tileWipe()} timing={linearTiming({durationInFrames: TT})} />
		<TransitionSeries.Sequence durationInFrames={TT + LEAD_B}>
			<SceneB />
		</TransitionSeries.Sequence>
	</TransitionSeries>
);

export const tileWipeEntry: LibraryEntry = {
	meta: {
		id: 'tile-wipe',
		title: 'Tile wipe',
		category: 'transitions',
		looks: 'A 16x9 grid of rounded yellow and black tiles pops in from the centre outwards, each spinning up from nothing, snaps shut into a solid checkerboard over the old scene, then shrinks away from the edges inwards to uncover the new one.',
		use: 'Hard section changes, level or chapter cuts, UI-flavoured PVs; pick the origin with `from` to match the shot direction.',
		exportName: 'tileWipe',
		durationInFrames: LEAD_A + TT + LEAD_B,
		deps: ['gsap'],
		source: {kind: 'original'},
	},
	Demo,
};
