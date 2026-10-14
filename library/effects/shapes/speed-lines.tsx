// Ported from Remocn speed-lines (https://github.com/Remocn/remocn/blob/main/registry/remocn/speed-lines/index.tsx), MIT, Copyright (c) 2026 Remocn. Changes: one self-contained component (no exported getters, frames come from the <Sequence>), tapered wedge rays instead of round strokes, on-twos flicker and a hold control added, per-mode defaults, PV demo.
import React from 'react';
import {AbsoluteFill, Sequence, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp, r2, smoothstep} from './_bursts-utils';

export type SpeedLinesMode = 'focus' | 'trail';
export type SpeedLinesPoint = {x: number; y: number};

export type SpeedLinesProps = {
	/** 'focus' = manga impact lines snapping onto a point; 'trail' = a flying element with streaks behind it */
	mode?: SpeedLinesMode;
	/** trail: start and landing point as fractions of the frame (may lie outside 0..1) */
	from?: SpeedLinesPoint;
	to?: SpeedLinesPoint;
	/** focus: the point the lines converge on, fractions of the frame */
	x?: number;
	y?: number;
	/** focus: number of rays (default 40); trail: number of streaks (default 14); max 64 */
	count?: number;
	/** line weight in px at 720p (0.5-12): streak width; focus rays are this wide on average (see taper) */
	weight?: number;
	/** focus: rays never come closer than this (px at 720p, default 170); trail: width of the streak band (default 100) */
	spread?: number;
	/** trail: frames the element takes to reach its target at speed 1 (default 14) */
	duration?: number;
	/** trail: 0-1 overshoot and settle of the landing */
	bounce?: number;
	/** trail: 0-1 how much the element stretches while fast and squashes on landing */
	squash?: number;
	/** trail: px at 720p behind the element's centre where the streaks start (about half its length; default = spread / 2) */
	tail?: number;
	/** trail: streak length as a multiple of the element's per-frame speed (default 1.6) */
	streakLength?: number;
	/** focus: 0 = constant-width lines, 1 = wedges that come to a point at the inner tip (default 1) */
	taper?: number;
	/** focus: 0-1 on-twos wobble of the held rays (length and angle), manga "boil" (default 0.6) */
	flicker?: number;
	/** focus: extra frames the rays stay locked before they retract (at speed 1) */
	hold?: number;
	color?: string;
	seed?: number;
	/** playback rate; 1 = the 30 fps timing of the original (focus 13 frames, trail 31) */
	speed?: number;
	/** trail: the element that flies (centred on the path). Without children a plain disc flies. */
	children?: React.ReactNode;
};

const REFERENCE = 720;
const LANDING = 0.3;
const CARRY = 0.3;
const ECHO = 0.2;
const SOFTEN = 1.2;
const SETTLE = 6;
const STRETCH = Math.log(1.3);
const SQUASH = Math.log(1.25);
const STRETCH_GAIN = 0.007;
const SQUASH_GAIN = 0.018;
const PROBE = 1e-3;
const SPAWN_START = 0.04;
const SPAWN_END = 0.8;
const LIFE = 0.3;
const MIN_LIFE = 3;
const DRAW = 0.4;
const ERASE = 0.35;
const SHUTTER = 1.6;
const DRIFT = 0.15;
const SETBACK = 0.35;
const SLOW = 5;
const FAST = 14;
const GOLDEN = (Math.sqrt(5) - 1) / 2;
const IMPACT = 3;
const RUSH_JITTER = 1;
const RELAX = 0.12;
const RELAX_RATE = 1.5;
const RELEASE = 8;
const RELEASE_JITTER = 1.5;
const RETRACT = 3.5;
const ANGLE_JITTER = 0.6;
const RADIUS_JITTER = 0.6;

type Cfg = {
	mode: SpeedLinesMode;
	width: number;
	height: number;
	fps: number;
	unit: number;
	from: SpeedLinesPoint;
	to: SpeedLinesPoint;
	x: number;
	y: number;
	count: number;
	weight: number;
	spread: number;
	duration: number;
	bounce: number;
	squash: number;
	tail: number;
	shutter: number;
	taper: number;
	flicker: number;
	hold: number;
	seed: number;
	speed: number;
};

const resolve = (p: SpeedLinesProps, width: number, height: number, fps: number): Cfg => {
	const mode: SpeedLinesMode = p.mode === 'trail' ? 'trail' : 'focus';
	const focus = mode === 'focus';
	const x = p.x ?? 0.5;
	const y = p.y ?? 0.5;
	return {
		mode,
		width,
		height,
		fps,
		unit: height / REFERENCE,
		from: p.from ?? {x: -0.25, y: 0.5},
		to: p.to ?? {x, y},
		x,
		y,
		count: Math.round(clamp(p.count ?? (focus ? 40 : 14), 1, 64)),
		weight: clamp(p.weight ?? (focus ? 3.5 : 3), 0.5, 12),
		spread: clamp(p.spread ?? (focus ? 170 : 100), 8, 480),
		duration: clamp(p.duration ?? 14, 4, 120),
		bounce: clamp(p.bounce ?? 0.5, 0, 1),
		squash: clamp(p.squash ?? 0.5, 0, 1),
		tail: Math.max(0, p.tail ?? clamp(p.spread ?? (focus ? 170 : 100), 8, 480) / 2),
		shutter: clamp(p.streakLength ?? SHUTTER, 0.2, 6),
		taper: clamp(p.taper ?? 1, 0, 1),
		flicker: clamp(p.flicker ?? 0.6, 0, 1),
		hold: Math.max(0, p.hold ?? 0),
		seed: p.seed ?? 1,
		speed: Math.max(0, p.speed ?? 1),
	};
};

const key = (seed: number, index: number, name: string) => random(`speed-lines-${seed}-${index}-${name}`);

const timeOf = (frame: number, c: Cfg) => Math.max(0, frame) * (30 / c.fps) * c.speed;

const directionOf = (c: Cfg) => {
	const dx = (c.to.x - c.from.x) * c.width;
	const dy = (c.to.y - c.from.y) * c.height;
	const distance = Math.hypot(dx, dy);
	if (distance < 1e-6) {
		return {dx: 1, dy: 0, distance: 0};
	}
	return {dx: dx / distance, dy: dy / distance, distance};
};

const along = (position: number, size: number, step: number) => {
	if (step > 1e-9) {
		return (size - position) / step;
	}
	if (step < -1e-9) {
		return -position / step;
	}
	return Number.POSITIVE_INFINITY;
};

/** distance from (cx, cy) along (cos, sin) to the edge of the frame */
const exitDistance = (cx: number, cy: number, cos: number, sin: number, width: number, height: number) => {
	const inside = cx >= 0 && cx <= width && cy >= 0 && cy <= height;
	if (!inside) {
		return Math.hypot(Math.max(Math.abs(cx), Math.abs(width - cx)), Math.max(Math.abs(cy), Math.abs(height - cy)));
	}
	return Math.min(along(cx, width, cos), along(cy, height, sin));
};

/** the damped landing spring: accelerates, crosses the target at 45% of its top speed, one echo, settles */
const springOf = (bounce: number) => {
	const landing = LANDING + CARRY * bounce;
	const kappa = (1 + Math.sqrt(1 - landing)) / 2;
	const gain = 1 / (0.5 - kappa / 3);
	const echo = ECHO * bounce;
	const decrement = -Math.log(echo);
	const damping = echo > 0 ? decrement / Math.hypot(Math.PI, decrement) : 1;
	const natural = 1 / (1 + SOFTEN * bounce);
	const decay = damping * natural;
	return {
		kappa,
		gain,
		contact: gain * (1 - kappa),
		decay,
		ring: natural * Math.sqrt(1 - damping * damping),
		settle: Math.ceil(SETTLE / decay),
	};
};

const easeOf = (time: number, travel: number, bounce: number) => {
	if (time <= 0) {
		return 0;
	}
	const {kappa, gain, contact, decay, ring, settle} = springOf(bounce);
	if (time < travel) {
		const w = time / travel;
		return gain * ((w * w) / 2 - (kappa * w * w * w) / 3);
	}
	const since = time - travel;
	if (since >= settle) {
		return 1;
	}
	const taper = smoothstep((2 * since) / settle - 1);
	const wave = ring > 1e-9 ? Math.sin(ring * since) / ring : since;
	const envelope = Math.exp(-decay * since) * (1 - taper);
	return 1 + (contact / travel) * wave * envelope;
};

/**
 * Timing of a mode in 30 fps frames at speed 1. `impact` is the frame the element lands (trail) or the rays lock on
 * (focus): start the effect that many frames early so the snap lands on your beat.
 */
export const getSpeedLinesTimeline = (opts: Pick<SpeedLinesProps, 'mode' | 'duration' | 'bounce' | 'hold'> = {}) => {
	const mode: SpeedLinesMode = opts.mode === 'trail' ? 'trail' : 'focus';
	if (mode === 'focus') {
		return {mode, impact: IMPACT, end: RELEASE + Math.max(0, opts.hold ?? 0) + RELEASE_JITTER + RETRACT};
	}
	const duration = clamp(opts.duration ?? 14, 4, 120);
	return {mode, impact: duration, end: duration + springOf(clamp(opts.bounce ?? 0.5, 0, 1)).settle};
};

const positionAt = (time: number, c: Cfg) => {
	if (c.mode === 'focus') {
		return {x: c.x * c.width, y: c.y * c.height, progress: 1};
	}
	const p = easeOf(time, c.duration, c.bounce);
	const sx = c.from.x * c.width;
	const sy = c.from.y * c.height;
	return {x: sx + (c.to.x * c.width - sx) * p, y: sy + (c.to.y * c.height - sy) * p, progress: p};
};

/** stretch along the path while fast, squash when it lands (area preserving) */
const shapeAt = (time: number, c: Cfg) => {
	if (c.mode === 'focus') {
		return {rotation: 0, along: 1, across: 1};
	}
	const {dx, dy, distance} = directionOf(c);
	const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
	if (c.squash === 0 || distance === 0 || time <= 0) {
		return {rotation, along: 1, across: 1};
	}
	const span = distance / c.unit;
	const ahead = easeOf(time + PROBE, c.duration, c.bounce);
	const behind = easeOf(time - PROBE, c.duration, c.bounce);
	const rate = (Math.abs(ahead - behind) / (2 * PROBE)) * span * c.speed;
	const landed = time > c.duration ? easeOf(time, c.duration, c.bounce) - 1 : 0;
	const past = Math.max(0, landed) * span;
	const stretch = STRETCH * Math.tanh((c.squash * STRETCH_GAIN * rate) / STRETCH);
	const compression = SQUASH * Math.tanh((c.squash * SQUASH_GAIN * past) / SQUASH);
	const strain = clamp(stretch - compression, -SQUASH, STRETCH);
	return {rotation, along: Math.exp(strain), across: Math.exp(-strain)};
};

/** trail streaks: short parallel lines in seeded lanes, length follows the REAL per-frame speed */
const streaksAt = (frame: number, c: Cfg) => {
	const time = timeOf(frame, c);
	const {dx, dy, distance} = directionOf(c);
	if (distance === 0 || time <= 0) {
		return [];
	}
	const now = positionAt(time, c);
	const before = positionAt(timeOf(frame - 1, c), c);
	const forward = ((now.x - before.x) * dx + (now.y - before.y) * dy) * (c.fps / 30);
	const {unit, duration, bounce, weight, seed, count, spread} = c;
	const fast = smoothstep((forward - SLOW * unit) / ((FAST - SLOW) * unit));
	const gate = fast * (1 - smoothstep(time - duration));
	if (gate <= 0) {
		return [];
	}
	const band = spread * unit;
	const phase = random(`speed-lines-${seed}-lanes`);
	const progressNow = time / duration;
	const life = Math.max(MIN_LIFE, LIFE * duration) / duration;
	const minimum = 0.5 * weight * unit;
	const out: {x1: number; y1: number; x2: number; y2: number}[] = [];
	for (let index = 0; index < count; index++) {
		const jitter = (key(seed, index, 'lane') - 0.5) / (2 * count);
		const lane = phase + GOLDEN * index + jitter;
		const offset = band * (lane - Math.floor(lane) - 0.5);
		const spawn = SPAWN_START + (SPAWN_END - SPAWN_START) * ((index + key(seed, index, 'spawn')) / count);
		const factor = 0.5 + 0.5 * key(seed, index, 'length');
		const setback = SETBACK * band * key(seed, index, 'setback');
		const age = (progressNow - spawn) / life;
		if (age <= 0 || age >= 1) {
			continue;
		}
		const reach = c.shutter * factor * forward * gate;
		const easeOutAge = 1 - (1 - clamp(age / DRAW, 0, 1)) * (1 - clamp(age / DRAW, 0, 1));
		const erased = smoothstep((age - ERASE) / (1 - ERASE));
		const length = reach * (easeOutAge - erased);
		if (length < minimum) {
			continue;
		}
		const spawned = easeOf(spawn * duration, duration, bounce);
		const since = Math.max(0, (now.progress - spawned) * distance);
		const base = c.tail * unit + setback + DRIFT * since;
		const front = base + reach * erased;
		const back = base + reach * easeOutAge;
		const laneX = now.x - dy * offset;
		const laneY = now.y + dx * offset;
		out.push({x1: laneX - dx * front, y1: laneY - dy * front, x2: laneX - dx * back, y2: laneY - dy * back});
	}
	return out;
};

/** focus ray radius: rushes in from the frame edge, locks at `rest` on IMPACT, relaxes a touch, retracts at `release` */
const rayRadius = (time: number, rest: number, outer: number, start: number, release: number) => {
	if (time <= start) {
		return outer;
	}
	if (time < IMPACT) {
		const q = (time - start) / (IMPACT - start);
		return outer + (rest - outer) * q * q;
	}
	const settle = (at: number) => rest * (1 + RELAX * (1 - Math.exp(-(at - IMPACT) / RELAX_RATE)));
	if (time < release) {
		return settle(time);
	}
	const held = settle(release);
	const q = clamp((time - release) / RETRACT, 0, 1);
	return outer - (outer - held) * (1 - q * q);
};

const raysAt = (frame: number, c: Cfg) => {
	const time = timeOf(frame, c);
	const end = getSpeedLinesTimeline({mode: 'focus', hold: c.hold}).end;
	if (time <= 0 || time >= end) {
		return '';
	}
	const {seed, count, spread, weight, unit, width, height, taper, flicker} = c;
	const cx = c.x * width;
	const cy = c.y * height;
	const minimum = 0.5 * weight * unit;
	const rotation = random(`speed-lines-${seed}-rotation`);
	const step = Math.floor(time / 2);
	const parts: string[] = [];
	for (let index = 0; index < count; index++) {
		const jitter = ANGLE_JITTER * (key(seed, index, 'angle') - 0.5);
		let angle = 2 * Math.PI * (rotation + (index + jitter) / count);
		const rest = spread * unit * (1 + RADIUS_JITTER * key(seed, index, 'radius'));
		const outerNominal = exitDistance(cx, cy, Math.cos(angle), Math.sin(angle), width, height) + weight * unit * 2;
		const release = RELEASE + c.hold + RELEASE_JITTER * key(seed, index, 'release');
		let inner = rayRadius(time, rest, outerNominal, RUSH_JITTER * key(seed, index, 'rush'), release);
		if (flicker > 0 && time >= IMPACT) {
			// hand-drawn boil: redrawn every other frame while the rays are locked, fades out as they retract
			const live = 1 - clamp((time - release) / RETRACT, 0, 1);
			const nl = key(seed, index, `flick-l-${step}`) - 0.5;
			const na = key(seed, index, `flick-a-${step}`) - 0.5;
			inner = Math.max(4 * unit, inner + nl * flicker * 0.42 * rest * live);
			angle += na * flicker * 0.05 * live;
		}
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const outer = exitDistance(cx, cy, cos, sin, width, height) + weight * unit * 2;
		if (outer - inner < minimum) {
			continue;
		}
		const ix = cx + cos * inner;
		const iy = cy + sin * inner;
		const ox = cx + cos * outer;
		const oy = cy + sin * outer;
		// wedge: `weight` wide at the inner tip x (1 - taper), twice that at the frame edge when fully tapered
		const hin = (weight * unit * (1 - taper)) / 2;
		const hout = (weight * unit * (1 + taper)) / 2;
		const nx = -sin;
		const ny = cos;
		parts.push(
			`M${r2(ix + nx * hin)} ${r2(iy + ny * hin)}L${r2(ox + nx * hout)} ${r2(oy + ny * hout)}L${r2(ox - nx * hout)} ${r2(oy - ny * hout)}L${r2(ix - nx * hin)} ${r2(iy - ny * hin)}Z`,
		);
	}
	return parts.join('');
};

/**
 * Manga speed lines. mode 'focus': rays rush in from the frame edges and lock onto a point 3 frames later, hold
 * (boiling on twos), then retract. mode 'trail': an element flies from -> to on a damped spring (stretching while fast,
 * squashing on landing) with parallel streaks behind it. Starts at frame 0 of its <Sequence>.
 */
export const SpeedLines: React.FC<SpeedLinesProps> = (props) => {
	const frame = useCurrentFrame();
	const {width, height, fps} = useVideoConfig();
	const c = resolve(props, width, height, fps);
	const color = props.color ?? '#ffffff';
	const time = timeOf(frame, c);
	const point = positionAt(time, c);
	const shape = shapeAt(time, c);
	const strokeW = c.weight * c.unit;

	let rays = '';
	let streaks = '';
	if (c.mode === 'focus') {
		rays = raysAt(frame, c);
	} else {
		streaks = streaksAt(frame, c)
			.map((s) => `M${r2(s.x1)} ${r2(s.y1)}L${r2(s.x2)} ${r2(s.y2)}`)
			.join('');
	}
	const rotation = r2(shape.rotation);
	const hasChildren = props.children !== undefined && props.children !== null;

	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<svg
				width="100%"
				height="100%"
				viewBox={`0 0 ${width} ${height}`}
				aria-hidden="true"
				style={{position: 'absolute', inset: 0, display: 'block'}}
			>
				{rays ? <path d={rays} fill={color} /> : null}
				{streaks ? <path d={streaks} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" /> : null}
				{c.mode === 'trail' && !hasChildren ? (
					<ellipse
						cx={point.x}
						cy={point.y}
						rx={(c.spread * c.unit * 0.5) * shape.along}
						ry={(c.spread * c.unit * 0.5) * shape.across}
						transform={`rotate(${rotation} ${point.x} ${point.y})`}
						fill={color}
					/>
				) : null}
			</svg>
			{c.mode === 'trail' && hasChildren ? (
				<div
					style={{
						position: 'absolute',
						left: `${(point.x / width) * 100}%`,
						top: `${(point.y / height) * 100}%`,
						width: 'max-content',
						transform:
							shape.along === 1
								? 'translate(-50%, -50%)'
								: `translate(-50%, -50%) rotate(${rotation}deg) scale(${r2(shape.along)}, ${r2(shape.across)}) rotate(${-rotation}deg)`,
						transformOrigin: '50% 50%',
					}}
				>
					{props.children}
				</div>
			) : null}
		</AbsoluteFill>
	);
};

const Dart: React.FC<{scale?: number}> = ({scale = 1}) => {
	const u = useUnit();
	return (
		<div
			style={{
				width: 270 * u,
				height: 110 * u,
				background: DEMO.yellow,
				clipPath: 'polygon(0 0, 82% 0, 100% 50%, 82% 100%, 0 100%)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				paddingRight: 34 * u,
				fontFamily: DISPLAY_FONT,
				fontSize: 72 * u,
				letterSpacing: 5 * u,
				color: DEMO.ink,
				transform: `scale(${scale})`,
			}}
		>
			DASH
		</div>
	);
};

/** a locked-on hit: the dart punches when the rays lock (frame ~5 at speed 0.62) */
const FocusHit: React.FC<{seed: number; count: number; taper: number; color: string}> = ({seed, count, taper, color}) => {
	const frame = useCurrentFrame();
	const s = 1 + 0.2 * (1 - progress(frame, 5, 8, CURVES.expoOut)) * (frame >= 5 ? 1 : 0);
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
			<SpeedLines mode="focus" x={0.5} y={0.5} color={color} speed={0.62} hold={3} seed={seed} count={count} taper={taper} />
			<Dart scale={s} />
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<Backdrop color={DEMO.blue}>
		<Sequence from={-2} durationInFrames={46}>
			<SpeedLines
				mode="trail"
				from={{x: -0.06, y: 0.74}}
				to={{x: 0.5, y: 0.5}}
				color={DEMO.paper}
				speed={0.7}
				seed={3}
				count={22}
				spread={150}
				tail={125}
				weight={4}
				streakLength={2.8}
			>
				<Dart />
			</SpeedLines>
		</Sequence>
		<Sequence from={44} durationInFrames={24}>
			<FocusHit seed={4} count={40} taper={1} color={DEMO.paper} />
		</Sequence>
		<Sequence from={68}>
			<FocusHit seed={9} count={56} taper={0.6} color={DEMO.ink} />
		</Sequence>
	</Backdrop>
);

export const speedLinesEntry: LibraryEntry = {
	meta: {
		id: 'speed-lines',
		title: 'Speed lines',
		category: 'shapes',
		looks: 'Focus: tapered rays rush in from the edges and snap onto a point in 3 frames, hold boiling, retract. Trail: a stretching element lands on a damped spring with streaks behind it.',
		use: 'Impact frames and reveals (start the focus 3 frames early so the snap lands on the beat); a fast fly-in with a hard landing.',
		exportName: 'SpeedLines',
		durationInFrames: 96,
		source: {
			kind: 'ported',
			name: 'Remocn speed-lines',
			url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/speed-lines/index.tsx',
			license: 'MIT',
		},
	},
	Demo,
};
