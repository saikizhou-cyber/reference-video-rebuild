import React from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES} from '../../core/easing';
import {DEMO, Plate, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp} from './_bursts-utils';

export type ShockwaveRingsProps = {
	/** centre as fractions of the frame; may lie outside 0..1 for a hit off the edge */
	x?: number;
	y?: number;
	/** number of rings, 1-3 (each one smaller and thinner than the last) */
	count?: number;
	/** frames between rings */
	stagger?: number;
	/** px at 720p, the outer radius the first ring settles at */
	radius?: number;
	/** px at 720p, stroke width of a ring when it pops */
	thickness?: number;
	/** px at 720p, stroke width of the hairline it thins down to */
	hairline?: number;
	/** frames a ring lives (radius follows expo-out, so most of the travel happens in the first third) */
	frames?: number;
	color?: string;
	/** per-ring colours (ring 0 first); overrides `color` */
	colors?: string[];
	/** opacity the rings settle to as hairlines before they vanish */
	hairlineOpacity?: number;
	/** frames (from the second one) during which a pale copy of the previous frame trails the ring */
	echo?: number;
	/** hold each pose for this many frames (2 = on twos) */
	step?: number;
	/** colour of a disc that flashes at the centre for 3 frames (null = none) */
	flash?: string | null;
};

type Ring = {inner: number; outer: number};

/** radius and thickness of one ring `t` frames after it fired; null when it is not alive */
const ringAt = (t: number, frames: number, radius: number, thick: number, hair: number): (Ring & {p: number}) | null => {
	if (t < 0 || t >= frames) {
		return null;
	}
	const p = t / frames;
	const outer = radius * CURVES.expoOut(p);
	const w = hair + (thick - hair) * Math.pow(1 - p, 3);
	return {inner: Math.max(0, outer - w), outer, p};
};

/**
 * Shockwave rings for a hit: a ring pops thick from a point (radius on expo-out), thins to a hairline as it
 * expands and fades; up to three rings staggered, a one-frame pale echo and an optional centre flash.
 * Everything is a stroked circle, so edges stay crisp at any radius. Starts at frame 0 of its <Sequence>.
 */
export const ShockwaveRings: React.FC<ShockwaveRingsProps> = ({
	x = 0.5,
	y = 0.5,
	count = 3,
	stagger = 4,
	radius = 560,
	thickness = 64,
	hairline = 1.5,
	frames = 20,
	color = '#ffffff',
	colors,
	hairlineOpacity = 0.55,
	echo = 2,
	step = 1,
	flash = null,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	const cx = x * width;
	const cy = y * height;
	const held = Math.floor(Math.max(0, frame) / Math.max(1, step)) * Math.max(1, step);
	const n = Math.round(clamp(count, 1, 3));
	const els: React.ReactNode[] = [];

	for (let i = 0; i < n; i++) {
		const R = radius * u * (1 - 0.24 * i);
		const thick = thickness * u * (1 - 0.32 * i);
		const hair = hairline * u;
		const fill = colors && colors.length > 0 ? colors[i % colors.length] : color;
		const t = held - i * stagger;
		const now = ringAt(t, frames, R, thick, hair);
		const draw = (ring: Ring, opacity: number, key: string) => {
			const w = Math.max(0.2, ring.outer - ring.inner);
			if (ring.outer <= 0.5 || opacity <= 0.001) {
				return null;
			}
			return <circle key={key} cx={cx} cy={cy} r={ring.inner + w / 2} fill="none" stroke={fill} strokeWidth={w} opacity={opacity} />;
		};
		if (now) {
			const fade = interpolate(now.p, [0, 0.4, 0.78, 1], [1, 1, hairlineOpacity, 0]);
			els.push(draw(now, fade, `r${i}`));
			if (t >= 1 && t <= 1 + echo) {
				const prev = ringAt(t - 1, frames, R, thick, hair);
				if (prev) {
					els.push(draw(prev, 0.2, `e${i}`));
				}
			}
		}
		if (i === 0 && flash && t >= 0 && t < 3) {
			els.push(<circle key="flash" cx={cx} cy={cy} r={R * 0.22 * (1 - t / 3)} fill={flash} />);
		}
	}

	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{display: 'block'}}>
				{els}
			</svg>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<AbsoluteFill>
		<Plate />
		<Sequence from={-3} durationInFrames={30}>
			<ShockwaveRings x={0.5} y={0.5} colors={[DEMO.paper, DEMO.yellow, DEMO.red]} flash={DEMO.paper} />
		</Sequence>
		<Sequence from={18} durationInFrames={30}>
			<ShockwaveRings x={1.04} y={0.72} count={2} radius={820} thickness={90} colors={[DEMO.cyan, DEMO.paper]} stagger={5} />
		</Sequence>
		<Sequence from={40} durationInFrames={30}>
			<ShockwaveRings x={0.2} y={0.8} count={1} radius={520} thickness={80} color={DEMO.red} />
		</Sequence>
		<Sequence from={58}>
			<ShockwaveRings
				x={0.64}
				y={0.4}
				count={3}
				radius={600}
				thickness={90}
				colors={[DEMO.yellow, DEMO.paper, DEMO.cyan]}
				step={2}
				stagger={5}
				flash={DEMO.yellow}
			/>
		</Sequence>
	</AbsoluteFill>
);

export const shockwaveRingsEntry: LibraryEntry = {
	meta: {
		id: 'shockwave-rings',
		title: 'Shockwave rings',
		category: 'shapes',
		looks: 'On a hit a thick ring pops from a point (radius on expo-out), thins to a hairline as it expands and fades; 1-3 rings stagger, a pale echo trails the first frames.',
		use: 'Every impact on a beat: landings, punches, logo slams; centre it on the hit or push it off the frame edge for a blast from outside.',
		exportName: 'ShockwaveRings',
		durationInFrames: 90,
		source: {kind: 'original'},
	},
	Demo,
};
