import React from 'react';
import {AbsoluteFill, Sequence, random, useCurrentFrame, useVideoConfig} from 'remotion';
import type {LibraryEntry} from '../../core/types';
import {SceneA, SceneB} from '../../core/scene';
import {hex, mixHex} from './_look-utils';

export type LightLeakProps = {
	/** 0..1 progress of the whole leak. Omit to derive it from the current frame and `durationInFrames` */
	progress?: number;
	/** length in frames when `progress` is not given (the component then starts at frame 0 of its <Sequence>) */
	durationInFrames?: number;
	/** where in 0..1 the leak is fullest: put the cut here, it is hidden behind the light */
	peak?: number;
	/** half-width (in progress units) of the white-hot burn around `peak`: while it lasts the frame is fully covered, so any cut inside it is invisible */
	hold?: number;
	/** [edge, body, hot]: fringe, main wash and hot colours of the leak, from the leading edge inwards (default: hot pink, orange, gold) */
	colors?: readonly [string, string, string];
	/** the near-white heart of the leak at the peak */
	core?: string;
	/** changes the shape and spread of the blobs */
	seed?: number;
	/** direction the light travels in, degrees: 0 = left to right, 90 = top to bottom, 160 = in from the right, drifting down to the left */
	angle?: number;
	/** overall strength. 1 = full burn that hides the cut at the peak; below 1 the leak stays see-through; above 1 it burns out wider */
	intensity?: number;
	/** how much the warm wash covers the picture (1 = like an orange gel laid over it, 0 = it only adds light and a blue picture goes lilac) */
	wash?: number;
	/** how the extra glow layer adds to the picture underneath */
	blend?: 'screen' | 'plus-lighter';
	/** a thin bright slit that rides the leading edge of the leak (a lens-scratch look, off by default) */
	slit?: boolean;
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (x: number): number => {
	const t = clamp01(x);
	return t * t * (3 - 2 * t);
};

const rgba = (color: string, alpha: number): string => {
	const [r, g, b] = hex(color);
	return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${clamp01(alpha).toFixed(3)})`;
};

/** length of the light band along its travel, in units of the frame diagonal */
const BAND = 3;
const BLOBS = 7;

/**
 * Where the leading edge of the band is (in diagonal units, 0 = frame centre, travel axis), and how burnt-out the frame is.
 * Slow build -> hits the peak -> white-hot hold (hides the cut) -> decay that leaves a soft trailing tail.
 */
const timeline = (p: number, peak: number, hold: number): {front: number; burn: number} => {
	const pa = Math.max(0.06, peak - hold);
	const pb = Math.min(0.94, peak + hold);
	const rest = BAND / 2;
	let front: number;
	if (p <= pa) {
		front = -0.5 + (rest + 0.5) * Math.pow(p / pa, 1.25);
	} else if (p <= pb) {
		front = rest + 0.05 * ((p - pa) / (pb - pa));
	} else {
		const t = (p - pb) / (1 - pb);
		front = rest + 0.05 + (0.5 + rest - 0.05) * (1 - Math.pow(1 - t, 1.5));
	}
	// white-hot cover: a late, quick flash up (the band is readable before it), 1 through the hold, then a fast drain
	// that lets the new picture show through the band while the band is still leaving
	const riseLen = Math.min(0.11, pa * 0.7);
	const fallLen = Math.min(0.14, (1 - pb) * 0.7);
	const rise = Math.pow(smooth((p - (pa - riseLen)) / riseLen), 1.8);
	const fall = Math.pow(1 - clamp01((p - pb) / fallLen), 2);
	return {front, burn: p >= pa && p <= pb ? 1 : p < pa ? rise : fall};
};

/**
 * A procedural warm light leak: a band of hot-pink, orange and gold light sweeps across the frame, burns out to near-white at the
 * peak and drains away in a soft tail. Lay it over a cut (or between two scenes) so the cut lands inside the white-hot hold.
 * Pure CSS gradients and blend modes, deterministic in `progress` and `seed`. Use it as <LightLeak ... /> (same component).
 */
export const lightLeak: React.FC<LightLeakProps> = ({
	progress: progressProp,
	durationInFrames = 30,
	peak = 0.5,
	hold = 0.05,
	colors = ['#ff2e63', '#ff7a18', '#ffd36b'],
	core = '#fff4d6',
	seed = 1,
	angle = 160,
	intensity = 1,
	wash = 0.95,
	blend = 'screen',
	slit = false,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const p = clamp01(progressProp ?? frame / Math.max(1, durationInFrames - 1));
	const {front, burn} = timeline(p, peak, hold);
	// the very first and last frames stay clean, everything else is visible from the first beat
	const live = smooth(p / 0.08) * (1 - smooth((p - 0.94) / 0.06));
	const burnAlpha = clamp01(burn * intensity);
	if (live <= 0.002 && burnAlpha <= 0.002) {
		return null;
	}

	const D = Math.hypot(width, height);
	const [edge, body, hot] = colors;
	const bandLeft = (0.5 + front - BAND) * D;
	const k = live * intensity;

	// ragged blobs along the leading edge and through the band: they break the straight edge and add plasma-like colour variation
	const blobs = Array.from({length: BLOBS}, (_, i) => {
		const r = (key: string) => random(`ll-${seed}-${i}-${key}`);
		const w = (0.34 + 0.32 * r('w')) * D;
		const h = (1.7 + 0.9 * r('h')) * (D / BLOBS);
		const tier = Math.floor(r('c') * 3);
		// pink and orange blobs lead the edge, gold ones sit behind it (gold ahead of the edge turns the blue underneath grey)
		const cx = front + (r('x') - 0.62) * 0.4 - (tier === 2 ? 0.22 : 0);
		const cy = (i + 0.5 + (r('y') - 0.5) * 0.7) / BLOBS;
		return {w, h, cx, cy, tier, a: 0.55 + 0.4 * r('a'), key: i};
	});
	const tierColor = [edge, body, hot];

	const ramp = [
		`${rgba(edge, 0)} 0%`,
		`${rgba(edge, 0.55)} 4%`,
		`${rgba(body, 0.92)} 12%`,
		`${rgba(hot, 1)} 24%`,
		`${rgba(core, 1)} 43%`,
		`${rgba(core, 1)} 57%`,
		`${rgba(hot, 1)} 76%`,
		`${rgba(body, 1)} 89%`,
		`${rgba(edge, 0.95)} 95.5%`,
		`${rgba(edge, 0)} 100%`,
	].join(', ');

	const rotated = (children: React.ReactNode): React.ReactNode => (
		<div
			style={{
				position: 'absolute',
				left: '50%',
				top: '50%',
				width: D,
				height: D,
				marginLeft: -D / 2,
				marginTop: -D / 2,
				transform: `rotate(${angle}deg)`,
			}}
		>
			{children}
		</div>
	);

	const burnEye = mixHex(core, '#ffffff', 0.55);
	const burnTint = mixHex(core, hot, 0.75);
	// the glow only builds with the leak, so the first frames are pure warm colour (screen on a blue picture would turn it lilac)
	const glow = clamp01(k) * smooth(p / Math.max(0.1, peak - hold));

	return (
		<AbsoluteFill style={{pointerEvents: 'none', overflow: 'hidden'}}>
			{/* the warm body: normal blend, so the leak reads as orange / pink / gold over any picture, a saturated blue one included */}
			<AbsoluteFill style={{opacity: clamp01(k) * wash}}>
				{rotated(
					<>
						<div
							style={{
								position: 'absolute',
								left: bandLeft,
								top: 0,
								width: BAND * D,
								height: D,
								background: `linear-gradient(90deg, ${ramp})`,
							}}
						/>
						{blobs.map((b) => (
							<div
								key={b.key}
								style={{
									position: 'absolute',
									left: (0.5 + b.cx) * D - b.w / 2,
									top: b.cy * D - b.h / 2,
									width: b.w,
									height: b.h,
									background: `radial-gradient(ellipse closest-side at 50% 50%, ${rgba(tierColor[b.tier], b.a)} 0%, ${rgba(tierColor[b.tier], b.a * 0.55)} 50%, ${rgba(tierColor[b.tier], 0)} 100%)`,
								}}
							/>
						))}
					</>,
				)}
			</AbsoluteFill>
			{/* the glow: adds light on top, pushes the middle of the band towards white */}
			<AbsoluteFill style={{mixBlendMode: blend, opacity: glow}}>
				{rotated(
					<>
						<div
							style={{
								position: 'absolute',
								left: bandLeft,
								top: 0,
								width: BAND * D,
								height: D,
								opacity: 0.55,
								background: `linear-gradient(90deg, ${rgba(hot, 0)} 18%, ${rgba(hot, 0.7)} 34%, ${rgba(core, 0.9)} 50%, ${rgba(hot, 0.7)} 66%, ${rgba(hot, 0)} 90%)`,
							}}
						/>
						{blobs
							.filter((b) => b.tier !== 0)
							.map((b) => (
								<div
									key={b.key}
									style={{
										position: 'absolute',
										left: (0.5 + b.cx - 0.12) * D - b.w / 2,
										top: b.cy * D - b.h / 2,
										width: b.w,
										height: b.h,
										background: `radial-gradient(ellipse closest-side at 50% 50%, ${rgba(b.tier === 2 ? core : hot, b.a * 0.55)} 0%, ${rgba(hot, 0)} 100%)`,
									}}
								/>
							))}
						{slit ? (
							<div
								style={{
									position: 'absolute',
									left: (0.5 + front - 0.04) * D - 0.015 * D,
									top: 0,
									width: 0.03 * D,
									height: D,
									background: `linear-gradient(90deg, ${rgba(core, 0)} 0%, ${rgba(core, 0.95)} 50%, ${rgba(core, 0)} 100%)`,
								}}
							/>
						) : null}
					</>,
				)}
			</AbsoluteFill>
			{/* the burn-out: fully opaque near-white for the hold, so the cut underneath cannot be seen */}
			<AbsoluteFill
				style={{
					opacity: burnAlpha,
					background: `radial-gradient(ellipse 85% 95% at 50% 50%, ${rgba(burnEye, 1)} 0%, ${rgba(core, 1)} 45%, ${rgba(burnTint, 1)} 100%)`,
				}}
			/>
		</AbsoluteFill>
	);
};

/** same component under the usual JSX-friendly name */
export const LightLeak = lightLeak;

const Demo: React.FC = () => (
	<AbsoluteFill>
		<Sequence durationInFrames={30}>
			<SceneA />
		</Sequence>
		<Sequence from={30}>
			<SceneB />
		</Sequence>
		<LightLeak durationInFrames={60} peak={0.5} />
	</AbsoluteFill>
);

export const lightLeakEntry: LibraryEntry = {
	meta: {
		id: 'light-leak',
		title: 'Light leak',
		category: 'fx',
		looks: 'A band of hot-pink, orange and gold light sweeps in from the edge, burns out to near-white at the peak while the cut happens underneath, then drains away in a soft tail.',
		use: 'Hide a cut with a film-burn flash, a warm memory / flashback beat, a soft intro or outro; place the cut inside the hold around `peak`.',
		exportName: 'lightLeak',
		durationInFrames: 60,
		source: {kind: 'inspired', name: 'Remotion light leaks (@remotion/effects) and 29a.ch colour-plasma light leak', url: 'https://www.remotion.dev/docs/light-leaks'},
	},
	Demo,
};
