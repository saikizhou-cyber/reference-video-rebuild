// Ported from GTKottman/remotion-transitions (https://github.com/GTKottman/remotion-transitions), MIT, Copyright (c) 2026 GTKottman and contributors.
// Changes: dot lattice, wave projection and clip-path union kept; added an edge ring under the dots, eased dot growth with a settle at the end, size / spread props.
import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, useVideoConfig} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {DEMO} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {TransitionDemo, circlePath, demoFrames, seg} from './_dom-utils';

export type HalftoneWipeProps = {
	/** dots across the frame */
	columns?: number;
	/** direction the wave travels in degrees (0 = left to right, 90 = top to bottom) */
	angle?: number;
	/** colour of the ring around each dot (null = none) */
	edge?: string | null;
	/** width of that ring, px at 720p */
	edgeWidth?: number;
	/** share of the transition over which the dots' starts are spread along the wave */
	spread?: number;
};

/** dots swell fast then settle, so the first frames already show the screen coming in */
const GROW = Easing.bezier(0.3, 0.2, 0.3, 1);

const HalftoneWipePresentation: React.FC<TransitionPresentationComponentProps<HalftoneWipeProps>> = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}) => {
	const {width: W, height: H} = useVideoConfig();
	const u = Math.min(W, H) / 720;
	const {columns = 28, angle = 30, edge = DEMO.ink, edgeWidth = 3, spread = 0.6} = passedProps;
	// the wave is complete a few frames before the end so the last frames are clean
	const p = Math.min(1, presentationProgress / 0.92);

	const lattice = useMemo(() => {
		const cell = W / columns;
		const rows = Math.ceil(H / (cell * 0.88)) + 2;
		const a = (angle * Math.PI) / 180;
		const dx = Math.cos(a);
		const dy = Math.sin(a);
		const proj = (x: number, y: number) => x * dx + y * dy;
		const corners = [proj(0, 0), proj(W, 0), proj(0, H), proj(W, H)];
		const lo = Math.min(...corners);
		const hi = Math.max(...corners);
		const dots: {x: number; y: number; t: number}[] = [];
		for (let j = 0; j < rows; j++) {
			for (let i = 0; i <= columns; i++) {
				const x = (i + (j % 2) * 0.5) * cell;
				const y = j * cell * 0.88;
				dots.push({x, y, t: (proj(x, y) - lo) / (hi - lo)});
			}
		}
		return {cell, dots};
	}, [W, H, columns, angle]);

	if (presentationDirection === 'exiting') {
		return <AbsoluteFill>{children}</AbsoluteFill>;
	}
	const rMax = lattice.cell * 0.75;
	let d = '';
	let dEdge = '';
	for (const dot of lattice.dots) {
		const g = GROW(seg(p, dot.t * spread, dot.t * spread + 1 - spread));
		const r = rMax * g;
		if (r > 0.3) {
			d += circlePath(dot.x, dot.y, r);
			dEdge += circlePath(dot.x, dot.y, r + edgeWidth * u);
		}
	}
	return (
		<AbsoluteFill>
			{edge && dEdge ? <AbsoluteFill style={{background: edge, clipPath: `path('${dEdge}')`}} /> : null}
			<AbsoluteFill style={{clipPath: `path('${d || 'M0 0Z'}')`}}>{children}</AbsoluteFill>
		</AbsoluteFill>
	);
};

/** A wave of dots grows across the frame, the new scene inside them, until they merge into a solid picture. Use with linearTiming, 28-48 frames. */
export const halftoneWipe = (props: HalftoneWipeProps = {}): TransitionPresentation<HalftoneWipeProps> => ({
	component: HalftoneWipePresentation,
	props,
});

const T = 36;

const Demo: React.FC = () => (
	<TransitionDemo presentation={halftoneWipe()} transition={T} lead={5} />
);

export const halftoneWipeEntry: LibraryEntry = {
	meta: {
		id: 'halftone-wipe',
		title: 'Halftone wipe',
		category: 'transitions',
		looks: 'A wave of ink-edged dots swells across the frame at 30 degrees, the new scene inside each dot, until the dots touch and merge into the full picture.',
		use: 'Comic / print-styled PVs, flashback-to-present cuts, anything that should feel like a halftone screen.',
		exportName: 'halftoneWipe',
		durationInFrames: demoFrames(T, 1, 5),
		source: {kind: 'ported', name: 'GTKottman/remotion-transitions (halftone-wipe)', url: 'https://github.com/GTKottman/remotion-transitions/blob/main/transitions/03-wipe/pattern/halftone-wipe/index.tsx', license: 'MIT'},
	},
	Demo,
};
