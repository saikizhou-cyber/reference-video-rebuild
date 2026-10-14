// Ported from GTKottman/remotion-transitions (https://github.com/GTKottman/remotion-transitions), MIT, Copyright (c) 2026 GTKottman and contributors.
// Changes: swap points are snapped to whole frames (at least one frame apart), optional black frames after each flip, tunable acceleration; both scenes stay mounted.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import type {LibraryEntry} from '../../core/types';
import {TransitionDemo, demoFrames} from './_dom-utils';

export type StrobeCutProps = {
	/** how many times the picture swaps; an even number is bumped up by one so it always lands on B */
	flips?: number;
	/** black frames inserted at each flip (only where the gap to the next flip is longer than that) */
	blackFrames?: number;
	/** spacing exponent of the flips: 0.5 = sqrt spacing (accelerating), 1 = even */
	accel?: number;
};

/** Whole-frame swap points of the flips inside a transition of `total` frames (strictly increasing, the last one at most total - 1). */
const swapFrames = (total: number, flips: number, accel: number): number[] => {
	const n = flips % 2 ? flips : flips + 1;
	const s: number[] = [];
	for (let i = 1; i <= n; i++) {
		const raw = Math.round(Math.pow(i / (n + 1), accel) * (total - 1));
		s.push(Math.max(raw, (s[i - 2] ?? 0) + 1));
	}
	for (let i = n - 1; i >= 0; i--) {
		s[i] = Math.min(s[i], (s[i + 1] ?? total) - 1);
	}
	return s;
};

type Phase = 'A' | 'B' | 'black';

const phaseAt = (f: number, swaps: number[], blackFrames: number): Phase => {
	let k = 0;
	for (let i = 0; i < swaps.length; i++) {
		if (f >= swaps[i]) {
			k = i + 1;
		}
	}
	if (k > 0 && blackFrames > 0) {
		const gap = (swaps[k] ?? Infinity) - swaps[k - 1];
		// no black frame on the last flip: the transition must land clean on B
		if (k < swaps.length && gap > blackFrames && f - swaps[k - 1] < blackFrames) {
			return 'black';
		}
	}
	return k % 2 === 1 ? 'B' : 'A';
};

const StrobeCutPresentation: React.FC<TransitionPresentationComponentProps<StrobeCutProps>> = ({
	children,
	presentationDirection,
	presentationProgress,
	presentationDurationInFrames,
	passedProps,
}) => {
	const {flips = 6, blackFrames = 0, accel = 0.5} = passedProps;
	const f = Math.round(presentationProgress * presentationDurationInFrames);
	const phase = phaseAt(f, swapFrames(presentationDurationInFrames, flips, accel), blackFrames);
	if (presentationDirection === 'exiting') {
		return <AbsoluteFill style={{opacity: phase === 'A' ? 1 : 0}}>{children}</AbsoluteFill>;
	}
	return (
		<AbsoluteFill>
			<AbsoluteFill style={{opacity: phase === 'B' ? 1 : 0}}>{children}</AbsoluteFill>
			{phase === 'black' ? <AbsoluteFill style={{background: '#000'}} /> : null}
		</AbsoluteFill>
	);
};

/** A and B alternate with accelerating hard flips (sqrt-spaced), optional black frames, landing on B. Use with linearTiming. */
export const strobeCut = (props: StrobeCutProps = {}): TransitionPresentation<StrobeCutProps> => ({
	component: StrobeCutPresentation,
	props,
});

const T = 20;

const Demo: React.FC = () => (
	<TransitionDemo presentation={[strobeCut(), strobeCut({flips: 9, blackFrames: 1})]} transition={T} repeats={2} lead={3} hold={4} />
);

export const strobeCutEntry: LibraryEntry = {
	meta: {
		id: 'strobe-cut',
		title: 'Strobe cut',
		category: 'transitions',
		looks: 'The two shots flip back and forth, slowly at first then every frame, optionally with black frames between, and settle on the new shot.',
		use: 'Hype-section builds, glitchy beat-synced entries, a nervous cut before a reveal.',
		exportName: 'strobeCut',
		durationInFrames: demoFrames(T, 2, 3, 4),
		source: {kind: 'ported', name: 'GTKottman/remotion-transitions (strobe-cut)', url: 'https://github.com/GTKottman/remotion-transitions/blob/main/transitions/01-cut/smash-cut/strobe-cut/index.tsx', license: 'MIT'},
	},
	Demo,
};
