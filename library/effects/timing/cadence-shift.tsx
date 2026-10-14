// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/sakuga-timing-shift/SakugaTimingShift.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: the quantised clock becomes a wrapper that remaps every animated value inside it (Freeze), cadence as hold-N or film fps with phase (pulldown maths generalised from the author's own stepped-cadence helper), explicit holds list, a switch frame in either direction, rebuilt 720p demo. Modified.
import React from 'react';
import {AbsoluteFill, Easing, Freeze, interpolate, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

/**
 * How often the picture is allowed to change: a number holds every pose for that many frames ("3" = on threes),
 * `{fps}` samples a slower film rate against the comp's frame rate (24 fps on a 30 fps comp = 3:2 pulldown, every
 * 5th frame repeats) with a `phase` in frames.
 */
export type Cadence = number | {fps: number; phase?: number};

export type CadenceShiftProps = {
	children?: React.ReactNode;
	/** cadence until `switchAt` */
	on?: Cadence;
	/** cadence from `switchAt` on. 3 -> 1 is the sakuga sprint; swap them to go smooth -> choppy */
	then?: Cadence;
	/** frame at which the cadence changes */
	switchAt?: number;
	/** extra frames (of the wrapper's clock) that repeat the frame before them, for an irregular, hand-timed cadence */
	holds?: number[];
};

/** The frame whose content is on screen at `frame` under a cadence (and optional extra holds). Pure maths. */
export const heldFrame = (frame: number, cadence: Cadence, fps: number, holds?: readonly number[]): number => {
	let held = frame;
	if (typeof cadence === 'number') {
		const every = Math.max(1, Math.round(cadence));
		held = Math.floor(frame / every) * every;
	} else {
		const phase = cadence.phase ?? 0;
		const k = Math.floor(((frame - phase) * cadence.fps) / fps + 1e-6);
		held = Math.round((k * fps) / cadence.fps + phase);
		held = Math.min(frame, Math.max(0, held));
	}
	while (holds && held > 0 && holds.includes(held)) {
		held--;
	}
	return held;
};

/**
 * Hook form of the cadence: `held` is the frame to drive EVERY animated value from (brightness flicker, grain seed,
 * noise time, camera), so a held frame is a pixel-exact repeat instead of grain "boiling" on the duplicate.
 */
export const useCadence = ({on = 3, then = 1, switchAt = 48, holds}: Omit<CadenceShiftProps, 'children'> = {}): {frame: number; held: number} => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return {frame, held: heldFrame(frame, frame < switchAt ? on : then, fps, holds)};
};

/**
 * Sakuga timing: everything inside is animated "on threes" (a new pose every 3 frames), then switches to "on ones"
 * at `switchAt`, where the same animation suddenly runs silky. The children's whole clock is remapped, so every
 * interpolate, spring and nested Sequence steps together. Anything that should stay smooth goes outside.
 */
export const CadenceShift: React.FC<CadenceShiftProps> = ({children, on = 3, then = 1, switchAt = 48, holds}) => {
	const {held} = useCadence({on, then, switchAt, holds});
	return (
		<AbsoluteFill>
			<Freeze frame={held}>{children}</Freeze>
		</AbsoluteFill>
	);
};

// ---- demo ----------------------------------------------------------------------------------------------------

const SWITCH = 48;
const ARRIVE = 70;
const SETTLE = 75;
const X_START = 70;
const X_FAR = 880;
const X_REST = 500;
const OVERSHOOT = 26;
const CARD_W = 280;
const CARD_H = 190;

const pos = (f: number): number =>
	f < SWITCH
		? interpolate(f, [0, SWITCH], [X_START, X_FAR], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
		: interpolate(f, [SWITCH, ARRIVE, SETTLE], [X_FAR, X_REST - OVERSHOOT, X_REST], {
				easing: Easing.out(Easing.poly(4)),
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			});

const Runner: React.FC<{x: number; u: number; opacity?: number; rot?: number; sx?: number; sy?: number}> = ({x, u, opacity = 1, rot = 0, sx = 1, sy = 1}) => (
	<div
		style={{
			position: 'absolute',
			left: x * u,
			top: (360 - CARD_H / 2) * u,
			width: CARD_W * u,
			height: CARD_H * u,
			background: DEMO.yellow,
			opacity,
			transform: `rotate(${rot}deg) scale(${sx}, ${sy})`,
			overflow: 'hidden',
		}}
	>
		<div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 26 * u, background: DEMO.ink}} />
		<div style={{position: 'absolute', left: 58 * u, top: 0, bottom: 0, width: 14 * u, background: DEMO.ink, transform: 'skewX(-18deg)', transformOrigin: 'top'}} />
		<div style={{position: 'absolute', right: 26 * u, top: 18 * u, fontFamily: DISPLAY_FONT, fontSize: 118 * u, lineHeight: 1, color: DEMO.ink}}>07</div>
		<div style={{position: 'absolute', right: 26 * u, bottom: 18 * u, fontFamily: BODY_FONT, fontWeight: 800, fontSize: 18 * u, letterSpacing: 6 * u, color: DEMO.ink}}>RUNNER</div>
	</div>
);

/** Demo footage: a card crosses the screen in steps, then sprints back with stretch and afterimages. Reads the (remapped) frame. */
const Sprint: React.FC = () => {
	const f = useCurrentFrame();
	const u = useUnit();
	const stepped = f < SWITCH;
	const x = pos(f);
	const rot = stepped ? Math.sin(f * 0.7) * 5 : interpolate(f, [SWITCH, SWITCH + 8], [Math.sin(SWITCH * 0.7) * 5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const v = stepped ? 0 : Math.abs(pos(f) - pos(f - 1));
	const s = Math.min(v / 40, 1);
	const sqX = interpolate(f, [SETTLE - 3, SETTLE, SETTLE + 3], [1, 0.9, 1], {easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const sqY = interpolate(f, [SETTLE - 3, SETTLE, SETTLE + 3], [1, 1.07, 1], {easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const ghosts = !stepped && f > SWITCH + 1 && f < ARRIVE + 2 && s > 0.15 ? [{x: pos(f - 2), o: 0.3 * s}, {x: pos(f - 4), o: 0.14 * s}] : [];
	return (
		<AbsoluteFill style={{background: DEMO.ink, overflow: 'hidden'}}>
			<AbsoluteFill style={{opacity: 0.08, backgroundImage: `repeating-linear-gradient(-30deg, #ffffff 0 ${4 * u}px, transparent ${4 * u}px ${44 * u}px)`}} />
			<div style={{position: 'absolute', left: 60 * u, right: 60 * u, top: (360 + CARD_H / 2 + 28) * u, height: 4 * u, background: DEMO.grey}} />
			<div style={{position: 'absolute', left: X_REST * u, top: (360 - CARD_H / 2) * u, width: CARD_W * u, height: CARD_H * u, border: `${4 * u}px dashed ${DEMO.grey}`, boxSizing: 'border-box'}} />
			{ghosts.map((g, i) => (
				<Runner key={i} x={g.x} u={u} opacity={g.o} />
			))}
			<Runner x={x} u={u} rot={rot} sx={(1 + 0.3 * s) * sqX} sy={(1 - 0.1 * s) * sqY} />
		</AbsoluteFill>
	);
};

/** The label rides the real clock: it flips with a pop and keeps boiling its outline on twos. */
const Label: React.FC = () => {
	const f = useCurrentFrame();
	const u = useUnit();
	const q = Math.min(Math.floor(f / 4) * 4, 100);
	const bx = (random(`boil-x-${q}`) - 0.5) * 6;
	const by = (random(`boil-y-${q}`) - 0.5) * 6;
	const br = (random(`boil-r-${q}`) - 0.5) * 3;
	const pop = interpolate(f, [SWITCH, SWITCH + 3, SWITCH + 9], [1, 1.3, 1], {easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	return (
		<div
			style={{
				position: 'absolute',
				left: 70 * u,
				top: 70 * u,
				transform: `translate(${bx * u}px, ${by * u}px) rotate(${br}deg) scale(${pop})`,
				transformOrigin: '0% 50%',
				fontFamily: BODY_FONT,
				fontWeight: 800,
				fontSize: 64 * u,
				letterSpacing: 4 * u,
				color: DEMO.paper,
				borderBottom: `${6 * u}px solid ${f < SWITCH ? DEMO.paper : DEMO.yellow}`,
				paddingBottom: 6 * u,
			}}
		>
			{f < SWITCH ? 'ON 3s' : 'ON 1s'}
		</div>
	);
};

const Demo: React.FC = () => (
	<AbsoluteFill>
		<CadenceShift on={3} then={1} switchAt={SWITCH}>
			<Sprint />
		</CadenceShift>
		<Label />
	</AbsoluteFill>
);

export const cadenceShiftEntry: LibraryEntry = {
	meta: {
		id: 'cadence-shift',
		title: 'Cadence shift',
		category: 'timing',
		looks: 'A card crosses the screen in chunky 10 fps steps (on threes), then at frame 48 the same animation runs on ones: a silky sprint with stretch, afterimages, overshoot and settle.',
		use: 'Sakuga-style hits in an anime PV: choppy hand-drawn timing that breaks into smooth motion on the key moment; or film pulldown (fps) for retro footage.',
		exportName: 'CadenceShift',
		durationInFrames: 90,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (Sakuga Timing Shift)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/sakuga-timing-shift/SakugaTimingShift.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
