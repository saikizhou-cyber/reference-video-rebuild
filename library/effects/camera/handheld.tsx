import React, {useMemo} from 'react';
import {Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {WorldScene, CameraRig, RefMark, Tag, coverScale, noise1, type Octave} from './_moves-utils';
import {BODY_FONT, DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

export type HandheldRig = 'handheld' | 'steady' | 'running';

export type HandheldProps = {
	children: React.ReactNode;
	/** overall multiplier. 1 = a readable shoulder-held wander (about +-1.5 % of the frame width, +-1 degree of roll); 0.4 = subtle, 2 = rough */
	amount?: number;
	/** wander speed multiplier */
	speed?: number;
	/** 'handheld' = shoulder rig; 'steady' = slow glide with almost no tremor; 'running' = handheld plus a footfall bob */
	rig?: HandheldRig;
	/** frames over which the movement fades in from a still frame (0 = from frame 0) */
	ramp?: number;
	/**
	 * scale just enough to hide the edges. Sized to the real excursion of this exact clip (the wander over the enclosing
	 * Sequence is scanned once), then held constant, so the crop never pumps and is never bigger than the motion needs.
	 * Clips longer than ~2 minutes fall back to the worst-case bound.
	 */
	overscan?: boolean;
	seed?: number;
	style?: React.CSSProperties;
};

type RigSpec = {
	octaves: Octave[];
	/** soft limits at amount 1: px at 720p, degrees of roll, breathing as a scale fraction. The wander sits at about 55 % of the limit (rms). */
	shiftX: number;
	shiftY: number;
	roll: number;
	breath: number;
	bob?: {hz: number; x: number; y: number; roll: number};
};

// our own octave tables: a slow sway, a mid wobble and a small fast tremor, normalised by their combined power
const RIGS: Record<HandheldRig, RigSpec> = {
	handheld: {
		octaves: [
			{freq: 0.5, amp: 1},
			{freq: 1.7, amp: 0.55},
			{freq: 5.5, amp: 0.22},
		],
		shiftX: 26,
		shiftY: 18,
		roll: 1.1,
		breath: 0.006,
	},
	steady: {
		octaves: [
			{freq: 0.42, amp: 1},
			{freq: 1.05, amp: 0.3},
		],
		shiftX: 24,
		shiftY: 15,
		roll: 0.5,
		breath: 0.003,
	},
	running: {
		octaves: [
			{freq: 0.55, amp: 1},
			{freq: 2.1, amp: 0.6},
			{freq: 6.5, amp: 0.25},
		],
		shiftX: 18,
		shiftY: 12,
		roll: 0.9,
		breath: 0.006,
		bob: {hz: 2.7, x: 6, y: 11, roll: 0.6},
	},
};

/**
 * Smooth wander in -1..1: octaves of seeded value noise, normalised by RMS power (so adding a tremor octave does not
 * shrink the sway) and soft-limited with tanh (so the sum can never leave +-1, which makes the worst-case crop a hard bound).
 * Each octave and seed has its own time offset, otherwise channels sharing a frequency move in lockstep.
 */
const wander = (t: number, seed: number, octaves: readonly Octave[]): number => {
	let sum = 0;
	let power = 0;
	for (let k = 0; k < octaves.length; k++) {
		const o = octaves[k];
		sum += o.amp * noise1(t * o.freq + seed * 7.13 + k * 17.31, seed + k * 3);
		power += o.amp * o.amp;
	}
	return Math.tanh((1.5 * sum) / Math.sqrt(power));
};

type Pose = {
	/** px at 720p */
	x: number;
	y: number;
	/** degrees */
	r: number;
	/** breathing zoom as an added scale fraction (never negative) */
	z: number;
};

const poseAt = (frame: number, fps: number, R: RigSpec, amount: number, speed: number, ramp: number, seed: number): Pose => {
	const t = (frame / fps) * speed;
	const e = ramp > 0 ? Math.min(1, Math.max(0, frame / ramp)) : 1;
	const k = amount * e * e * (3 - 2 * e);
	let x = R.shiftX * wander(t, seed * 5 + 1, R.octaves);
	let y = R.shiftY * wander(t, seed * 5 + 2, R.octaves);
	let r = R.roll * wander(t, seed * 5 + 3, R.octaves);
	if (R.bob) {
		const w = 2 * Math.PI * R.bob.hz * t;
		x += R.bob.x * Math.sin(w * 0.5);
		y += R.bob.y * Math.abs(Math.cos(w * 0.5)) - R.bob.y * 0.6;
		r += R.bob.roll * Math.sin(w * 0.5 + 0.7);
	}
	const z = R.breath * k * (1 + wander(t, seed * 5 + 4, R.octaves));
	return {x: x * k, y: y * k, r: r * k, z};
};

/**
 * Exact smallest uniform scale at which a w x h frame, translated by (tx, ty) px and rotated by `deg` about its centre
 * (CSS order: translate, rotate, scale), still covers the whole viewport.
 */
const exactCover = (w: number, h: number, tx: number, ty: number, deg: number): number => {
	const a = (deg * Math.PI) / 180;
	const c = Math.cos(a);
	const s = Math.sin(a);
	let m = 1;
	for (const sx of [-1, 1]) {
		for (const sy of [-1, 1]) {
			const px = (sx * w) / 2 - tx;
			const py = (sy * h) / 2 - ty;
			m = Math.max(m, Math.abs(px * c + py * s) / (w / 2), Math.abs(-px * s + py * c) / (h / 2));
		}
	}
	return m;
};

/** scan limit: ~2 minutes at 30 fps */
const SCAN_MAX = 4000;

/**
 * Organic camera wander: three octaves of smooth seeded noise on x, y and roll (plus a faint breathing zoom),
 * a pure function of the frame. Never shows the edges. Wrap any scene to take the tripod off it.
 */
export const Handheld: React.FC<HandheldProps> = ({children, amount = 1, speed = 1, rig = 'handheld', ramp = 0, overscan = true, seed = 1, style}) => {
	const frame = useCurrentFrame();
	const {fps, width, height, durationInFrames} = useVideoConfig();
	const u = useUnit();
	const R = RIGS[rig];
	const p = poseAt(frame, fps, R, amount, speed, ramp, seed);

	const base = useMemo(() => {
		if (!overscan) return 1;
		const n = Number.isFinite(durationInFrames) ? Math.ceil(durationInFrames + fps) : Infinity;
		if (n > SCAN_MAX) {
			// too long to scan: size for the worst case, every channel at its soft limit at once
			const kMax = Math.abs(amount);
			const bob = R.bob;
			return coverScale(width, height, (R.shiftX + (bob?.x ?? 0)) * kMax * u, (R.shiftY + (bob ? bob.y * 0.6 : 0)) * kMax * u, (R.roll + (bob?.roll ?? 0)) * kMax) + 0.004;
		}
		let m = 1;
		for (let f = 0; f < n; f++) {
			const q = poseAt(f, fps, R, amount, speed, ramp, seed);
			m = Math.max(m, exactCover(width, height, q.x * u, q.y * u, q.r));
		}
		return m * 1.003 + 0.002;
	}, [overscan, durationInFrames, fps, width, height, u, R, amount, speed, ramp, seed]);

	return (
		<CameraRig transform={`translate(${p.x * u}px, ${p.y * u}px) rotate(${p.r}deg) scale(${base * (1 + p.z)})`} style={style}>
			{children}
		</CameraRig>
	);
};

/* ------------------------------------------------------------------- demo */

const fmt = (v: number, digits: number): string => `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(digits)}`;

/** Fixed plate that plots where the camera has been over the last second, so stills show the path, not just one offset. */
const PathHud: React.FC<{rig: HandheldRig; amount: number; seed: number}> = ({rig, amount, seed}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const u = useUnit();
	const R = RIGS[rig];
	const W = 200;
	const H = 78;
	const lx = (R.shiftX + (R.bob?.x ?? 0)) * amount;
	const ly = (R.shiftY + (R.bob ? R.bob.y * 0.6 : 0)) * amount;
	const s = Math.min((W / 2 - 8) / lx, (H / 2 - 7) / ly);
	const trail: Array<[number, number]> = [];
	for (let j = 0; j <= 20; j++) {
		const f = frame - j;
		if (f < 0) break;
		const q = poseAt(f, fps, R, amount, 1, 0, seed);
		trail.push([W / 2 + q.x * s, H / 2 + q.y * s]);
	}
	const now = poseAt(frame, fps, R, amount, 1, 0, seed);
	return (
		<div
			style={{
				position: 'absolute',
				right: 64 * u,
				top: 84 * u,
				width: (W + 24) * u,
				background: 'rgba(11,11,16,0.86)',
				borderLeft: `${6 * u}px solid ${DEMO.yellow}`,
				padding: `${9 * u}px ${12 * u}px ${10 * u}px`,
				fontFamily: BODY_FONT,
				fontWeight: 800,
				color: DEMO.paper,
			}}
		>
			<div style={{fontSize: 14 * u, letterSpacing: 4 * u, color: DEMO.yellow, marginBottom: 6 * u, whiteSpace: 'nowrap'}}>CAM PATH</div>
			<svg width={W * u} height={H * u} viewBox={`0 0 ${W} ${H}`} style={{display: 'block', background: DEMO.grey}}>
				<path d={`M${W / 2} 0V${H}M0 ${H / 2}H${W}`} stroke={DEMO.paper} strokeWidth={1} opacity={0.22} />
				{trail.slice(1).map(([x1, y1], j) => (
					<line key={j} x1={trail[j][0]} y1={trail[j][1]} x2={x1} y2={y1} stroke={DEMO.cyan} strokeWidth={2.2} strokeLinecap="round" opacity={1 - j / 22} />
				))}
				<circle cx={trail[0][0]} cy={trail[0][1]} r={4.4} fill={DEMO.yellow} />
			</svg>
			<div style={{fontSize: 16 * u, letterSpacing: 2 * u, marginTop: 7 * u, whiteSpace: 'nowrap'}}>
				X {fmt(now.x, 0)} Y {fmt(now.y, 0)} R {fmt(now.r, 1)}
			</div>
		</div>
	);
};

const SEGMENTS = [
	{rig: 'handheld', label: 'HANDHELD', palette: 'dusk', seed: 9},
	{rig: 'steady', label: 'STEADY GLIDE', palette: 'mint', seed: 14},
	{rig: 'running', label: 'RUNNING', palette: 'ember', seed: 14},
] as const;

const Demo: React.FC = () => (
	<>
		{SEGMENTS.map(({rig, label, palette, seed}, i) => (
			<Sequence key={rig} from={i * 40} durationInFrames={40}>
				<Handheld rig={rig} seed={seed}>
					<WorldScene palette={palette} inset={78} />
				</Handheld>
				<RefMark />
				<PathHud rig={rig} amount={1} seed={seed} />
				<Tag text={`${label} / x1`} />
			</Sequence>
		))}
	</>
);

export const handheldEntry: LibraryEntry = {
	meta: {
		id: 'handheld',
		title: 'Handheld',
		category: 'camera',
		looks: 'The frame drifts and tilts like a shoulder-held camera: three octaves of smooth noise on x, y and roll, with presets for a steady glide and a running bob.',
		use: 'Take the tripod off a static scene: documentary beats, chase and horror shots, anything that should feel filmed.',
		exportName: 'Handheld',
		durationInFrames: 120,
		source: {
			kind: 'inspired',
			name: 'HyperFrames camera-shake (octave value noise with per-channel seed offsets; profile tables not copied)',
			url: 'https://github.com/heygen-com/hyperframes/blob/main/registry/components/camera-shake/camera-shake.html',
		},
	},
	Demo,
};
