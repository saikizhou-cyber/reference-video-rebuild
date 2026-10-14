import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useVideoConfig} from 'remotion';
import {
	TransitionSeries,
	linearTiming,
	type TransitionPresentation,
	type TransitionPresentationComponentProps,
} from '@remotion/transitions';
import {CURVES} from '../../core/easing';
import {DEMO, SceneA, SceneB} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

export type BarWipeProps = {
	/** number of horizontal bars */
	bars?: number;
	/** slant of each bar's leading edge, px at 720p (positive leans right) */
	slant?: number;
	/** share of the transition over which the bars' starts are spread (0 = all together) */
	stagger?: number;
	/** colour band that runs just ahead of the reveal (null = none) */
	accent?: string | null;
	/** width of the accent band as a share of the frame width */
	accentWidth?: number;
	/** 'right' = bars travel left to right */
	direction?: 'right' | 'left';
};

const barsPath = (w: number, h: number, n: number, slant: number, stagger: number, p: number, lead: number, dir: 'right' | 'left') => {
	const parts: string[] = [];
	const bh = h / n;
	for (let i = 0; i < n; i++) {
		// alternate bars start first from the middle out, which reads as a designed wipe rather than a blind
		const order = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 || 1);
		const t0 = order * stagger;
		const local = Math.min(1, Math.max(0, (p - t0) / (1 - stagger)));
		const e = CURVES.inOutCubic(local);
		const x = -Math.abs(slant) + e * (w + 2 * Math.abs(slant)) + lead * w;
		const y0 = i * bh - 0.5;
		const y1 = (i + 1) * bh + 0.5;
		// leading edge slanted: top point ahead by `slant`
		const xt = x + slant / 2;
		const xb = x - slant / 2;
		if (dir === 'right') {
			parts.push(`M-1 ${y0} L${xt} ${y0} L${xb} ${y1} L-1 ${y1} Z`);
		} else {
			parts.push(`M${w + 1} ${y0} L${w - xt} ${y0} L${w - xb} ${y1} L${w + 1} ${y1} Z`);
		}
	}
	return parts.join(' ');
};

const BarWipePresentation: React.FC<TransitionPresentationComponentProps<BarWipeProps>> = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}) => {
	const {width, height} = useVideoConfig();
	const u = Math.min(width, height) / 720;
	const {bars = 5, slant = 140, stagger = 0.35, accent = DEMO.yellow, accentWidth = 0.08, direction = 'right'} = passedProps;
	const reveal = useMemo(
		() => barsPath(width, height, bars, slant * u, stagger, presentationProgress, 0, direction),
		[width, height, bars, slant, u, stagger, presentationProgress, direction],
	);
	const band = useMemo(
		() => barsPath(width, height, bars, slant * u, stagger, presentationProgress, accentWidth, direction),
		[width, height, bars, slant, u, stagger, presentationProgress, accentWidth, direction],
	);
	if (presentationDirection === 'exiting') {
		return <AbsoluteFill>{children}</AbsoluteFill>;
	}
	// the band fades out at the very end so the last frame is the clean new scene
	const bandOpacity = interpolate(presentationProgress, [0.85, 1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	return (
		<AbsoluteFill>
			{accent ? <AbsoluteFill style={{background: accent, clipPath: `path('${band}')`, opacity: bandOpacity}} /> : null}
			<AbsoluteFill style={{clipPath: `path('${reveal}')`}}>{children}</AbsoluteFill>
		</AbsoluteFill>
	);
};

/** Staggered slanted bars sweep across and reveal the next scene, led by an accent colour band. */
export const barWipe = (props: BarWipeProps = {}): TransitionPresentation<BarWipeProps> => ({
	component: BarWipePresentation,
	props,
});

const Demo: React.FC = () => (
	<TransitionSeries>
		<TransitionSeries.Sequence durationInFrames={30}>
			<SceneA />
		</TransitionSeries.Sequence>
		<TransitionSeries.Transition presentation={barWipe()} timing={linearTiming({durationInFrames: 18})} />
		<TransitionSeries.Sequence durationInFrames={45}>
			<SceneB />
		</TransitionSeries.Sequence>
	</TransitionSeries>
);

export const barWipeEntry: LibraryEntry = {
	meta: {
		id: 'bar-wipe',
		title: 'Bar wipe',
		category: 'transitions',
		looks: 'Five slanted bars sweep across from the middle out, each led by a yellow band, revealing the next scene in ~18 frames.',
		use: 'Section changes in a hype PV; between character cards.',
		exportName: 'barWipe',
		durationInFrames: 57,
		source: {kind: 'original'},
	},
	Demo,
};
