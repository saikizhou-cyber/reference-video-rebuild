// Ported from Remocn trim-burst (https://github.com/Remocn/remocn/blob/main/registry/remocn/trim-burst/index.tsx), MIT, Copyright (c) 2026 Remocn. Changes: one self-contained component (frames come from the <Sequence>, no exported getters), per-stroke colours, 720p-unit defaults retuned bigger for PV use, dots on by default, PV demo.
import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, Sequence, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop, DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp} from './_bursts-utils';

export type TrimBurstProps = {
	/** origin as fractions of the frame (default centre) */
	x?: number;
	y?: number;
	/** number of strokes, 1-32 */
	count?: number;
	/** px at 720p from the origin where the strokes start */
	innerRadius?: number;
	/** px at 720p the strokes travel before they vanish */
	reach?: number;
	/** px at 720p, longest a stroke gets while flying */
	strokeLength?: number;
	/** stroke weight, px at 720p */
	weight?: number;
	/** degrees, 0 = first stroke points up */
	rotation?: number;
	/** 360 = full ring; less fans the strokes over that many degrees */
	spread?: number;
	/** 0-1 seeded wobble of angle, length and launch time */
	jitter?: number;
	/** a dot pops just ahead of each stroke */
	dots?: boolean;
	cap?: 'round' | 'butt';
	color?: string;
	/** per-stroke colours, cycled; overrides `color` */
	colors?: string[];
	seed?: number;
	/** playback rate; 1 = the 30 fps timing of the original (about 15 frames + stagger) */
	speed?: number;
};

const LIFE = 15;
const LAG = 3;
const STAGGER = 6;
const LEASH = 6;
const WOBBLE = 0.25;
const MAX_STEP = 45;
const SHRINK = 0.45;
const DOT_START = 4;
const DOT_POP = 4;
const DOT_BACK = 1.4;
const DOT_RADIUS = 1.25;
const DOT_GAP = 2;
const VISIBLE = 0.001;
/** the outer end launches on a fast ease-out and brakes hard, the inner end waits LAG frames and chases smoothly */
const END_EASE = Easing.bezier(0.16, 1, 0.3, 1);
const START_EASE = Easing.bezier(0.45, 0, 0.55, 1);

/** Length of the burst in 30 fps frames at speed 1 (use it to size the <Sequence>). */
export const trimBurstLength = (count = 10, jitter = 0.5): number => LIFE + (count > 1 ? STAGGER * jitter : 0);

const endProgress = (time: number) => (time <= 0 ? 0 : time >= LIFE ? 1 : END_EASE(time / LIFE));
const startProgress = (time: number) => (time <= LAG ? 0 : time >= LIFE ? 1 : START_EASE((time - LAG) / (LIFE - LAG)));

/** keeps the stroke from ever being longer than `strokeLength` while the two ends are far apart */
const leash = (gap: number, strokeLength: number) => (gap > 0 && strokeLength > 0 ? gap / (1 + (gap / strokeLength) ** LEASH) ** (1 / LEASH) : 0);

const trimOf = (time: number, reach: number, strokeLength: number) => {
	const end = reach * endProgress(time);
	const own = reach * startProgress(time);
	const length = leash(end - own, strokeLength);
	return {start: end - length, end, length};
};

const dotScale = (time: number) => {
	if (time <= DOT_START || time >= LIFE) {
		return 0;
	}
	const pop = Math.min(1, (time - DOT_START) / DOT_POP) - 1;
	const grow = 1 + (DOT_BACK + 1) * pop ** 3 + DOT_BACK * pop ** 2;
	const settle = DOT_START + DOT_POP;
	const shrink = clamp((time - settle) / (LIFE - settle), 0, 1);
	return grow * (1 - shrink ** 3);
};

type Stroke = {index: number; angle: number; scale: number; launch: number};

const makeStrokes = (count: number, rotation: number, spread: number, jitter: number, seed: number): Stroke[] => {
	const fan = spread < 360 && count > 1;
	const step = fan ? spread / (count - 1) : 360 / count;
	const first = fan ? rotation - spread / 2 : rotation;
	const wobble = WOBBLE * jitter * Math.min(step, MAX_STEP);
	const stagger = count > 1 ? STAGGER * jitter : 0;
	const keys = Array.from({length: count}, (_, i) => random(`trim-burst-${seed}-order-${i}`));
	const order = keys.map((_, i) => i).sort((a, b) => keys[a] - keys[b]);
	const ranks: number[] = [];
	order.forEach((index, position) => {
		ranks[index] = position;
	});
	return keys.map((_, index) => {
		const turn = random(`trim-burst-${seed}-angle-${index}`) * 2 - 1;
		const shrink = random(`trim-burst-${seed}-scale-${index}`);
		return {
			index,
			angle: first + index * step + turn * wobble,
			scale: 1 - SHRINK * jitter * shrink,
			launch: count > 1 ? (stagger * ranks[index]) / (count - 1) : 0,
		};
	});
};

/**
 * After Effects trim-path starburst: a ring of short strokes shoots out of a point. The outer end launches on a fast
 * ease-out, the inner end waits ~3 frames and chases, so each stroke grows, travels and shrinks to nothing at `reach`.
 * Starts at frame 0 of its <Sequence>.
 */
export const TrimBurst: React.FC<TrimBurstProps> = ({
	x = 0.5,
	y = 0.5,
	count: countIn = 10,
	innerRadius = 28,
	reach = 150,
	strokeLength = 100,
	weight = 4,
	rotation = 0,
	spread = 360,
	jitter = 0.5,
	dots = true,
	cap = 'round',
	color = '#ffffff',
	colors,
	seed = 1,
	speed = 1,
}) => {
	const frame = useCurrentFrame();
	const {width, height, fps} = useVideoConfig();
	const u = useUnit();
	const count = Math.round(clamp(countIn, 1, 32));
	const jit = clamp(jitter, 0, 1);
	const strokes = useMemo(
		() => makeStrokes(count, rotation, clamp(spread, 0, 360), jit, seed),
		[count, rotation, spread, jit, seed],
	);
	const time = Math.max(0, frame) * (30 / fps) * Math.max(0, speed);
	const ox = x * width;
	const oy = y * height;
	const offset = Math.max(0, innerRadius) * u;
	const w = clamp(weight, 0.25, 40) * u;
	const gap = DOT_GAP * w;
	const dotR = DOT_RADIUS * w;

	const lines: React.ReactNode[] = [];
	const circles: React.ReactNode[] = [];
	for (const s of strokes) {
		const local = time - s.launch;
		const trim = trimOf(local, Math.max(0, reach) * u * s.scale, Math.max(1, strokeLength) * u * s.scale);
		const a = (s.angle * Math.PI) / 180;
		const dx = Math.sin(a);
		const dy = -Math.cos(a);
		const at = (d: number) => [ox + dx * (offset + d), oy + dy * (offset + d)] as const;
		const fill = colors && colors.length > 0 ? colors[s.index % colors.length] : color;
		if (trim.length > VISIBLE) {
			const [x1, y1] = at(trim.start);
			const [x2, y2] = at(trim.end);
			lines.push(
				<line
					key={`l${s.index}`}
					x1={x1}
					y1={y1}
					x2={x2}
					y2={y2}
					stroke={fill}
					strokeWidth={Math.min(w, trim.length)}
					strokeLinecap={cap}
				/>,
			);
		}
		const pop = dots ? dotScale(local) : 0;
		if (pop > 0) {
			const [cx, cy] = at(trim.end + gap + dotR);
			circles.push(<circle key={`d${s.index}`} cx={cx} cy={cy} r={dotR * pop} fill={fill} />);
		}
	}
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{display: 'block', overflow: 'visible'}}>
				{lines}
				{circles}
			</svg>
		</AbsoluteFill>
	);
};

/** demo only: a disc that pops at the burst origin and is gone in 5 frames */
const Core: React.FC<{x: number; y: number; r: number; color: string}> = ({x, y, r, color}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	if (frame >= 5) {
		return null;
	}
	const k = 1 - frame / 5;
	return (
		<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', inset: 0}}>
			<circle cx={x * width} cy={y * height} r={r * u * (0.4 + 0.6 * k)} fill={color} />
		</svg>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		<Sequence from={-6} durationInFrames={26}>
			<TrimBurst x={0.27} y={0.52} color={DEMO.paper} count={10} reach={170} strokeLength={110} weight={5} seed={2} />
		</Sequence>
		<Sequence from={10} durationInFrames={26}>
			<Core x={0.74} y={0.4} r={30} color={DEMO.yellow} />
			<TrimBurst x={0.74} y={0.4} color={DEMO.yellow} count={12} rotation={15} reach={190} strokeLength={120} weight={5} seed={5} />
		</Sequence>
		<Sequence from={24} durationInFrames={26}>
			<Core x={0.45} y={0.7} r={30} color={DEMO.cyan} />
			<TrimBurst x={0.45} y={0.7} colors={[DEMO.cyan, DEMO.red]} count={14} reach={200} strokeLength={130} weight={5} seed={8} />
		</Sequence>
		<Sequence from={40}>
			<Core x={0.5} y={0.42} r={60} color={DEMO.paper} />
			<TrimBurst
				x={0.5}
				y={0.42}
				colors={[DEMO.paper, DEMO.red, DEMO.yellow]}
				count={28}
				innerRadius={50}
				reach={330}
				strokeLength={260}
				weight={7}
				jitter={0.7}
				seed={11}
				speed={0.85}
			/>
		</Sequence>
	</Backdrop>
);

export const trimBurstEntry: LibraryEntry = {
	meta: {
		id: 'trim-burst',
		title: 'Trim burst',
		category: 'shapes',
		looks: 'A ring of short strokes shoots out of a point, grows, travels and shrinks to nothing at its reach (outer end launches fast, inner end chases), dots popping ahead.',
		use: 'Pick-up / hit sparks, button pops, a small accent when a number or icon lands.',
		exportName: 'TrimBurst',
		durationInFrames: 66,
		source: {
			kind: 'ported',
			name: 'Remocn trim-burst',
			url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/trim-burst/index.tsx',
			license: 'MIT',
		},
	},
	Demo,
};
