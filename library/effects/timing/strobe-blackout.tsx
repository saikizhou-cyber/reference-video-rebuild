// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/rhythm-interrupt-moves/StrobeBlackFrames.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: children instead of a fixed dashboard, flash table / push / landing crop / hammer pulse as props, strobeSchedule() generator, crop-style framing, 720p-unit scaling. Modified.
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {DemoWall, Framed, WALL_FOCUS} from './_edits-utils';

export type StrobeBlackoutProps = {
	children?: React.ReactNode;
	/** frames at which a black flash starts. Default: 9 flashes whose gaps shrink from 8 to 3 frames */
	flashes?: number[];
	/** how many frames each black flash lasts */
	flashFrames?: number;
	color?: string;
	/** slow ease-in push over the whole build-up, 1 -> push */
	push?: number;
	/** frame of the reveal after the last flash. Default: right when the last flash ends */
	landing?: number;
	/** zoom of the zero-tween hard cut at the landing */
	punch?: number;
	/** where the push and the landing crop aim, as shares of the frame (0..1) */
	focus?: {x: number; y: number};
	/** brightness of the hammer pulse on the first frames after the landing (1 = none) */
	hammer?: number;
	hammerFrames?: number;
};

/**
 * Builds a flash table: `count` flashes from frame `start`, the gap between them starting at `firstGap` frames and
 * shrinking by `tighten` frames each time until it bottoms out at `lastGap`.
 * strobeSchedule(40, 9, 8, 3) -> 40, 48, 55, 61, 66, 70, 73, 76, 79 (gaps 8, 7, 6, 5, 4, 3, 3, 3).
 */
export const strobeSchedule = (start: number, count: number, firstGap = 8, lastGap = 3, tighten = 1): number[] => {
	const out = [Math.round(start)];
	for (let i = 0; i < count - 1; i++) {
		const gap = Math.max(lastGap, firstGap - i * tighten);
		out.push(out[out.length - 1] + Math.max(1, Math.round(gap)));
	}
	return out;
};

/** The default flash table: black frames at tightening intervals (8, 7, 6, 5, 4, 3, 3, 3 frames apart). */
export const STROBE_FLASHES: readonly number[] = strobeSchedule(40, 9, 8, 3);

/**
 * Tension before the drop: the picture creeps in while black frames flash at tightening intervals,
 * then the last flash lifts onto a hard cut (no tween) to a tight crop and a 2-frame darkening hammer.
 * Photosensitivity: this is a strobe, keep it short and under the music's rise, and tell viewers.
 */
export const StrobeBlackout: React.FC<StrobeBlackoutProps> = ({
	children,
	flashes = [...STROBE_FLASHES],
	flashFrames = 2,
	color = '#0c0c0c',
	push = 1.05,
	landing,
	punch = 1.35,
	focus = {x: 0.5, y: 0.5},
	hammer = 0.88,
	hammerFrames = 2,
}) => {
	const frame = useCurrentFrame();
	const land = landing ?? Math.max(...flashes) + flashFrames;
	const black = flashes.some((f0) => frame >= f0 && frame < f0 + flashFrames);
	const landed = frame >= land;
	const scale = landed
		? punch
		: interpolate(frame, [0, Math.max(1, land - 1)], [1, push], {
				easing: Easing.in(Easing.quad),
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});
	const dim = landed && frame < land + hammerFrames ? hammer : 1;
	return (
		<AbsoluteFill style={{background: color, overflow: 'hidden', filter: dim < 1 ? `brightness(${dim})` : undefined}}>
			<Framed framing={{scale, x: focus.x, y: focus.y}}>{children}</Framed>
			{black ? <AbsoluteFill style={{background: color}} /> : null}
		</AbsoluteFill>
	);
};

// the default table, starting 18 frames earlier so the gallery demo is short (and so no more than one of the six preview stills lands on a black frame)
const DEMO_FLASHES = strobeSchedule(22, 9, 8, 3);
const DEMO_CHARGE = Math.max(...DEMO_FLASHES) + 1;

/** Demo material: the roster wall with a red charge bar under the header that fills up to the drop, so the build-up reads even between flashes. */
const ChargedWall: React.FC = () => {
	const frame = useCurrentFrame();
	const {width} = useVideoConfig();
	const u = useUnit();
	const fill = Math.min(1, frame / DEMO_CHARGE);
	return (
		<AbsoluteFill>
			<DemoWall />
			<div style={{position: 'absolute', left: 48 * u, top: 82 * u, width: width - 96 * u, height: 10 * u, background: DEMO.grey}}>
				<div style={{width: `${fill * 100}%`, height: '100%', background: DEMO.red}} />
			</div>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<StrobeBlackout flashes={DEMO_FLASHES} push={1.15} punch={1.5} focus={WALL_FOCUS.card}>
		<ChargedWall />
	</StrobeBlackout>
);

export const strobeBlackoutEntry: LibraryEntry = {
	meta: {
		id: 'strobe-blackout',
		title: 'Strobe blackout',
		category: 'timing',
		looks: 'The picture creeps in while 2-frame black flashes come faster (8 frames apart, then 3), then a hard cut to a tight crop with a dark hammer pulse.',
		use: 'Tension build right before the drop or the reveal; pair it with a rising riser and keep it short (photosensitivity).',
		exportName: 'StrobeBlackout',
		durationInFrames: 78,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (Strobe Black Frames)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/rhythm-interrupt-moves/StrobeBlackFrames.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
