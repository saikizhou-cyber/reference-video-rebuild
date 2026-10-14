import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {WorldScene, CameraRig, clampPan, coverScale, Tag} from './_moves-utils';
import {useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

export type SlowPushProps = {
	children: React.ReactNode;
	/** zoom at the start and at the end; from > to is a pull-back. Keep both >= 1 so no edge shows */
	from?: number;
	to?: number;
	/** point of the frame (0..1 each) the camera glides toward */
	focus?: {x: number; y: number};
	/** 0..1: how much of the way the focus point travels to the frame centre at the tighter end of the move */
	follow?: number;
	/** frames the move lasts; default = the length of the enclosing <Sequence> */
	duration?: number;
	/** frames the move takes to build up to full speed (a start that is felt, not a jerk) */
	easeIn?: number;
	/** frames the move takes to brake at the end; 0 = it keeps creeping until the cut */
	easeOut?: number;
	/** px at 720p of the micro-drift that keeps held shots alive (x; y is half of it); 0 = off */
	drift?: number;
	/** y frequency / x frequency of the drift; ~1.3 reads organic, 1 reads mechanical */
	driftRatio?: number;
	/** frames per x drift cycle */
	driftPeriod?: number;
	/** darkening of the frame corners reached at the end of the move (0 = none) */
	vignette?: number;
	style?: React.CSSProperties;
};

/** Eased progress of a move with a trapezoid speed profile: ramp up over r1, cruise, ramp down over r2. Continuous in speed. */
const trapezoid = (t: number, T: number, r1: number, r2: number): number => {
	if (t <= 0) {
		return 0;
	}
	if (t >= T) {
		return 1;
	}
	const v = 1 / (T - r1 / 2 - r2 / 2);
	if (r1 > 0 && t < r1) {
		return (v * t * t) / (2 * r1);
	}
	if (r2 > 0 && t > T - r2) {
		const s = T - t;
		return 1 - (v * s * s) / (2 * r2);
	}
	return v * (t - r1 / 2);
};

/**
 * A slow dolly: the zoom builds smoothly toward a focus point, with a small Lissajous drift on top so the
 * hold never looks frozen. Wrap a shot; optional corner vignette closes in as it goes.
 */
export const SlowPush: React.FC<SlowPushProps> = ({
	children,
	from = 1,
	to = 1.14,
	focus = {x: 0.5, y: 0.5},
	follow = 0.6,
	duration,
	easeIn = 20,
	easeOut = 0,
	drift = 5,
	driftRatio = 1.3,
	driftPeriod = 150,
	vignette = 0.3,
	style,
}) => {
	const frame = useCurrentFrame();
	const {width, height, durationInFrames} = useVideoConfig();
	const u = useUnit();
	const T = Math.max(2, duration ?? (Number.isFinite(durationInFrames) ? durationInFrames - 1 : 90));
	const r1 = Math.min(easeIn, T);
	const r2 = Math.min(easeOut, T - r1);
	const p = trapezoid(frame, T, r1, r2);

	// geometric zoom: a constant perceived speed
	const margin = drift > 0 ? coverScale(width, height, drift * u, drift * 0.5 * u, 0) : 1;
	const z = from * Math.pow(to / from, p) * margin;
	// the camera leans toward the focus point in proportion to how close the zoom is to its tighter end
	// (so a pull-back starts on the subject and ends centred)
	const q = from <= to ? p : 1 - p;
	const cx = width / 2 + (focus.x * width - width / 2) * follow * q;
	const cy = height / 2 + (focus.y * height - height / 2) * follow * q;
	const ph = (2 * Math.PI * frame) / driftPeriod;
	const dx = drift > 0 ? Math.sin(ph) * drift * u : 0;
	const dy = drift > 0 ? Math.sin(ph * driftRatio + 1.1) * drift * 0.5 * u : 0;
	const tx = clampPan(width / 2 - cx * z + dx, width, z);
	const ty = clampPan(height / 2 - cy * z + dy, height, z);

	return (
		<AbsoluteFill style={{overflow: 'hidden', ...style}}>
			<CameraRig transform={`translate(${tx}px, ${ty}px) scale(${z})`} origin="0 0">
				{children}
			</CameraRig>
			{vignette > 0 ? (
				<AbsoluteFill
					style={{
						pointerEvents: 'none',
						opacity: Math.min(1, vignette * p),
						background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.92) 100%)',
					}}
				/>
			) : null}
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<>
		<SlowPush to={1.32} focus={{x: 0.617, y: 0.417}} follow={0.85} easeIn={24} vignette={1} drift={6}>
			<WorldScene palette="mint" />
		</SlowPush>
		<Tag text="SLOW PUSH 1.00 > 1.32" />
	</>
);

export const slowPushEntry: LibraryEntry = {
	meta: {
		id: 'slow-push',
		title: 'Slow push',
		category: 'camera',
		looks:
			'The shot creeps in toward a focus point with a built-up start and a faint Lissajous drift, corners darkening as it goes; reversible as a pull-back.',
		use: 'Tension and reveals: the long beat before a drop, a character holding still, any hold that must not look frozen.',
		exportName: 'SlowPush',
		durationInFrames: 90,
		source: {
			kind: 'inspired',
			name: 'HyperFrames multi-phase-camera and push-in (also Remocn drift, video-shotcraft slow push-in)',
			url: 'https://github.com/heygen-com/hyperframes/blob/main/skills/hyperframes-animation/rules/multi-phase-camera.md',
		},
	},
	Demo,
};
