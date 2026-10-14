import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {BleedSvg, Bust, lerp} from './_space-utils';

export type DollyZoomProps = {
	/** the far layer: it is the one that swells (or shrinks) */
	background: React.ReactNode;
	/** the layer that stays exactly the same size throughout */
	subject: React.ReactNode;
	/** an optional layer between the two, moving less than the background */
	midground?: React.ReactNode;
	/** frame the move starts on, and how many frames it takes */
	start?: number;
	frames?: number;
	/** camera distance from the subject at the start and the end (the subject is 1 unit away to begin with). Going up = dolly back + zoom in */
	fromDistance?: number;
	toDistance?: number;
	/** how far behind the subject the layers sit, in the same units. Deeper = more dramatic */
	backgroundDepth?: number;
	midgroundDepth?: number;
	ease?: (t: number) => number;
	/** where the background swells from, as a share of the frame */
	focus?: readonly [number, number];
	/** peak background blur in px at 720p (0 = none) */
	blur?: number;
	/** strength of the edge darkening that grows with the move, 0..1 */
	vignette?: number;
};

/**
 * Hitchcock "vertigo" shot, solved with a real pinhole camera: the camera backs away from the subject while the
 * lens zooms in to keep it the same size, so the layers behind it swell by (d / (d + depth)). Layers are scaled
 * relative to the nearest camera position, so a layer never shrinks below frame size.
 * Starts at `start` frames into its <Sequence>.
 */
export const DollyZoom: React.FC<DollyZoomProps> = ({
	background,
	subject,
	midground,
	start = 0,
	frames = 60,
	fromDistance = 1,
	toDistance = 2.6,
	backgroundDepth = 3,
	midgroundDepth = 1.2,
	ease = CURVES.inOutCubic,
	focus = [0.5, 0.5],
	blur = 2,
	vignette = 0.55,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const p = progress(frame, start, frames, ease);
	const d = lerp(fromDistance, toDistance, p);
	const dMin = Math.min(fromDistance, toDistance);
	const dMax = Math.max(fromDistance, toDistance);
	const scaleAt = (dist: number, depth: number) => dist / (dist + depth) / (dMin / (dMin + depth));
	const sBg = scaleAt(d, backgroundDepth);
	const sMid = scaleAt(d, midgroundDepth);
	const sBgMax = scaleAt(dMax, backgroundDepth);
	// 0..1: how far the background has swollen, for the blur and the vignette
	const amount = sBgMax > 1 ? (sBg - 1) / (sBgMax - 1) : 0;
	const origin = `${focus[0] * 100}% ${focus[1] * 100}%`;
	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			<AbsoluteFill
				style={{
					transform: `scale(${sBg})`,
					transformOrigin: origin,
					filter: blur > 0 && amount > 0.01 ? `blur(${blur * u * amount}px)` : undefined,
				}}
			>
				{background}
			</AbsoluteFill>
			{midground ? (
				<AbsoluteFill
					style={{
						transform: `scale(${sMid})`,
						transformOrigin: origin,
						filter: blur > 0 && amount > 0.01 ? `blur(${blur * u * amount * 0.5}px)` : undefined,
					}}
				>
					{midground}
				</AbsoluteFill>
			) : null}
			<AbsoluteFill
				style={{
					background: `radial-gradient(ellipse at ${origin}, transparent 30%, rgba(0,0,0,${0.85 * vignette}) 100%)`,
					opacity: amount,
				}}
			/>
			<AbsoluteFill>{subject}</AbsoluteFill>
		</AbsoluteFill>
	);
};

// ---- demo -----------------------------------------------------------------------------------------------

const Corridor: React.FC = () => {
	const rects = Array.from({length: 14}, (_, i) => 13 - i);
	const half = (k: number) => 56 * Math.pow(1.34, k);
	const door = ['#fff4d6', DEMO.yellow, DEMO.red];
	return (
		<AbsoluteFill style={{background: DEMO.ink}}>
			<BleedSvg s={1.4}>
				<defs>
					<radialGradient id="dz-glow">
						<stop offset="0" stopColor={DEMO.red} stopOpacity={0.75} />
						<stop offset="1" stopColor={DEMO.red} stopOpacity={0} />
					</radialGradient>
				</defs>
				{rects.map((k) => {
					const hw = half(k);
					const hh = hw * 0.5625;
					return (
						<rect
							key={k}
							x={640 - hw}
							y={360 - hh}
							width={hw * 2}
							height={hh * 2}
							fill={k < 3 ? door[k] : k % 2 ? '#0a0922' : '#1b2c9a'}
							stroke={k < 3 ? 'none' : DEMO.cyan}
							strokeWidth={2 + k * 0.6}
						/>
					);
				})}
				{[
					[-1, -1],
					[1, -1],
					[1, 1],
					[-1, 1],
				].map(([sx, sy], i) => (
					<line key={i} x1={640 + sx * half(13)} y1={360 + sy * half(13) * 0.5625} x2={640 + sx * half(3)} y2={360 + sy * half(3) * 0.5625} stroke={DEMO.cyan} strokeWidth={3} opacity={0.55} />
				))}
				<circle cx={640} cy={360} r={430} fill="url(#dz-glow)" style={{mixBlendMode: 'screen'}} />
			</BleedSvg>
		</AbsoluteFill>
	);
};

const Pylons: React.FC = () => (
	<AbsoluteFill>
		<BleedSvg s={1.4}>
			{[-1, 1].map((side) => {
				const x = 640 + side * 480;
				return (
					<g key={side}>
						<rect x={x - 70} y={-200} width={140} height={1120} fill="#0a0920" stroke={DEMO.cyan} strokeWidth={4} />
						{Array.from({length: 12}, (_, i) => (
							<rect key={i} x={x - 8} y={-120 + i * 86} width={16} height={44} fill={i % 3 === 0 ? DEMO.red : DEMO.yellow} />
						))}
					</g>
				);
			})}
		</BleedSvg>
	</AbsoluteFill>
);

const Subject: React.FC = () => (
	<AbsoluteFill>
		<svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
			<g transform="translate(640 748) scale(0.9)">
				<Bust fill={DEMO.paper} rim="none" accent={DEMO.paper} outline={DEMO.paper} />
			</g>
			<g transform="translate(640 748) scale(0.9)">
				<Bust fill="#0b0b12" rim={DEMO.cyan} accent={DEMO.red} />
			</g>
		</svg>
	</AbsoluteFill>
);

const Demo: React.FC = () => <DollyZoom start={6} frames={78} background={<Corridor />} midground={<Pylons />} subject={<Subject />} />;

export const dollyZoomEntry: LibraryEntry = {
	meta: {
		id: 'dolly-zoom',
		title: 'Dolly zoom',
		category: 'camera',
		looks: 'The hero holds one size while the corridor behind swells 1.9x and pylons rush outward: the camera backs off as the lens zooms in.',
		use: 'The moment a character realises something; a reveal that should feel like the floor dropping away.',
		exportName: 'DollyZoom',
		durationInFrames: 90,
		source: {
			kind: 'inspired',
			name: 'HyperFrames camera-dolly-zoom',
			url: 'https://github.com/heygen-com/hyperframes/blob/main/registry/blocks/camera-dolly-zoom/camera-dolly-zoom.html',
		},
	},
	Demo,
};
