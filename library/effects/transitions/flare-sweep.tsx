// Ported from GTKottman/remotion-transitions (https://github.com/GTKottman/remotion-transitions), MIT, Copyright (c) 2026 GTKottman and contributors.
// Changes: rebuilt as a DOM presentation (A + flare in, B + flare out, swap hidden under the whiteout); added a hairline anamorphic line, a hot core,
// a hexagonal ghost, left / right direction, fade-in / fade-out at both ends so the first and last frames are clean.
import React from 'react';
import {AbsoluteFill, Easing, useVideoConfig} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import type {LibraryEntry} from '../../core/types';
import {TransitionDemo, demoFrames, mix, rgba, seg} from './_dom-utils';

export type FlareSweepProps = {
	/** flare tint, hex */
	color?: string;
	/** height of the streak as a fraction of the frame (0 = top) */
	y?: number;
	/** 'right' = the flare travels left to right */
	direction?: 'right' | 'left';
	/** share of the transition held at full whiteout */
	hold?: number;
};

const inCubic = Easing.in(Easing.cubic);
const outCubic = Easing.out(Easing.cubic);

const hexagon = (cx: number, cy: number, r: number) =>
	Array.from({length: 6}, (_, i) => {
		const a = (Math.PI / 3) * i + Math.PI / 6;
		return `${cx + Math.cos(a) * r}px ${cy + Math.sin(a) * r}px`;
	}).join(', ');

const FlareLayer: React.FC<{phase: 'in' | 'out'; progress: number} & Required<Pick<FlareSweepProps, 'color' | 'y' | 'direction'>>> = ({
	phase,
	progress,
	color,
	y,
	direction,
}) => {
	const {width: W, height: H} = useVideoConfig();
	// k: how far the bloom has grown (0 = pinpoint, 1 = whiteout)
	const k = phase === 'in' ? inCubic(progress) : 1 - outCubic(progress);
	const travel = phase === 'in' ? mix(-0.15 * W, 0.5 * W, outCubic(progress)) : mix(0.5 * W, 1.15 * W, inCubic(progress));
	const fx = direction === 'right' ? travel : W - travel;
	const fy = y * H;
	const diag = Math.hypot(W, H);
	const r = mix(H * 0.08, diag * 2.2, Math.pow(k, 2.2));
	// the streak fades in over the first frames and out over the last ones, so the transition starts and ends clean
	const gate = phase === 'in' ? seg(progress, 0, 0.3) : 1 - seg(progress, 0.6, 1);
	const ghosts = [0.6, 1.25].map((m) => [W / 2 + (W / 2 - fx) * m, H / 2 + (H / 2 - fy) * m] as const);
	const hex = [W / 2 + (W / 2 - fx) * 0.25, H / 2 + (H / 2 - fy) * 0.25] as const;
	return (
		<AbsoluteFill style={{mixBlendMode: 'screen'}}>
			{/* bloom: white core, tinted shoulder */}
			<AbsoluteFill
				style={{
					background: `radial-gradient(circle at ${fx}px ${fy}px, #fff 0px, #fff ${r * 0.45}px, ${rgba(color, 0.9)} ${r * 0.7}px, transparent ${r}px)`,
					opacity: Math.min(1, 0.35 + k) * Math.max(gate, k),
				}}
			/>
			{/* the anamorphic streak and the hairline through it */}
			<AbsoluteFill
				style={{
					background: `radial-gradient(ellipse ${W * 0.75}px ${H * 0.022 + k * H * 0.05}px at ${fx}px ${fy}px, #fff 0%, ${rgba(color, 0.95)} 30%, transparent 100%)`,
					opacity: gate,
				}}
			/>
			<AbsoluteFill
				style={{
					background: `radial-gradient(ellipse ${W * 1.4}px ${H * 0.006}px at ${fx}px ${fy}px, #fff 0%, ${rgba(color, 0.8)} 40%, transparent 100%)`,
					opacity: gate,
				}}
			/>
			{/* hot core */}
			<AbsoluteFill
				style={{
					background: `radial-gradient(circle at ${fx}px ${fy}px, #fff 0px, #fff ${H * 0.012}px, ${rgba(color, 0.55)} ${H * 0.05 * (1 + k)}px, transparent ${H * 0.11 * (1 + k)}px)`,
					opacity: gate,
				}}
			/>
			{/* lens ghosts, mirrored through the centre of the frame */}
			{ghosts.map(([gx, gy], i) => (
				<div
					key={i}
					style={{
						position: 'absolute',
						left: gx - H * 0.05 * (i + 1),
						top: gy - H * 0.05 * (i + 1),
						width: H * 0.1 * (i + 1),
						height: H * 0.1 * (i + 1),
						borderRadius: '50%',
						background: rgba(color, 0.18),
						border: `2px solid ${rgba(color, 0.3)}`,
						opacity: (1 - k) * gate,
					}}
				/>
			))}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background: rgba(color, 0.22),
					clipPath: `polygon(${hexagon(hex[0], hex[1], H * 0.045)})`,
					opacity: (1 - k) * gate,
				}}
			/>
		</AbsoluteFill>
	);
};

/** The scene on its own compositor layer: its text is then rasterised the same way in every render (grayscale AA), which keeps repeated renders pixel-identical. */
const Raster: React.FC<{children?: React.ReactNode}> = ({children}) => <AbsoluteFill style={{willChange: 'transform'}}>{children}</AbsoluteFill>;

const FlareSweepPresentation: React.FC<TransitionPresentationComponentProps<FlareSweepProps>> = ({
	children,
	presentationDirection,
	presentationProgress: p,
	passedProps,
}) => {
	const {color = '#7fc8ff', y = 0.5, direction = 'right', hold = 0} = passedProps;
	const inEnd = 0.5 - hold / 2;
	const outStart = 0.5 + hold / 2;
	const common = {color, y, direction} as const;
	if (presentationDirection === 'exiting') {
		return (
			<AbsoluteFill>
				<Raster>{children}</Raster>
				<FlareLayer phase="in" progress={Math.min(1, p / inEnd)} {...common} />
			</AbsoluteFill>
		);
	}
	if (p < inEnd) {
		return null;
	}
	return (
		<AbsoluteFill>
			<Raster>{children}</Raster>
			<FlareLayer phase="out" progress={Math.min(1, Math.max(0, (p - outStart) / (0.95 - outStart)))} {...common} />
		</AbsoluteFill>
	);
};

/** An anamorphic flare sweeps in, blooms to a whiteout at the midpoint where the scenes swap, then streaks away. Screen-blended, so it only brightens. Use with linearTiming, 24-40 frames. */
export const flareSweep = (props: FlareSweepProps = {}): TransitionPresentation<FlareSweepProps> => ({
	component: FlareSweepPresentation,
	props,
});

const T = 30;

const Demo: React.FC = () => <TransitionDemo presentation={flareSweep()} transition={T} lead={8} />;

export const flareSweepEntry: LibraryEntry = {
	meta: {
		id: 'flare-sweep',
		title: 'Flare sweep',
		category: 'transitions',
		looks: 'A thin blue anamorphic streak with a glowing core races in from the left, blooms to a full white-out at the midpoint where the shot changes, then streaks away to the right.',
		use: 'Sci-fi and night-city trailers, tech reveals, any cut that should feel like a camera passing a light.',
		exportName: 'flareSweep',
		durationInFrames: demoFrames(T, 1, 8),
		source: {kind: 'ported', name: 'GTKottman/remotion-transitions (flare-sweep)', url: 'https://github.com/GTKottman/remotion-transitions/blob/main/transitions/09-light/flare/flare-sweep/index.tsx', license: 'MIT'},
	},
	Demo,
};
