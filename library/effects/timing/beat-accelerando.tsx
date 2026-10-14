// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/beat-cut-moves/BeatCutAccelerando.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: generalised from a fixed dashboard and a hard-coded cut table to caller-supplied shots, intervals or beat frames, per-cut framings, 720p-unit scaling and an optional slam (shake + flash) on the final cut. Modified.
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {SceneA, SceneB} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {Framed, shakeOffset, type Framing} from './_edits-utils';

export type BeatAccelerandoProps = {
	/** the material. Cut i shows shots[i % shots.length], so one shot with several framings works too */
	shots: React.ReactNode[];
	/** frames each cut stays up, shrinking towards the end. The final slam starts when they run out */
	intervals?: number[];
	/** alternative to `intervals`: the frames (from the start) at which the cuts land, the last one being the slam */
	beats?: number[];
	/** crop of each cut (cycled). Default: wide, 1.8x, 2.6x, wide, 1.9x, 2.8x */
	framings?: Framing[];
	/** which shot the slam returns to (index into `shots`), shown wide */
	master?: number;
	/** zoom the slam shot settles at after its slow push-in */
	push?: number;
	/** frames the push-in takes */
	pushFrames?: number;
	/** strength of the slam on the last cut: shake, flash (0 = off) */
	slam?: number;
	/** peak shake of the slam, px at 720p */
	slamShake?: number;
	/** opacity of the white veil that marks every cut for one frame (0 = none) */
	cutKick?: number;
	seed?: number;
};

const DEFAULT_FRAMINGS: Framing[] = [
	{scale: 1},
	{scale: 1.8, x: 0.84, y: 0.3},
	{scale: 2.6, x: 0.25, y: 0.45},
	{scale: 1},
	{scale: 1.9, x: 0.78, y: 0.45},
	{scale: 2.8, x: 0.2, y: 0.22},
];

/** frames at which cut 0, 1, 2 ... land (0 first), the last entry being the final slam */
export const accelerandoCuts = (intervals: readonly number[], beats?: readonly number[]): number[] => {
	if (beats && beats.length > 0) {
		return [0, ...[...beats].sort((a, b) => a - b)];
	}
	const cuts = [0];
	for (const gap of intervals) {
		cuts.push(cuts[cuts.length - 1] + Math.max(1, Math.round(gap)));
	}
	return cuts;
};

/**
 * Hard cuts that accelerate: the establishing shot, then framings changing every 16, 12, 8, 6, 4 frames,
 * until the last cut slams back to the master shot with a shake and a slow push-in. No transitions at all.
 */
export const BeatAccelerando: React.FC<BeatAccelerandoProps> = ({
	shots,
	intervals = [49, 16, 12, 8, 6, 4],
	beats,
	framings = DEFAULT_FRAMINGS,
	master = 0,
	push = 1.06,
	pushFrames = 20,
	slam = 1,
	slamShake = 10,
	cutKick = 0.06,
	seed = 1,
}) => {
	const frame = useCurrentFrame();
	const cuts = accelerandoCuts(intervals, beats);
	const finalAt = cuts[cuts.length - 1];
	const isFinal = frame >= finalAt;
	let seg = 0;
	for (let i = 0; i < cuts.length - 1; i++) {
		if (frame >= cuts[i]) {
			seg = i;
		}
	}
	const since = frame - finalAt;
	const onCut = cuts.some((c, i) => i > 0 && frame === c);

	let content: React.ReactNode;
	if (isFinal) {
		const z = 1 + (push - 1) * progress(frame, finalAt, pushFrames, CURVES.quintOut);
		const amp = slam > 0 && since < 14 ? slam * slamShake * Math.exp(-since / 2.5) : 0;
		const sh = shakeOffset(frame, amp, seed);
		content = (
			<Framed key="final" framing={{scale: 1}} extra={z} dx={sh.x} dy={sh.y}>
				{shots[master % shots.length]}
			</Framed>
		);
	} else {
		content = (
			<Framed key={seg} framing={framings[seg % framings.length]}>
				{shots[seg % shots.length]}
			</Framed>
		);
	}
	// regular cuts get a one-frame veil; the slam's veil is stronger and lingers for 3 frames
	const slamVeil = isFinal && since < 3 ? 0.35 * slam * (1 - since / 3) : 0;
	const veilOpacity = Math.max(onCut ? cutKick : 0, slamVeil);
	return (
		<AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
			{content}
			{veilOpacity > 0 ? <AbsoluteFill style={{background: '#ffffff', opacity: veilOpacity}} /> : null}
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<BeatAccelerando
		shots={[<SceneA key="a1" />, <SceneA key="a2" />, <SceneA key="a3" />, <SceneB key="b1" />, <SceneB key="b2" />, <SceneB key="b3" />]}
		intervals={[18, 12, 9, 7, 5, 4]}
	/>
);

export const beatAccelerandoEntry: LibraryEntry = {
	meta: {
		id: 'beat-accelerando',
		title: 'Beat accelerando',
		category: 'timing',
		looks: 'Six framings hard-cut at shrinking intervals (49, 16, 12, 8, 6, 4 frames by default), the last cut slamming back to the master shot with a shake and a slow push-in.',
		use: 'Build-up into a title or a reveal; any section where the music speeds up and the edit has to keep pace.',
		exportName: 'BeatAccelerando',
		durationInFrames: 75,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (Beat-Cut Accelerando)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/beat-cut-moves/BeatCutAccelerando.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
