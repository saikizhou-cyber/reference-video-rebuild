// Ported from GTKottman/remotion-transitions (https://github.com/GTKottman/remotion-transitions), MIT, Copyright (c) 2026 GTKottman and contributors.
// Changes: rebuilt as a DOM presentation (A + rings in, B + hole out, swap hidden under the full cover); added square / diamond shapes, an origin tuple,
// sharper burst easing and a hairline ink edge; the in / out split ("bridged") logic is re-implemented here.
import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {DEMO} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {TransitionDemo, demoFrames, seg, useSvgId} from './_dom-utils';

export type ShapeBurstProps = {
	/** ring colours in order of appearance; the last one covers the frame, so make it close to the incoming scene's key colour */
	colors?: string[];
	/** burst centre as fractions of the frame, [x, y] */
	origin?: readonly [number, number];
	shape?: 'circle' | 'square' | 'diamond';
	/** share of the transition spent fully covered (the swap happens there) */
	hold?: number;
	/** hairline between the rings, px at 720p (0 = none); uses `edgeColor` */
	edge?: number;
	edgeColor?: string;
};

type Layer = {phase: 'in' | 'out'; progress: number} & Required<Pick<ShapeBurstProps, 'colors' | 'origin' | 'shape' | 'edge' | 'edgeColor'>>;

/** explosive start, no long soft tail: the cover is complete shortly before the hold ends */
const BURST = (t: number): number => Math.pow(t, 0.6);

/** radius at which `shape` centred on (cx, cy) covers the whole frame */
const coverRadius = (shape: ShapeBurstProps['shape'], cx: number, cy: number, w: number, h: number): number => {
	const dx = Math.max(cx, w - cx);
	const dy = Math.max(cy, h - cy);
	return (shape === 'square' ? Math.max(dx, dy) : shape === 'diamond' ? dx + dy : Math.hypot(dx, dy)) + 2;
};

const shapeEl = (shape: ShapeBurstProps['shape'], cx: number, cy: number, r: number, fill: string, stroke: string, sw: number, key: React.Key) => {
	if (r <= 0.2) {
		return null;
	}
	const common = {fill, stroke: sw > 0 ? stroke : 'none', strokeWidth: sw};
	if (shape === 'square') {
		return <rect key={key} x={cx - r} y={cy - r} width={2 * r} height={2 * r} {...common} />;
	}
	if (shape === 'diamond') {
		return <polygon key={key} points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} {...common} />;
	}
	return <circle key={key} cx={cx} cy={cy} r={r} {...common} />;
};

const BurstLayer: React.FC<Layer> = ({phase, progress, colors, origin, shape, edge, edgeColor}) => {
	const {width: W, height: H} = useVideoConfig();
	const id = useSvgId('burst');
	const u = Math.min(W, H) / 720;
	const cx = origin[0] * W;
	const cy = origin[1] * H;
	const R = coverRadius(shape, cx, cy, W, H);
	const ringR = (k: number, count: number) => {
		const start = (k / count) * 0.4;
		return R * BURST(seg(progress, start, start + 0.733));
	};
	const n = colors.length;
	const sw = edge * u;
	if (phase === 'in') {
		return (
			<svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
				{colors.map((c, k) => shapeEl(shape, cx, cy, ringR(k, n), c, edgeColor, k === 0 ? 0 : sw, k))}
			</svg>
		);
	}
	// out: the other colours burst again over the last one, in reverse order, then a hole opens onto the new scene
	const inner = colors.slice(0, -1).reverse();
	const holeR = ringR(inner.length, inner.length + 1);
	return (
		<svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
			<defs>
				<mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
					<rect width={W} height={H} fill="#fff" />
					{shapeEl(shape, cx, cy, holeR, '#000', '#000', 0, 'hole')}
				</mask>
			</defs>
			<g mask={`url(#${id})`}>
				<rect width={W} height={H} fill={colors[n - 1]} />
				{inner.map((c, k) => shapeEl(shape, cx, cy, ringR(k, inner.length + 1), c, edgeColor, sw, k))}
			</g>
		</svg>
	);
};

const ShapeBurstPresentation: React.FC<TransitionPresentationComponentProps<ShapeBurstProps>> = ({
	children,
	presentationDirection,
	presentationProgress: p,
	passedProps,
}) => {
	const {colors = [DEMO.ink, DEMO.paper, DEMO.yellow], origin = [0.5, 0.5], shape = 'circle', hold = 0, edge = 3, edgeColor = DEMO.ink} = passedProps;
	const inEnd = 0.5 - hold / 2;
	const outStart = 0.5 + hold / 2;
	const common = {colors, origin, shape, edge, edgeColor} as const;
	if (presentationDirection === 'exiting') {
		return (
			<AbsoluteFill>
				{children}
				<BurstLayer phase="in" progress={Math.min(1, p / inEnd)} {...common} />
			</AbsoluteFill>
		);
	}
	if (p < inEnd) {
		return null;
	}
	return (
		<AbsoluteFill>
			{children}
			<BurstLayer phase="out" progress={Math.min(1, Math.max(0, (p - outStart) / (0.95 - outStart)))} {...common} />
		</AbsoluteFill>
	);
};

/** Rings burst from a point one after another until the last colour covers the frame, then burst back to open a hole onto the new scene. Use with linearTiming, 36-60 frames. */
export const shapeBurst = (props: ShapeBurstProps = {}): TransitionPresentation<ShapeBurstProps> => ({
	component: ShapeBurstPresentation,
	props,
});

const T = 36;

const Demo: React.FC = () => (
	<TransitionDemo presentation={shapeBurst()} transition={T} lead={5} />
);

export const shapeBurstEntry: LibraryEntry = {
	meta: {
		id: 'shape-burst',
		title: 'Shape burst',
		category: 'transitions',
		looks: 'Ink, paper and yellow rings burst out of the centre one after another until yellow covers the frame, then burst back and open a hole onto the new scene.',
		use: 'Logo moments and section breaks with a toy-box or pop-art tone; swap colours to match the incoming scene.',
		exportName: 'shapeBurst',
		durationInFrames: demoFrames(T, 1, 5),
		source: {kind: 'ported', name: 'GTKottman/remotion-transitions (shape-burst)', url: 'https://github.com/GTKottman/remotion-transitions/blob/main/transitions/04-cover/geometric/shape-burst/index.tsx', license: 'MIT'},
	},
	Demo,
};
