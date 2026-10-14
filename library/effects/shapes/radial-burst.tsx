// Ported from HyperFrames radial-burst-lines (https://github.com/heygen-com/hyperframes/blob/main/skills/music-to-video/references/motion-primitives/radial-burst-lines/scene.html), Apache-2.0, Copyright 2026 HeyGen, Inc. Changes: re-implemented as a frame-driven SVG component (the original is a GSAP timeline); only its geometry and timing parameters are kept (inner radius 220 + (i%3)*30, scaleY pop over 0.18 s on power4.out, stagger (i%5)*0.018 s, outward drift of 0.2 * length, fade tail) converted to 720p units and frames; kite shape, per-ring length variance, hold and a rotating sunburst layer added. Modified.
import React from 'react';
import {AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, SPRINGS, progress} from '../../core/easing';
import {DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp, power4Out, r2} from './_bursts-utils';

export type RadialBurstProps = {
	/** centre as fractions of the frame (default centre) */
	x?: number;
	y?: number;
	/** number of lines (default 20) */
	count?: number;
	/** px at 720p where the lines start */
	innerRadius?: number;
	/** horizontal stretch of the ring (1 = circle); about 1.5 frames a wide word better */
	aspect?: number;
	/** extra px at 720p added to every ring step: radius = inner + (i % 3) * step */
	radiusStep?: number;
	/** px at 720p, length of a fully grown line */
	length?: number;
	/** 0-1: lines of the 4-step length cycle differ by this share of `length` (0 = all equal) */
	lengthVariance?: number;
	/** px at 720p, width of the widest part of a line */
	weight?: number;
	/** frames a line takes to pop out (power4.out) */
	popFrames?: number;
	/** frames between the pop of neighbouring lines in the 5-step cycle (a ragged sweep around the ring) */
	stagger?: number;
	/** share of `length` the lines drift outward while they pop */
	drift?: number;
	/** frames the lines stay after they have popped */
	hold?: number;
	/** frames to fade out */
	fadeFrames?: number;
	/** 'kite' = pointed at both ends, 'bar' = flat bar */
	shape?: 'kite' | 'bar';
	color?: string;
	/** per-line colours, cycled */
	colors?: string[];
	/** rotating sunburst behind the lines */
	sunburst?: boolean;
	sunburstColor?: string;
	/** with a second colour the rays fill the whole frame alternately (opaque); without it they are translucent wedges */
	sunburstColor2?: string;
	sunburstOpacity?: number;
	/** number of ray pairs */
	sunburstCount?: number;
	/** degrees per frame the sunburst turns */
	spin?: number;
	/** px at 720p where the rays start (default = innerRadius) */
	sunburstInner?: number;
};

/** frames from the first pop to the last line gone, for sizing the <Sequence> */
export const radialBurstLength = (p: Pick<RadialBurstProps, 'popFrames' | 'stagger' | 'hold' | 'fadeFrames'> = {}): number =>
	(p.popFrames ?? 6) + (p.stagger ?? 0.6) * 4 + (p.hold ?? 12) + (p.fadeFrames ?? 10);

/**
 * A ring of lines pops outward from a point (inner radius steps in a 3-ring cycle, lengths in a 4-step cycle, a ragged
 * 5-step stagger), holds, fades. With `sunburst` a ring of rays turns slowly behind it. Starts at frame 0 of its <Sequence>.
 */
export const RadialBurst: React.FC<RadialBurstProps> = ({
	x = 0.5,
	y = 0.5,
	count: countIn = 20,
	innerRadius = 150,
	aspect = 1,
	radiusStep = 20,
	length = 130,
	lengthVariance = 0.35,
	weight = 9,
	popFrames = 6,
	stagger = 0.6,
	drift = 0.2,
	hold = 12,
	fadeFrames = 10,
	shape = 'kite',
	color = '#ffffff',
	colors,
	sunburst = true,
	sunburstColor,
	sunburstColor2,
	sunburstOpacity = 0.18,
	sunburstCount = 14,
	spin = 0.5,
	sunburstInner,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	const cx = x * width;
	const cy = y * height;
	const count = Math.max(1, Math.round(countIn));
	const life = radialBurstLength({popFrames, stagger, hold, fadeFrames});
	const fade = clamp((frame - (life - fadeFrames)) / Math.max(1, fadeFrames), 0, 1);
	if (frame >= life + 1) {
		return null;
	}

	const lineEls: React.ReactNode[] = [];
	for (let i = 0; i < count; i++) {
		const a = (i / count) * Math.PI * 2 - Math.PI / 2;
		const start = (i % 5) * stagger;
		const p = power4Out((frame - start) / Math.max(0.01, popFrames));
		if (p <= 0.001) {
			continue;
		}
		// on an ellipse the ray from the centre is a straight line along (aspect * cos, sin): measure along it in px
		const ex = Math.cos(a) * aspect;
		const ey = Math.sin(a);
		const norm = Math.hypot(ex, ey) || 1;
		const ux = ex / norm;
		const uy = ey / norm;
		const base = (innerRadius + (i % 3) * radiusStep) * u * norm;
		const full = length * u * (1 - lengthVariance / 2 + lengthVariance * ((i % 4) / 3));
		const r0 = base + full * drift * p;
		const len = full * p;
		const half = (weight * u) / 2;
		const nx = -uy;
		const ny = ux;
		const pt = (d: number, w: number) => `${r2(cx + ux * (r0 + d) + nx * w)} ${r2(cy + uy * (r0 + d) + ny * w)}`;
		const d =
			shape === 'kite'
				? `M${pt(0, 0)}L${pt(len * 0.32, half)}L${pt(len, 0)}L${pt(len * 0.32, -half)}Z`
				: `M${pt(0, half)}L${pt(len, half)}L${pt(len, -half)}L${pt(0, -half)}Z`;
		const fill = colors && colors.length > 0 ? colors[i % colors.length] : color;
		lineEls.push(<path key={i} d={d} fill={fill} />);
	}

	// sunburst: wedges from a start radius out past the frame corners, turning slowly, popping in and fading with the lines
	let sun: React.ReactNode = null;
	if (sunburst) {
		const sIn = (sunburstInner ?? innerRadius) * u;
		const far = Math.hypot(width, height);
		const n = Math.max(2, Math.round(sunburstCount));
		const turn = (frame * spin * Math.PI) / 180;
		const pop = CURVES.expoOut(clamp(frame / 12, 0, 1));
		const full = sunburstColor2 !== undefined;
		const wedge = (k: number, off: number) => {
			const a0 = turn + ((k * 2 + off) / (2 * n)) * Math.PI * 2;
			const a1 = turn + ((k * 2 + off + 1) / (2 * n)) * Math.PI * 2;
			const p = (a: number, r: number) => `${r2(cx + Math.cos(a) * r)} ${r2(cy + Math.sin(a) * r)}`;
			return `M${p(a0, sIn)}L${p(a0, far)}L${p(a1, far)}L${p(a1, sIn)}Z`;
		};
		const dA = Array.from({length: n}, (_, k) => wedge(k, 0)).join('');
		const dB = full ? Array.from({length: n}, (_, k) => wedge(k, 1)).join('') : '';
		sun = (
			<g
				opacity={(full ? 1 : sunburstOpacity) * (1 - fade)}
				transform={`translate(${cx} ${cy}) scale(${r2(0.4 + 0.6 * pop)}) translate(${-cx} ${-cy})`}
			>
				{dB ? <path d={dB} fill={sunburstColor2} /> : null}
				<path d={dA} fill={sunburstColor ?? color} />
			</g>
		);
	}

	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{display: 'block'}}>
				{sun}
				<g opacity={1 - fade}>{lineEls}</g>
			</svg>
		</AbsoluteFill>
	);
};

/** demo only: the word that gets hit, scale 0.7 -> 1.1 on power4.out then a punchy spring */
const Hero: React.FC<{text: string; color: string; size?: number}> = ({text, color, size = 250}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const u = useUnit();
	const up = progress(frame, 0, 4, power4Out);
	const settle = frame > 4 ? spring({frame: frame - 4, fps, config: SPRINGS.punch, from: 1.1, to: 1}) : 1.1;
	const scale = frame <= 4 ? 0.7 + 0.4 * up : settle;
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
			<div
				style={{
					fontFamily: DISPLAY_FONT,
					fontSize: size * u,
					lineHeight: 1,
					letterSpacing: -0.02 * size * u,
					color,
					transform: `scale(${scale})`,
					opacity: frame < 0 ? 0 : 1,
				}}
			>
				{text}
			</div>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<AbsoluteFill style={{background: DEMO.ink}}>
		<Sequence from={0} durationInFrames={30}>
			<AbsoluteFill style={{background: DEMO.ink}} />
			<RadialBurst color={DEMO.paper} sunburstColor={DEMO.blue} sunburstOpacity={0.5} aspect={1.45} innerRadius={170} />
			<Hero text="BAM" color={DEMO.paper} size={210} />
		</Sequence>
		<Sequence from={30} durationInFrames={30}>
			<AbsoluteFill style={{background: DEMO.red}} />
			<RadialBurst
				color={DEMO.ink}
				shape="bar"
				count={26}
				aspect={1.45}
				innerRadius={175}
				length={100}
				weight={10}
				sunburstColor={DEMO.ink}
				sunburstOpacity={0.14}
				sunburstCount={18}
				spin={-0.7}
			/>
			<Hero text="POW" color={DEMO.paper} size={230} />
		</Sequence>
		<Sequence from={60}>
			<AbsoluteFill style={{background: DEMO.blue}} />
			<RadialBurst
				colors={[DEMO.yellow, DEMO.paper, DEMO.cyan]}
				count={32}
				aspect={1.4}
				innerRadius={185}
				radiusStep={26}
				length={150}
				weight={9}
				sunburstColor={DEMO.blue}
				sunburstColor2="#2a66ff"
				sunburstCount={12}
				spin={0.9}
			/>
			<Hero text="ZAP" color={DEMO.yellow} size={210} />
		</Sequence>
	</AbsoluteFill>
);

export const radialBurstEntry: LibraryEntry = {
	meta: {
		id: 'radial-burst',
		title: 'Radial burst',
		category: 'shapes',
		looks: 'A ring of 20 kite-shaped lines pops outward around a word on stepped radii with a ragged stagger, holds, fades; a slowly turning sunburst sits behind it.',
		use: 'Word and logo hits ("BAM"): the lines frame the hero from outside, unlike speed-lines (converging from the edges) or trim-burst (small sparks).',
		exportName: 'RadialBurst',
		durationInFrames: 90,
		source: {
			kind: 'ported',
			name: 'HyperFrames radial-burst-lines',
			url: 'https://github.com/heygen-com/hyperframes/blob/main/skills/music-to-video/references/motion-primitives/radial-burst-lines/scene.html',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
