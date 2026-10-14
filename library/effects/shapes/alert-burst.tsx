import React from 'react';
import {AbsoluteFill, Sequence, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {DEMO, Backdrop, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp, r2} from './_bursts-utils';

/** [direction (deg, screen: -90 = up), root radius, tip radius, root width, tip width, tip slant (deg)] in px at 720p */
export type AlertSpike = [dir: number, r0: number, r1: number, w0: number, w1: number, cut: number];

/** A beat on the mark's scale: [frame, amount, frames to relax, frames to hold first]. + re-pops, - recoils. */
export type AlertKick = [at: number, amount: number, length: number, hold?: number];

/** ready-made silhouettes; pass your own tuples through `spikes` */
export const ALERT_SPIKES = {
	/** four sharp pointed wedges fanning upward, each a different length */
	wedge: [
		[-158, 38, 104, 17, 0, 0],
		[-119, 42, 168, 24, 0, 0],
		[-81, 42, 152, 24, 0, 0],
		[-42, 38, 98, 17, 0, 0],
	],
	/** three flat-ended rods, a tick fan */
	tick: [
		[-130, 34, 84, 11, 11, 0],
		[-90, 34, 116, 11, 11, 0],
		[-50, 34, 84, 11, 11, 0],
	],
	/** five thin needles spread wide */
	needle: [
		[-165, 28, 84, 12, 0, 0],
		[-128, 28, 124, 13, 0, 0],
		[-90, 28, 166, 14, 0, 0],
		[-52, 28, 124, 13, 0, 0],
		[-15, 28, 84, 12, 0, 0],
	],
} satisfies Record<string, AlertSpike[]>;

export type AlertBurstProps = {
	/** root point as fractions of the frame */
	x?: number;
	y?: number;
	preset?: keyof typeof ALERT_SPIKES;
	/** custom spike tuples (replaces the preset) */
	spikes?: AlertSpike[];
	/** overall size */
	scale?: number;
	/** degrees, turns the whole fan */
	rotation?: number;
	/** mirror horizontally */
	flip?: boolean;
	color?: string;
	/** flat offset copy beneath the spikes (null = none) */
	shadow?: string | null;
	/** px at 720p the shadow is offset down-right */
	shadowOffset?: number;
	/** beats on the scale, frames from the start of the <Sequence> */
	kicks?: AlertKick[];
	/** redraw the spikes every n frames (5 = 6 fps at 30 fps, the hand-drawn boil); 0 = never */
	boilEvery?: number;
	/** 0-1+ amount of the boil: +-3 deg angle, +-10 % length, +-12 % width at 1 */
	boil?: number;
	/** hold each step of the pop-in for this many frames (2 = on twos) */
	stepFrames?: number;
	/** frame at which the mark shrinks away (undefined = stays) */
	exitAt?: number;
	exitFrames?: number;
	seed?: number;
};

/** pop-in steps: in at 92 %, overshoot, settle */
const POP = [0.92, 1.1, 0.98, 1];

const kickAt = (frame: number, kicks: AlertKick[]) =>
	kicks.reduce((sum, [at, amount, length, hold = 0]) => {
		const dt = frame - at;
		if (dt < 0) {
			return sum;
		}
		return sum + amount * (dt <= hold ? 1 : Math.max(0, 1 - (dt - hold) / Math.max(1, length)));
	}, 0);

/** seeded redraw: the spike's angle, length and widths wobble a little each time the boil step changes */
const boiled = (s: AlertSpike, seed: number, i: number, step: number, amount: number): AlertSpike => {
	const n = (k: number) => random(`alert-${seed}-${i}-${step}-${k}`) * 2 - 1;
	const [a, r0, r1, w0, w1, cut] = s;
	return [a + 3 * amount * n(1), r0, r0 + (r1 - r0) * (1 + 0.1 * amount * n(2)), w0 * (1 + 0.08 * amount * n(3)), w1 * (1 + 0.12 * amount * n(4)), cut];
};

const spikePoints = ([a, r0, r1, w0, w1, cut]: AlertSpike) => {
	const d = (a * Math.PI) / 180;
	const ux = Math.cos(d);
	const uy = Math.sin(d);
	const px = -uy;
	const py = ux;
	// a slanted tip: one corner reaches a little further than the other
	const lean = (Math.tan((cut * Math.PI) / 180) * w1) / 2;
	return [
		[ux * r0 - (px * w0) / 2, uy * r0 - (py * w0) / 2],
		[ux * r0 + (px * w0) / 2, uy * r0 + (py * w0) / 2],
		[ux * (r1 + lean) + (px * w1) / 2, uy * (r1 + lean) + (py * w1) / 2],
		[ux * (r1 - lean) - (px * w1) / 2, uy * (r1 - lean) - (py * w1) / 2],
	]
		.map((p) => `${r2(p[0])},${r2(p[1])}`)
		.join(' ');
};

/**
 * Manga "!" burst: 2-5 sharp spikes radiate from a root point and pop in on stepped scale (92 % -> 110 % -> 98 % -> 100 %),
 * then hold with beat kicks and a 6 fps redraw boil. Starts at frame 0 of its <Sequence>.
 */
export const AlertBurst: React.FC<AlertBurstProps> = ({
	x = 0.5,
	y = 0.5,
	preset = 'wedge',
	spikes,
	scale = 1,
	rotation = 0,
	flip = false,
	color = '#ffffff',
	shadow = '#0b0b10',
	shadowOffset = 3,
	kicks = [],
	boilEvery = 5,
	boil = 1,
	stepFrames = 1,
	exitAt,
	exitFrames = 4,
	seed = 1,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	if (frame < 0) {
		return null;
	}
	const step = Math.floor(frame / Math.max(1, stepFrames));
	let s = POP[Math.min(step, POP.length - 1)] + kickAt(frame, kicks);
	if (exitAt !== undefined && frame >= exitAt) {
		const k = clamp((frame - exitAt) / Math.max(1, exitFrames), 0, 1);
		if (k >= 1) {
			return null;
		}
		s *= 1 - k * k;
	}
	const base = spikes ?? ALERT_SPIKES[preset];
	const bstep = boilEvery > 0 ? Math.floor(frame / boilEvery) : 0;
	const drawn = base.map((sp, i) => (boilEvery > 0 && boil > 0 ? boiled(sp, seed, i, bstep, boil) : sp));
	const polys = drawn.map((sp) => spikePoints(sp));
	const k = scale * u * Math.max(0, s);
	const sx = flip ? -1 : 1;
	// the shadow offset is in screen px, the group is scaled: divide the scale back out
	const off = shadowOffset / Math.max(0.01, scale * Math.max(0.2, s));
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{display: 'block'}}>
				<g transform={`translate(${x * width} ${y * height}) rotate(${rotation}) scale(${r2(k * sx)} ${r2(k)})`}>
					{shadow ? (
						<g transform={`translate(${r2(off * sx)} ${r2(off)})`} fill={shadow}>
							{polys.map((p, i) => (
								<polygon key={i} points={p} />
							))}
						</g>
					) : null}
					<g fill={color}>
						{polys.map((p, i) => (
							<polygon key={i} points={p} />
						))}
					</g>
				</g>
			</svg>
		</AbsoluteFill>
	);
};

/** demo only: a head-and-shoulders silhouette */
const Figure: React.FC<{x: number; tone: string}> = ({x, tone}) => {
	const {width, height} = useVideoConfig();
	const u = useUnit();
	return (
		<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', inset: 0}}>
			<ellipse cx={x * width} cy={height + 10 * u} rx={150 * u} ry={190 * u} fill={tone} />
			<circle cx={x * width} cy={height - 215 * u} r={62 * u} fill={tone} />
		</svg>
	);
};

const beats = (offset: number): AlertKick[] => [
	[offset + 8, 0.14, 4],
	[offset + 17, -0.12, 5],
	[offset + 26, 0.14, 4, 2],
	[offset + 38, -0.1, 4],
	[offset + 47, 0.14, 4],
	[offset + 60, -0.1, 5],
];

const Demo: React.FC = () => (
	<Backdrop color={DEMO.blue}>
		<AbsoluteFill style={{backgroundImage: `repeating-linear-gradient(-30deg, rgba(255,255,255,0.1) 0 6px, transparent 6px 46px)`}} />
		<Figure x={0.2} tone={DEMO.ink} />
		<Figure x={0.5} tone={DEMO.ink} />
		<Figure x={0.8} tone={DEMO.ink} />
		<Sequence from={-3}>
			<AlertBurst x={0.275} y={0.5} preset="wedge" color={DEMO.paper} kicks={beats(0)} seed={1} scale={1.25} />
		</Sequence>
		<Sequence from={28}>
			<AlertBurst x={0.57} y={0.5} preset="needle" color={DEMO.yellow} kicks={beats(0)} seed={2} scale={1.1} rotation={8} stepFrames={2} />
		</Sequence>
		<Sequence from={54}>
			<AlertBurst x={0.87} y={0.5} preset="tick" color={DEMO.paper} kicks={beats(0)} seed={3} scale={1.3} flip />
		</Sequence>
	</Backdrop>
);

export const alertBurstEntry: LibraryEntry = {
	meta: {
		id: 'alert-burst',
		title: 'Alert burst',
		category: 'shapes',
		looks: 'A fan of 2-5 sharp spikes radiates from a root point, pops in on stepped scale, then holds with beat kicks and a hand-drawn 6 fps boil; flat offset shadow.',
		use: 'A character notices something; "!" accents on a beat; also a tick fan as a hit mark on an icon.',
		exportName: 'AlertBurst',
		durationInFrames: 90,
		source: {kind: 'original'},
	},
	Demo,
};
