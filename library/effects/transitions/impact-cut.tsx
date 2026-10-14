// Ported from GTKottman/remotion-transitions (https://github.com/GTKottman/remotion-transitions), MIT, Copyright (c) 2026 GTKottman and contributors.
// Changes: shake kept (per-frame seeded offsets, squared decay, edge-hiding scale); added the flash frames, the punch-in snap on the incoming scene,
// the small roll and the wind-up push on the outgoing scene; flash timing (on at the cut, swap hidden under it, off 2 frames later) follows the
// "flash-cut" primitive of heygen-com/hyperframes (Apache-2.0) as a timing description only, no code taken from it.
import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {CURVES} from '../../core/easing';
import {DEMO} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {TransitionDemo, demoFrames, rand, seg} from './_dom-utils';

export type ImpactCutProps = {
	/** colour of the flash frames */
	flash?: string;
	/** full-frame flash frames on the cut (the swap happens under them) */
	flashFrames?: number;
	/** scale the incoming scene lands at before it snaps to 1 (1.12 = 12 % punch-in) */
	punch?: number;
	/** frames the punch takes to snap back */
	settle?: number;
	/** peak shake in px at 720p, decays to 0 by the end of the transition */
	shake?: number;
	/** where in the transition the cut happens (0..1) */
	cutAt?: number;
	/** scale the outgoing scene pushes in to just before the cut (1 = none) */
	windUp?: number;
	seed?: number;
};

const ImpactCutPresentation: React.FC<TransitionPresentationComponentProps<ImpactCutProps>> = ({
	children,
	presentationDirection,
	presentationProgress,
	presentationDurationInFrames,
	passedProps,
}) => {
	const {width, height} = useVideoConfig();
	const u = Math.min(width, height) / 720;
	const {flash = '#ffffff', flashFrames = 2, punch = 1.12, settle = 6, shake = 26, cutAt = 0.3, windUp = 1.05, seed = 1} = passedProps;
	const total = presentationDurationInFrames;
	const f = Math.round(presentationProgress * total);
	const cut = Math.min(Math.max(1, Math.round(cutAt * total)), total - 2);
	const land = cut + Math.max(0, flashFrames);

	if (presentationDirection === 'exiting') {
		if (f >= cut) {
			return null;
		}
		// a short squeeze toward the camera right before the hit
		const s = 1 + (windUp - 1) * CURVES.expoIn(seg(f, 0, cut));
		return <AbsoluteFill style={{transform: `scale(${s})`}}>{children}</AbsoluteFill>;
	}

	if (f < cut) {
		return null;
	}
	const since = f - land;
	const punchScale = punch + (1 - punch) * CURVES.snap(seg(since, 0, settle));
	// decaying hit shake: squared falloff from the landing frame to the end of the transition
	const decay = (1 - seg(f, land, total)) ** 2;
	const amp = shake * u * decay;
	const dx = (rand(seed, 'x', f) * 2 - 1) * amp;
	const dy = (rand(seed, 'y', f) * 2 - 1) * amp;
	const roll = (rand(seed, 'r', f) * 2 - 1) * 0.6 * decay;
	// scale up just enough that the shake never shows the frame edge
	const cover = 1 + (2.2 * amp) / Math.min(width, height);
	// 1 frame of afterglow once the flash frames are over
	const flashOpacity = since < 0 ? 1 : since === 0 ? 0.35 : 0;
	return (
		<AbsoluteFill>
			<AbsoluteFill style={{transform: `translate(${dx}px, ${dy}px) rotate(${roll}deg) scale(${punchScale * cover})`}}>{children}</AbsoluteFill>
			{flashOpacity > 0 ? <AbsoluteFill style={{background: flash, opacity: flashOpacity}} /> : null}
		</AbsoluteFill>
	);
};

/**
 * Hard cut that hits: A squeezes in, 2 flash frames hide the swap, B lands punched in (1.12 -> 1 snap) with a decaying shake.
 * Use with linearTiming (the effect is laid out in frames of the transition; ~16 frames suits a beat drop).
 */
export const impactCut = (props: ImpactCutProps = {}): TransitionPresentation<ImpactCutProps> => ({
	component: ImpactCutPresentation,
	props,
});

const T = 16;

const Demo: React.FC = () => (
	<TransitionDemo
		presentation={[impactCut(), impactCut({flash: DEMO.yellow, punch: 1.2, shake: 40, flashFrames: 3, seed: 4}), impactCut({punch: 1.08, shake: 14, seed: 7})]}
		transition={T}
		repeats={3}
		lead={5}
		hold={2}
	/>
);

export const impactCutEntry: LibraryEntry = {
	meta: {
		id: 'impact-cut',
		title: 'Impact cut',
		category: 'transitions',
		looks: 'Hard cut on the beat: the outgoing shot squeezes in, two flash frames hide the swap, the new shot lands punched in at 1.12x and shakes itself still.',
		use: 'Beat drops, smash cuts into the title, any cut that has to be felt.',
		notes: 'The swap (and the flash) happens at cutAt x duration, default 0.3, but transitionPlan() plans the cut at the middle of the overlap: with the default the flash starts 2 frames early on a 10-frame overlap (measured). Pass cutAt = floor(d / 2) / d (0.5 for an even d) to start it on the beat frame.',
		exportName: 'impactCut',
		durationInFrames: demoFrames(T, 3, 5, 2),
		source: {kind: 'ported', name: 'GTKottman/remotion-transitions (smash-cut-shake)', url: 'https://github.com/GTKottman/remotion-transitions/blob/main/transitions/01-cut/smash-cut/smash-cut-shake/index.tsx', license: 'MIT'},
	},
	Demo,
};
