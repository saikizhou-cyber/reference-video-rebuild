// Ported from video-shotcraft crash-zoom-punch (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/camera/crash-zoom-punch/CrashImpactReal.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: generalised from one fixed screenshot into a wrapper for any scene; geometric zoom with an ease-in that arrives at full speed, focus point as a prop with edge clamping, an elastic-rebound landing next to the impact-shake landing (high-frequency x / 0.7 y oscillation with exponential decay, tau 1.8 frames as in the original; cosine phase so the first landed frame carries the full amplitude), and the radial speed blur re-implemented as progressive-opacity sub-frame camera copies instead of @remotion/motion-blur. Modified.
import React from 'react';
import {AbsoluteFill, Easing, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {WorldScene, Tag, clampPan} from './_moves-utils';
import {useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

export type CrashZoomProps = {
	children: React.ReactNode;
	/** frame (relative to the enclosing <Sequence>) the push starts on */
	start?: number;
	/** frames from wide to close; 4-8 reads as a crash, 12+ as a push */
	frames?: number;
	/** zoom at the wide end / the close end */
	from?: number;
	to?: number;
	/** point of the frame (0..1 each) the camera dives into; it ends centred on it */
	focus?: {x: number; y: number};
	/** 'rebound' = elastic overshoot then settle; 'impact' = dead stop with a decaying shake; 'none' = just stop */
	landing?: 'rebound' | 'impact' | 'none';
	/** rebound: how far the zoom overshoots, as a share of the final zoom */
	overshoot?: number;
	/** rebound: frames to settle */
	settle?: number;
	/** impact: peak shake in px at 720p (dies in ~6 frames) */
	shake?: number;
	/** radial speed blur: number of sub-frame camera samples (0 = off). The scene is rendered once per sample */
	blur?: number;
	/** blur length as a shutter angle (180 = half a frame interval) */
	shutterAngle?: number;
	style?: React.CSSProperties;
};

// slow start, arrives at ~4.5x its average speed: the push reads as a crash, not a glide
const CRASH_IN = Easing.bezier(0.55, 0, 0.9, 0.55);

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Wide to close in a few frames, straight at a point of the picture, with radial speed blur on the push and a
 * rebound or an impact shake on the landing. Hold the wide shot a beat before `start` and the close shot after it.
 */
export const CrashZoom: React.FC<CrashZoomProps> = ({
	children,
	start = 12,
	frames = 6,
	from = 1,
	to = 2.6,
	focus = {x: 0.62, y: 0.42},
	landing = 'rebound',
	overshoot = 0.08,
	settle = 8,
	shake = 14,
	blur = 24,
	shutterAngle = 180,
	style,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	const arrive = start + Math.max(1, frames);

	// damped sine with its peak equal to `overshoot`: zero offset and positive velocity at the landing
	const tau = settle / 3;
	const omega = (2 * Math.PI) / (settle * 0.9);
	const sPeak = Math.atan(omega * tau) / omega;
	const peak = Math.exp(-sPeak / tau) * Math.sin(omega * sPeak);

	const camAt = (t: number) => {
		const p = clamp01((t - start) / Math.max(1, frames));
		const e = CRASH_IN(p);
		let z = from * Math.pow(to / from, e);
		const s = t - arrive;
		if (landing === 'rebound' && s > 0) {
			z *= 1 + (overshoot / peak) * Math.exp(-s / tau) * Math.sin(omega * s);
		}
		// the camera centre travels from the frame centre to the focus point as the zoom builds
		const cx = width / 2 + (focus.x * width - width / 2) * e;
		const cy = height / 2 + (focus.y * height - height / 2) * e;
		let tx = width / 2 - cx * z;
		let ty = height / 2 - cy * z;
		if (landing === 'impact' && s >= 0) {
			const env = shake * u * Math.exp(-s / 1.8);
			tx += env * Math.cos(s * 2.9);
			ty += env * 0.7 * Math.cos(s * 3.7 + 0.8);
		}
		return {z, tx: clampPan(tx, width, z), ty: clampPan(ty, height, z)};
	};

	const shutter = shutterAngle / 360;
	const a = camAt(frame - shutter / 2);
	const b = camAt(frame + shutter / 2);
	const speed = Math.abs(Math.log(b.z / a.z));
	const n = blur > 1 && speed > 0.03 ? Math.round(blur) : 1;

	const layers: React.ReactNode[] = [];
	for (let k = 0; k < n; k++) {
		const t = n === 1 ? frame : frame + (k / (n - 1) - 0.5) * shutter;
		const c = camAt(t);
		layers.push(
			<div
				key={k}
				style={{
					position: 'absolute',
					inset: 0,
					transformOrigin: '0 0',
					transform: `translate(${c.tx}px, ${c.ty}px) scale(${c.z})`,
					// progressive opacity: layer k at 1 / (k + 1) makes every sample count equally
					opacity: 1 / (k + 1),
				}}
			>
				{children}
			</div>,
		);
	}
	return <AbsoluteFill style={{overflow: 'hidden', ...style}}>{layers}</AbsoluteFill>;
};

const Demo: React.FC = () => (
	<>
		<Sequence durationInFrames={45}>
			<CrashZoom start={18} frames={6} to={1.9} focus={{x: 0.617, y: 0.417}} landing="rebound">
				<WorldScene palette="dusk" />
			</CrashZoom>
			<Tag text="REBOUND LANDING" />
		</Sequence>
		<Sequence from={45}>
			<CrashZoom start={15} frames={6} to={1.75} focus={{x: 0.255, y: 0.5}} landing="impact">
				<WorldScene palette="ember" />
			</CrashZoom>
			<Tag text="IMPACT LANDING" />
		</Sequence>
	</>
);

export const crashZoomEntry: LibraryEntry = {
	meta: {
		id: 'crash-zoom',
		title: 'Crash zoom',
		category: 'camera',
		looks:
			'The wide shot slams into a close-up on a chosen point in 6 frames with radial speed blur, then lands with an elastic overshoot or a dead stop and a decaying shake.',
		use: 'Reveal beats: the hero, the logo, the weapon. Hold wide for a beat before it and close for a second after.',
		exportName: 'CrashZoom',
		durationInFrames: 90,
		source: {
			kind: 'ported',
			name: 'video-shotcraft crash-zoom-punch',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/camera/crash-zoom-punch/CrashImpactReal.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
