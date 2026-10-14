// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/speed-ramp-freeze/SpeedRampReal.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: the hand-written frame remap becomes a keyframed speed curve integrated into a source frame (any children, any number of ramps, freeze keys), blur is real sub-frame motion blur instead of a filter, auto flash on freeze, 720p-unit scaling. Modified.
import React from 'react';
import {AbsoluteFill, Easing, Freeze, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES} from '../../core/easing';
import {BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

/** [output frame, playback speed, optional easing of the interval that ENDS at this key]. Speed 1 = normal, 0 = freeze, 0.2 = slow-mo. */
export type SpeedKey = readonly [frame: number, speed: number, ease?: (t: number) => number];

export type SpeedRampProps = {
	children?: React.ReactNode;
	/** speed keyframes in output frames, speed blended between them (hold = equal values, jump = keys one frame apart) */
	speeds?: readonly SpeedKey[];
	/** source frame shown at output frame 0 */
	startFrame?: number;
	/** easing between keys that give none of their own */
	ease?: (t: number) => number;
	/** most sub-frame samples of the motion blur (1 = no blur). Blur only appears while the speed is high; needs opaque children */
	samples?: number;
	/** shutter: how many source frames of motion one frame of speed 1 smears (0.5 = 180 degree shutter) */
	shutter?: number;
	/** playback speed under which the picture stays perfectly crisp; the blur fades in smoothly from here and is full at twice this speed */
	blurAbove?: number;
	/** colour of the exposure flash on every hit into a freeze (null = none) */
	flash?: string | null;
	flashPeak?: number;
	flashFrames?: number;
	/** zoom kick (share) on the frame a freeze lands, decaying over 6 frames */
	punch?: number;
};

/** Ready-made speed curves. Pass one as `speeds`, or copy it and edit the numbers. */
export const SPEED_RAMPS = {
	/** fast, then a 0.2x slow window to gaze at the target, then fast again */
	gaze: [[0, 2.2], [30, 2.2], [40, 0.2, CURVES.inOutCubic], [64, 0.2], [74, 2.2, CURVES.inOutCubic]],
	/** speed climbs (cubic in) and the picture stops dead on the hit, flash included, and stays frozen */
	freezeHit: [[0, 1], [34, 1], [52, 4.5, Easing.in(Easing.cubic)], [53, 0]],
	/** flows, hard freeze for 27 frames, thaws back to normal */
	freezeThaw: [[0, 1], [30, 1], [31, 0], [58, 0], [64, 1, CURVES.expoOut]],
} satisfies Record<string, readonly SpeedKey[]>;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Playback speed at output frame `frame`. */
export const speedAt = (frame: number, speeds: readonly SpeedKey[], ease: (t: number) => number = CURVES.inOutCubic): number => {
	if (speeds.length === 0) {
		return 1;
	}
	if (frame <= speeds[0][0]) {
		return speeds[0][1];
	}
	for (let i = 1; i < speeds.length; i++) {
		const [f1, s1, e1] = speeds[i];
		if (frame < f1) {
			const [f0, s0] = speeds[i - 1];
			return lerp(s0, s1, (e1 ?? ease)((frame - f0) / Math.max(1e-6, f1 - f0)));
		}
	}
	return speeds[speeds.length - 1][1];
};

/** Source frame that is on screen at output frame `frame`: the integral of the speed curve (1/8-frame steps, deterministic). */
export const speedRampFrame = (
	frame: number,
	speeds: readonly SpeedKey[],
	options: {startFrame?: number; ease?: (t: number) => number} = {},
): number => {
	const {startFrame = 0, ease = CURVES.inOutCubic} = options;
	const steps = Math.max(0, Math.ceil(frame * 8));
	const h = frame / Math.max(1, steps);
	let src = startFrame;
	for (let k = 0; k < steps; k++) {
		src += speedAt((k + 0.5) * h, speeds, ease) * h;
	}
	return src;
};

/** Output frames at which the picture hits a freeze (speed drops to 0 from a moving key). */
export const freezeFrames = (speeds: readonly SpeedKey[]): number[] =>
	speeds.filter((k, i) => i > 0 && k[1] === 0 && speeds[i - 1][1] !== 0).map((k) => k[0]);

/**
 * Freeze at a source frame, even one past the composition's end: Remotion clamps the timeline to the composition
 * length, so when a fast ramp reads ahead of the output clock a negative-`from` Sequence moves the window back.
 */
const Remap: React.FC<{src: number; children?: React.ReactNode}> = ({src, children}) => {
	const {durationInFrames} = useVideoConfig();
	const over = Math.max(0, Math.ceil(src - (durationInFrames - 1)));
	return (
		<Sequence from={-over} layout="none">
			<Freeze frame={src}>{children}</Freeze>
		</Sequence>
	);
};

/**
 * Time remap for everything inside: the children's own clock (useCurrentFrame, springs, interpolate, nested
 * Sequences) runs at the keyed speed, so a fast section blurs past, a slow window lets the hero land and a freeze
 * stops the whole picture. Don't stack with <HitStop> on the same shot: both remap the clock.
 */
export const SpeedRamp: React.FC<SpeedRampProps> = ({
	children,
	speeds = SPEED_RAMPS.gaze,
	startFrame = 0,
	ease = CURVES.inOutCubic,
	samples = 12,
	shutter = 0.6,
	blurAbove = 0.7,
	flash = '#ffffff',
	flashPeak = 0.8,
	flashFrames = 3,
	punch = 0.025,
}) => {
	const frame = useCurrentFrame();
	const src = speedRampFrame(frame, speeds, {startFrame, ease});
	const v = speedAt(frame, speeds, ease);

	// motion blur: sub-frame copies spread over the shutter, stacked with opacity 1/(k+1) = an even average.
	// The blur fades in with the speed (smoothstep, none at all below blurAbove) so it never pops in as a double image,
	// and the copies are never more than 0.1 source frames apart, so a short smear is a soft edge and not a ghost.
	const fade = Math.min(1, Math.max(0, (Math.abs(v) - blurAbove) / Math.max(1e-6, blurAbove)));
	const span = Math.abs(v) * shutter * fade * fade * (3 - 2 * fade);
	const n = span < 0.02 || samples < 2 ? 1 : Math.min(Math.round(samples), Math.ceil(span / 0.1) + 1);
	const offsets = n === 1 ? [0] : Array.from({length: n}, (_, k) => (k / (n - 1) - 0.5) * span);

	let white = 0;
	let kick = 0;
	for (const f of freezeFrames(speeds)) {
		const since = frame - f;
		if (since >= 0 && since < flashFrames && flash) {
			white = Math.max(white, flashPeak * (1 - since / flashFrames));
		}
		if (since >= 0 && since < 6) {
			kick = Math.max(kick, (1 - since / 6) ** 2);
		}
	}
	return (
		<AbsoluteFill style={{overflow: 'hidden', transform: kick > 0 ? `scale(${1 + punch * kick})` : undefined}}>
			{offsets.map((o, k) => (
				<AbsoluteFill key={k} style={{opacity: k === 0 ? 1 : 1 / (k + 1)}}>
					<Remap src={Math.max(0, src + o)}>{children}</Remap>
				</AbsoluteFill>
			))}
			{white > 0 && flash ? <AbsoluteFill style={{background: flash, opacity: white}} /> : null}
		</AbsoluteFill>
	);
};

// ---- demo ----------------------------------------------------------------------------------------------------

const PITCH = 420;
const TILE_W = 340;
const TILE_H = 440;
const SRC_SPEED = 24; // px at 720p the rail travels per source frame
const TARGET = 5;
const DEMO_SPEEDS = SPEED_RAMPS.gaze;
const MID_SRC = speedRampFrame(52, DEMO_SPEEDS);

/** Demo footage: a rail of numbered tiles scrolling at a constant speed, one yellow target. */
const Rail: React.FC = () => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const x0 = 640 - TILE_W / 2 - TARGET * PITCH + MID_SRC * SRC_SPEED;
	const hues = [DEMO.blue, DEMO.red, DEMO.cyan];
	return (
		<AbsoluteFill style={{background: DEMO.ink, overflow: 'hidden'}}>
			<AbsoluteFill
				style={{opacity: 0.08, backgroundImage: `repeating-linear-gradient(-30deg, #ffffff 0 ${4 * u}px, transparent ${4 * u}px ${44 * u}px)`}}
			/>
			{Array.from({length: 16}, (_, k) => k - 2).map((i) => {
				const x = (x0 + i * PITCH - frame * SRC_SPEED) * u;
				const hero = i === TARGET;
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: x,
							top: (720 - TILE_H) * 0.5 * u,
							width: TILE_W * u,
							height: TILE_H * u,
							background: hero ? DEMO.yellow : DEMO.grey,
							overflow: 'hidden',
						}}
					>
						<div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 12 * u, background: hero ? DEMO.ink : hues[((i % 3) + 3) % 3]}} />
						<div
							style={{
								position: 'absolute',
								left: 0,
								right: 0,
								top: 96 * u,
								textAlign: 'center',
								fontFamily: DISPLAY_FONT,
								fontSize: 150 * u,
								lineHeight: 1,
								color: hero ? DEMO.ink : DEMO.paper,
							}}
						>
							{String((((i % 12) + 12) % 12) + 1).padStart(2, '0')}
						</div>
						<div
							style={{
								position: 'absolute',
								left: 26 * u,
								bottom: 26 * u,
								fontFamily: BODY_FONT,
								fontWeight: 800,
								fontSize: 20 * u,
								letterSpacing: 6 * u,
								color: hero ? DEMO.ink : DEMO.paper,
								opacity: hero ? 1 : 0.6,
							}}
						>
							{hero ? 'TARGET' : 'UNIT'}
						</div>
					</div>
				);
			})}
		</AbsoluteFill>
	);
};

/** Corner brackets and a speed read-out, drawn on the real clock above the remapped rail. */
const Hud: React.FC = () => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const v = speedAt(frame, DEMO_SPEEDS);
	const gaze = Math.min(1, Math.max(0, (1.6 - v) / 1.4));
	const w = 400 * u;
	const h = 500 * u;
	const arm = 46 * u;
	const edge = 6 * u;
	const corner = (style: React.CSSProperties) => <div style={{position: 'absolute', width: arm, height: arm, borderColor: DEMO.cyan, borderStyle: 'solid', borderWidth: 0, ...style}} />;
	return (
		<AbsoluteFill>
			<div style={{position: 'absolute', left: '50%', top: '50%', width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, opacity: gaze, transform: `scale(${1.12 - 0.12 * gaze})`}}>
				{corner({left: 0, top: 0, borderLeftWidth: edge, borderTopWidth: edge})}
				{corner({right: 0, top: 0, borderRightWidth: edge, borderTopWidth: edge})}
				{corner({left: 0, bottom: 0, borderLeftWidth: edge, borderBottomWidth: edge})}
				{corner({right: 0, bottom: 0, borderRightWidth: edge, borderBottomWidth: edge})}
			</div>
			<div
				style={{
					position: 'absolute',
					left: 48 * u,
					top: 36 * u,
					fontFamily: BODY_FONT,
					fontWeight: 800,
					fontSize: 24 * u,
					letterSpacing: 6 * u,
					color: DEMO.paper,
					background: DEMO.ink,
					padding: `${8 * u}px ${16 * u}px`,
				}}
			>
				SPEED {v.toFixed(1)}X
			</div>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<AbsoluteFill>
		<SpeedRamp speeds={DEMO_SPEEDS}>
			<Rail />
		</SpeedRamp>
		<Hud />
	</AbsoluteFill>
);

export const speedRampEntry: LibraryEntry = {
	meta: {
		id: 'speed-ramp',
		title: 'Speed ramp',
		category: 'timing',
		looks: 'The footage rushes past at 2.2x with motion blur, eases down to a crisp 0.2x window where the target crosses the centre, then speeds off again; freeze presets stop it dead on a hit.',
		use: 'Hero shots: gaze at the one card, move or face in a fast montage; ramp into a freeze-frame hit on the beat.',
		exportName: 'SpeedRamp',
		durationInFrames: 90,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (Speed Ramp + Freeze Annotate)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/speed-ramp-freeze/SpeedRampReal.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
