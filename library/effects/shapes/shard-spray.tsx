import React, {useMemo} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop, DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {lerp, r2, rngOf, smoothstep} from './_bursts-utils';

export type ShardSprayProps = {
	/** origin as fractions of the frame */
	x?: number;
	y?: number;
	/** number of shards (a share of them are long thin streaks) */
	count?: number;
	/** centre direction in degrees (screen: 0 = right, 90 = down, -90 = up) */
	angle?: number;
	/** width of the fan in degrees; 360 throws shards all around */
	spread?: number;
	/** [min, max] px at 720p each shard is flung before it stops (gravity keeps pulling) */
	distance?: [number, number];
	/** [min, max] px at 720p, the shard's base size */
	size?: [number, number];
	/** [min, max] how much longer than wide a shard is */
	stretch?: [number, number];
	/** px per frame squared at 720p */
	gravity?: number;
	/** max degrees per frame a shard spins */
	spin?: number;
	/** frames a shard lives (each varies by up to 25 %) */
	frames?: number;
	/** hold each pose for this many frames (2 = on twos, the cut-out look) */
	stepEvery?: number;
	colors?: string[];
	/** colour of the shaded half of every shard */
	shadeColor?: string;
	/** 0-1 how dark that half is */
	shade?: number;
	/** share of the shards that are long thin streaks */
	streaks?: number;
	seed?: number;
};

type Shard = {
	dir: number;
	dist: number;
	size: number;
	stretch: number;
	spin: number;
	rot0: number;
	flip0: number;
	flipRate: number;
	color: number;
	life: number;
	streak: boolean;
};

const makeShards = (
	count: number,
	angle: number,
	spread: number,
	distance: [number, number],
	size: [number, number],
	stretch: [number, number],
	spin: number,
	streaks: number,
	colorCount: number,
	seed: number,
): Shard[] => {
	const r = rngOf(`shard-${seed}`);
	return Array.from({length: count}, () => {
		const dir = ((angle + (r() - 0.5) * spread) * Math.PI) / 180;
		const d = lerp(distance[0], distance[1], Math.pow(r(), 0.8));
		const sz = lerp(size[0], size[1], r());
		const st = lerp(stretch[0], stretch[1], r());
		const sp = (r() - 0.5) * 2 * spin;
		const rot0 = (dir * 180) / Math.PI + (r() - 0.5) * 50;
		const flip0 = r() * Math.PI * 2;
		const flipRate = 0.18 + r() * 0.45;
		const color = Math.floor(r() * colorCount);
		const lifeK = 0.75 + 0.25 * r();
		const streak = r() < streaks;
		return streak
			? {dir, dist: d * 1.25, size: lerp(2, 4, r()), stretch: lerp(9, 14, r()), spin: 0, rot0: (dir * 180) / Math.PI, flip0: 0, flipRate: 0, color, life: lifeK * 0.55, streak}
			: {dir, dist: d, size: sz, stretch: st, spin: sp, rot0, flip0, flipRate, color, life: lifeK, streak};
	});
};

/**
 * Sharp triangle shards flung from a point: expo-like fling along a seeded fan, a spin and a flip per shard, gravity,
 * a lit and a shaded half, shrinking and fading out. Pure function of the frame. Starts at frame 0 of its <Sequence>.
 */
export const ShardSpray: React.FC<ShardSprayProps> = ({
	x = 0.5,
	y = 0.5,
	count = 34,
	angle = -45,
	spread = 70,
	distance = [180, 640],
	size = [15, 38],
	stretch = [1.3, 2.8],
	gravity = 0.5,
	spin = 16,
	frames = 40,
	stepEvery = 1,
	colors = ['#f4f1ea', '#ffd23f', '#ff3b2e'],
	shadeColor = '#0b0b10',
	shade = 0.3,
	streaks = 0.12,
	seed = 1,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	const palette = colors.length > 0 ? colors : ['#ffffff'];
	const shards = useMemo(
		() => makeShards(Math.max(1, Math.round(count)), angle, spread, distance, size, stretch, spin, streaks, palette.length, seed),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[count, angle, spread, distance[0], distance[1], size[0], size[1], stretch[0], stretch[1], spin, streaks, palette.length, seed],
	);
	const t = Math.floor(Math.max(0, frame) / Math.max(1, stepEvery)) * Math.max(1, stepEvery);
	const ox = x * width;
	const oy = y * height;

	const els: React.ReactNode[] = [];
	shards.forEach((s, i) => {
		const life = frames * s.life;
		const p = t / life;
		if (p >= 1) {
			return;
		}
		// fling: fast out, brakes hard (quartic-out); gravity keeps pulling after it stops
		const fling = 1 - Math.pow(1 - p, 4);
		const px = ox + Math.cos(s.dir) * s.dist * u * fling;
		const py = oy + Math.sin(s.dir) * s.dist * u * fling + 0.5 * gravity * u * t * t;
		const rot = s.rot0 + s.spin * t;
		const flip = s.streak ? 1 : Math.max(0.2, Math.abs(Math.cos(s.flip0 + s.flipRate * t)));
		// shards shrink to a point instead of fading (flat colours stay saturated), a short fade only at the very end
		const k = s.size * u * (1 - smoothstep((p - 0.45) / 0.55));
		const fade = 1 - smoothstep((p - 0.88) / 0.12);
		const L = s.stretch;
		// sharp triangle: long tip, two back corners; the half toward the second corner is the shaded one
		const P0 = [L, 0];
		const P1 = [-0.74, 0.68];
		const P2 = [-0.4, -0.57];
		const M = [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2];
		const f = (p2: number[]) => `${r2(p2[0])},${r2(p2[1])}`;
		els.push(
			<g key={i} transform={`translate(${r2(px)} ${r2(py)}) rotate(${r2(rot)}) scale(${r2(k)} ${r2(k * flip)})`} opacity={r2(fade)}>
				<polygon points={`${f(P0)} ${f(P1)} ${f(M)}`} fill={palette[s.color % palette.length]} />
				<polygon points={`${f(P0)} ${f(M)} ${f(P2)}`} fill={palette[s.color % palette.length]} />
				<polygon points={`${f(P0)} ${f(M)} ${f(P2)}`} fill={shadeColor} opacity={shade} />
			</g>,
		);
	});

	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{display: 'block'}}>
				{els}
			</svg>
		</AbsoluteFill>
	);
};

/** demo only: a 4-frame spiked flash on the hit point */
const Flash: React.FC<{x: number; y: number; color: string; r?: number}> = ({x, y, color, r = 64}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	if (frame < 0 || frame >= 4) {
		return null;
	}
	const k = 1 - frame / 4;
	const pts = Array.from({length: 20}, (_, i) => {
		const a = (i / 20) * Math.PI * 2 + 0.2;
		const rr = (i % 2 ? 0.34 : 1) * r * u * k;
		return `${r2(x * width + Math.cos(a) * rr)},${r2(y * height + Math.sin(a) * rr)}`;
	}).join(' ');
	return (
		<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', inset: 0}}>
			<polygon points={pts} fill={color} />
		</svg>
	);
};

const Demo: React.FC = () => (
	<Backdrop color={DEMO.blue}>
		<AbsoluteFill style={{backgroundImage: `radial-gradient(${DEMO.ink} 3px, transparent 3.5px)`, backgroundSize: '28px 28px', opacity: 0.16}} />
		<Sequence from={-3}>
			<Flash x={0.18} y={0.74} color={DEMO.paper} />
			<ShardSpray x={0.18} y={0.74} angle={-42} spread={64} count={30} seed={2} />
		</Sequence>
		<Sequence from={24}>
			<Flash x={0.5} y={0.45} color={DEMO.yellow} r={90} />
			<ShardSpray
				x={0.5}
				y={0.45}
				angle={0}
				spread={360}
				count={46}
				distance={[150, 560]}
				size={[12, 34]}
				colors={[DEMO.paper, DEMO.cyan, DEMO.yellow]}
				stepEvery={2}
				seed={5}
				gravity={0.35}
			/>
		</Sequence>
		<Sequence from={48}>
			<Flash x={0.86} y={0.18} color={DEMO.paper} />
			<ShardSpray x={0.86} y={0.18} angle={140} spread={56} count={26} colors={[DEMO.paper, DEMO.red, DEMO.ink]} seed={9} />
		</Sequence>
		<Sequence from={66}>
			<Flash x={0.5} y={0.96} color={DEMO.yellow} r={80} />
			<ShardSpray x={0.5} y={0.96} angle={-90} spread={110} count={36} distance={[200, 560]} colors={[DEMO.yellow, DEMO.paper, DEMO.red]} seed={13} />
		</Sequence>
	</Backdrop>
);

export const shardSprayEntry: LibraryEntry = {
	meta: {
		id: 'shard-spray',
		title: 'Shard spray',
		category: 'shapes',
		looks: 'Sharp two-tone triangle shards are flung from a point along a seeded fan, braking hard, spinning and flipping, falling under gravity and shrinking out; a few long streaks lead.',
		use: 'Glass breaks, hit debris, screen-shatter accents; on twos for a cut-out look.',
		exportName: 'ShardSpray',
		durationInFrames: 90,
		source: {kind: 'original'},
	},
	Demo,
};
