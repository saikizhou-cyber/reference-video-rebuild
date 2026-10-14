// Ported from video-shotcraft SmearMultiples (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/smear-multiples/SmearMultiples.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: the hand-written lagged position function becomes a generic wrapper that re-renders any child at earlier times with <Freeze> (ghost opacities fall off geometrically, the lag collapses into the body from an intensity function and at the end of a window); a second 'blur' mode supersamples the shutter window with plus-lighter sub-frame copies (after HyperFrames motion-blur, Apache-2.0); demo card, lanes and copy are new. Modified.
import React from 'react';
import {AbsoluteFill, Freeze, interpolate, useCurrentFrame} from 'remotion';
import {Tag} from './_moves-utils';
import {CURVES} from '../../core/easing';
import {BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

export type SmearFramesProps = {
	/** the moving thing: any pure function of useCurrentFrame() (it is re-rendered at other times) */
	children: React.ReactNode;
	/**
	 * 'multiples' = a few countable semi-transparent full copies trailing behind (smear frame, echo);
	 * 'blur' = a dense shutter-integrated blur (sub-frame copies averaged, After-Effects style)
	 */
	mode?: 'multiples' | 'blur';
	/** copies: trailing ghosts (multiples, default 4) or sub-frame samples (blur, default 17) */
	samples?: number;
	/** frames of travel the copies cover: the farthest ghost is this far behind (multiples, default 8) or the blur window is this long, centred on now (blur, default 1) */
	shutter?: number;
	/** multiples: opacity of the nearest ghost */
	opacity?: number;
	/** multiples: each further ghost is this much fainter than the one before */
	falloff?: number;
	/** frame range [from, to] in which the smear is on; outside it only the sharp child is drawn */
	window?: [number, number];
	/** frames at the end of the window over which the copies merge back into the body (needs a finite window end) */
	collapse?: number;
	/**
	 * 0..1 per frame: how much smear there is right now (use your own speed measure, e.g. the adjacent-frame
	 * position difference through smoothstep). Scales the opacity and how far back the copies reach. Default: always 1.
	 */
	intensity?: (frame: number) => number;
	style?: React.CSSProperties;
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Draws countable echoes of a fast move: the child is evaluated again at earlier (or sub-frame) times with
 * <Freeze>, so any animation inside it is smeared with zero extra bookkeeping.
 */
export const SmearFrames: React.FC<SmearFramesProps> = ({
	children,
	mode = 'multiples',
	samples,
	shutter,
	opacity = 0.45,
	falloff = 0.62,
	window: win,
	collapse = 3,
	intensity,
	style,
}) => {
	const frame = useCurrentFrame();
	const [w0, w1] = win ?? [-Infinity, Infinity];
	const inWin = frame >= w0 && frame <= w1;
	const cv = Number.isFinite(w1) && collapse > 0 ? CURVES.expoOut(clamp01((frame - (w1 - collapse)) / collapse)) : 0;
	const k = inWin ? clamp01(intensity ? intensity(frame) : 1) : 0;
	const reach = k * (1 - cv);
	const sharp = (
		<AbsoluteFill key="b" style={{}}>
			{children}
		</AbsoluteFill>
	);

	if (mode === 'multiples') {
		const n = Math.max(1, Math.round(samples ?? 4));
		const span = shutter ?? 8;
		const out: React.ReactNode[] = [];
		if (reach > 0.01) {
			// farthest first, so nearer ghosts sit on top of older ones
			for (let i = n; i >= 1; i--) {
				const o = opacity * Math.pow(falloff, i - 1) * reach;
				if (o < 0.004) {
					continue;
				}
				out.push(
					<Freeze key={`g${i}`} frame={frame - span * (i / n) * reach}>
						<AbsoluteFill style={{opacity: o}}>{children}</AbsoluteFill>
					</Freeze>,
				);
			}
		}
		out.push(sharp);
		return <AbsoluteFill style={style}>{out}</AbsoluteFill>;
	}

	// blur: odd sample count so the middle sample is exactly "now"
	let n = Math.max(3, Math.round(samples ?? 17));
	if (n % 2 === 0) {
		n++;
	}
	const mid = (n - 1) / 2;
	const win2 = (shutter ?? 1) * reach;
	const active = win2 > 0.05;
	const out: React.ReactNode[] = [];
	if (!active) {
		out.push(sharp);
	} else {
		for (let j = 0; j < n; j++) {
			const t = frame + (j / (n - 1) - 0.5) * win2;
			out.push(
				<Freeze key={j === mid ? 'b' : `s${j}`} frame={t}>
					<AbsoluteFill style={{opacity: 1 / n, mixBlendMode: 'plus-lighter'}}>{children}</AbsoluteFill>
				</Freeze>,
			);
		}
	}
	return <AbsoluteFill style={{isolation: 'isolate', ...style}}>{out}</AbsoluteFill>;
};

/* ------------------------------------------------------------------ demo */

const CARD_W = 360;
const CARD_H = 170;
const X_L = 90;
const X_R = 830;
const MOVES: {s: number; from: number; to: number}[] = [
	{s: 2, from: X_L, to: X_R},
	{s: 32, from: X_R, to: X_L},
	{s: 62, from: X_L, to: X_R},
];
const MOVE_FRAMES = 10;
const RECOIL_FRAMES = 5;

/** Card position in 720p units: in-out cubic with a 3 % overshoot, then a recoil. A pure function of the frame. */
const cardX = (f: number, lane: number): number => {
	const lag = lane * 3;
	let x = X_L;
	for (const m of MOVES) {
		const s = m.s + lag;
		if (f < s) {
			break;
		}
		const over = (m.to - m.from) * 0.03;
		if (f < s + MOVE_FRAMES) {
			x = m.from + (m.to - m.from + over) * CURVES.inOutCubic((f - s) / MOVE_FRAMES);
		} else {
			const r = interpolate(f, [s + MOVE_FRAMES, s + MOVE_FRAMES + RECOIL_FRAMES], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
			x = m.to + over * (1 - (1 - Math.pow(1 - r, 3)));
		}
	}
	return x;
};

const smoothstep = (a: number, b: number, x: number): number => {
	const t = clamp01((x - a) / (b - a));
	return t * t * (3 - 2 * t);
};

const speedOf = (f: number, lane: number): number => Math.abs(cardX(f, lane) - cardX(f - 1, lane));

const Card: React.FC<{lane: number; y: number; bg: string; fg: string; num: string; label: string}> = ({lane, y, bg, fg, num, label}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const x = cardX(frame, lane);
	return (
		<AbsoluteFill>
			<div
				style={{
					position: 'absolute',
					left: x * u,
					top: y * u,
					width: CARD_W * u,
					height: CARD_H * u,
					background: bg,
					overflow: 'hidden',
				}}
			>
				<div style={{position: 'absolute', right: 0, top: 0, bottom: 0, width: 54 * u, background: fg, opacity: 0.9}} />
				<div style={{position: 'absolute', right: 70 * u, top: 0, bottom: 0, width: 14 * u, background: fg, opacity: 0.9, transform: 'skewX(-18deg)'}} />
				<div style={{position: 'absolute', left: 22 * u, top: 6 * u, fontFamily: DISPLAY_FONT, fontSize: 118 * u, lineHeight: 1, color: fg, letterSpacing: -2 * u}}>{num}</div>
				<div style={{position: 'absolute', left: 24 * u, bottom: 14 * u, fontFamily: BODY_FONT, fontWeight: 800, fontSize: 20 * u, letterSpacing: 6 * u, color: fg}}>{label}</div>
			</div>
		</AbsoluteFill>
	);
};

const Lane: React.FC<{y: number; label: string}> = ({y, label}) => {
	const u = useUnit();
	return (
		<>
			{[X_L, X_R].map((x) => (
				<div
					key={x}
					style={{position: 'absolute', left: (x - 14) * u, top: (y - 14) * u, width: (CARD_W + 28) * u, height: (CARD_H + 28) * u, border: `${2 * u}px dashed ${DEMO.grey}`, boxSizing: 'border-box'}}
				/>
			))}
			<div style={{position: 'absolute', left: 90 * u, top: (y - 52) * u, fontFamily: BODY_FONT, fontWeight: 800, fontSize: 18 * u, letterSpacing: 6 * u, color: DEMO.paper, opacity: 0.7}}>{label}</div>
		</>
	);
};

const Demo: React.FC = () => (
	<AbsoluteFill style={{background: DEMO.ink}}>
		<Lane y={130} label="MULTIPLES  x4" />
		<Lane y={420} label="SHUTTER BLUR  x17" />
		<SmearFrames mode="multiples" samples={4} shutter={8} intensity={(f) => smoothstep(28, 70, speedOf(f, 0) * 1)}>
			<Card lane={0} y={130} bg={DEMO.red} fg={DEMO.ink} num="07" label="VANGUARD" />
		</SmearFrames>
		<SmearFrames mode="blur" samples={17} shutter={1.1} intensity={(f) => smoothstep(10, 40, speedOf(f, 1))}>
			<Card lane={1} y={420} bg={DEMO.cyan} fg={DEMO.ink} num="12" label="RELAY" />
		</SmearFrames>
		<Tag text="SMEAR FRAMES" />
	</AbsoluteFill>
);

export const smearFramesEntry: LibraryEntry = {
	meta: {
		id: 'smear-frames',
		title: 'Smear frames',
		category: 'camera',
		looks: 'A card whipped across the frame drags four countable ghost copies that merge into it on landing; the lane below uses a dense shutter blur instead.',
		use: 'Whip moves, card slams and fast cuts: give a one-or-two frame move a drawn-by-hand smear instead of a flat jump.',
		exportName: 'SmearFrames',
		durationInFrames: 90,
		source: {
			kind: 'ported',
			name: 'video-shotcraft SmearMultiples',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/smear-multiples/SmearMultiples.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
