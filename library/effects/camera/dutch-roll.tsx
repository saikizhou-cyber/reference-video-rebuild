// Ported from video-shotcraft DutchRollToLevel (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/camera/tension-camera-moves/DutchRollToLevel.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: the hard-coded dashboard becomes a wrapper for any scene with the tilt, drift, timing and overshoot as props; the edge-hiding zoom is computed from the live angle instead of a fixed 1.15 -> 1.08; optional tilt-in; roll and settle keep the original shape (out-cubic past level, then in-out-quad home) with the overshoot given as a share of the tilt. Modified.
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {WorldScene, CameraRig, Tag, coverScale} from './_moves-utils';
import {CURVES} from '../../core/easing';
import {BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

export type DutchRollProps = {
	children: React.ReactNode;
	/** degrees the frame hangs at (negative = counter-clockwise) */
	angle?: number;
	/** frame (relative to the enclosing <Sequence>) the roll to level starts on */
	levelAt?: number;
	/** frames from the hanging angle to the overshoot */
	rollFrames?: number;
	/** frames from the overshoot to dead level */
	settleFrames?: number;
	/** overshoot past level as a share of the tilt (0.12 = -10 deg -> +1.2 deg -> 0) */
	overshoot?: number;
	/** degrees of slow sine drift while it hangs, so it never reads as a static tilted picture */
	drift?: number;
	/** frames per drift cycle */
	driftPeriod?: number;
	/** frames the tilt takes to come in from level at the start of the shot (0 = already tilted) */
	tiltIn?: number;
	/** scale just enough to hide the corners at the current angle (zooms out to 1.0 as it levels) */
	overscan?: boolean;
	style?: React.CSSProperties;
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * The frame hangs tilted with a slow drift, then rolls to level on a beat: out-cubic past level, then
 * a short settle. Wrap the "something is wrong" shot, level it on the answer.
 */
export const DutchRoll: React.FC<DutchRollProps> = ({
	children,
	angle = -10,
	levelAt = 40,
	rollFrames = 12,
	settleFrames = 10,
	overshoot = 0.12,
	drift = 0.8,
	driftPeriod = 180,
	tiltIn = 0,
	overscan = true,
	style,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();

	const hang = tiltIn > 0 ? angle * CURVES.expoOut(clamp01(frame / tiltIn)) : angle;
	const over = -overshoot * angle;
	let base = hang;
	if (frame >= levelAt) {
		const p1 = clamp01((frame - levelAt) / Math.max(1, rollFrames));
		const p2 = clamp01((frame - levelAt - rollFrames) / Math.max(1, settleFrames));
		base = frame < levelAt + rollFrames ? hang + (over - hang) * Easing.out(Easing.cubic)(p1) : over * (1 - Easing.inOut(Easing.quad)(p2));
	}
	// drift freezes into the roll and fades out over 6 frames after it starts
	const driftT = Math.min(frame, levelAt);
	const fade = 1 - clamp01((frame - levelAt) / 6);
	const rot = base + Math.sin((driftT * 2 * Math.PI) / driftPeriod) * drift * fade;
	const ty = Math.sin(driftT * 0.05) * 2 * u * fade;

	const scale = overscan ? coverScale(width, height, 0, Math.abs(ty), Math.abs(rot)) : 1;
	return (
		<CameraRig transform={`translateY(${ty}px) rotate(${rot}deg) scale(${scale})`} style={style}>
			{children}
		</CameraRig>
	);
};

const LEVEL_AT = 44;

/** Demo copy: a red warning strip that is swapped for a clean yellow card as the frame levels. */
const Strips: React.FC = () => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const warn = interpolate(frame, [LEVEL_AT, LEVEL_AT + 8], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const clean = interpolate(frame, [LEVEL_AT + 6, LEVEL_AT + 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: CURVES.snap});
	const strip = (bg: string, fg: string, text: string, sub: string, opacity: number, scaleX = 1): React.ReactNode => (
		<div
			style={{
				position: 'absolute',
				left: 0,
				right: 0,
				top: 92 * u,
				height: 96 * u,
				background: bg,
				opacity,
				transform: `scaleX(${scaleX})`,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 28 * u,
			}}
		>
			<span style={{fontFamily: DISPLAY_FONT, fontSize: 64 * u, color: fg, letterSpacing: 4 * u}}>{text}</span>
			<span style={{fontFamily: BODY_FONT, fontWeight: 800, fontSize: 20 * u, color: fg, letterSpacing: 6 * u}}>{sub}</span>
		</div>
	);
	return (
		<AbsoluteFill>
			{strip(DEMO.red, DEMO.paper, 'SIGNAL LOST', '// NO FIX', warn)}
			{strip(DEMO.yellow, DEMO.ink, 'LOCKED ON', '// 3 BEARING', clean, 0.7 + 0.3 * clean)}
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<>
		<DutchRoll levelAt={LEVEL_AT} angle={-10}>
			<WorldScene palette="ember">
				<Strips />
			</WorldScene>
		</DutchRoll>
		<Tag text="DUTCH ANGLE > LEVEL" />
	</>
);

export const dutchRollEntry: LibraryEntry = {
	meta: {
		id: 'dutch-roll',
		title: 'Dutch roll',
		category: 'camera',
		looks: 'The whole frame hangs at -10 degrees with a slow drift, then rolls past level and settles dead flat on the beat.',
		use: 'Unease that resolves: the problem shot, then the answer; a cut-in on a character coming back to their senses.',
		exportName: 'DutchRoll',
		durationInFrames: 90,
		source: {
			kind: 'ported',
			name: 'video-shotcraft DutchRollToLevel',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/camera/tension-camera-moves/DutchRollToLevel.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
