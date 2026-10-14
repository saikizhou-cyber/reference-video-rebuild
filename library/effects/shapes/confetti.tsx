// Ported from Remocn confetti (https://github.com/Remocn/remocn/blob/main/registry/remocn/confetti/index.tsx), MIT, Copyright (c) 2026 Remocn. Changes: the closed-form seeded ballistics are kept; added cone and crossfire launchers (two corner cannons, after the idea of video-shotcraft's ConfettiCrossfire), exponential drag with terminal-velocity fall and sway instead of constant gravity, SVG chips with a shaded back side, mixed chip / strip / dot shapes, 720p units, PV demo.
import React, {useMemo} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {DISPLAY_FONT, Backdrop, DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp, mixHex, r2, rngOf, smoothstep} from './_bursts-utils';

export type ConfettiProps = {
	/** 'burst' = all around; 'cone' = one launcher with a fan; 'crossfire' = two corner cannons firing across */
	mode?: 'burst' | 'cone' | 'crossfire';
	/** number of pieces (split between the two cannons in crossfire) */
	count?: number;
	colors?: string[];
	/** burst / cone origin as fractions of the frame (defaults: centre for burst, below the bottom edge for cone) */
	x?: number;
	y?: number;
	/** cone: direction in degrees (screen: -90 = up) */
	angle?: number;
	/** cone / per cannon: width of the fan in degrees (default 64 for a cone, 46 per cannon) */
	spread?: number;
	/** crossfire: degrees above the horizontal each cannon aims */
	crossAngle?: number;
	/** launch speed in px per frame at 720p (the fastest pieces) */
	power?: number;
	/** share of the velocity kept each frame (0.9 = stops fast, 0.97 = keeps flying) */
	drag?: number;
	/** px per frame at 720p the pieces settle into falling at (varies per piece) */
	fall?: number;
	/** px at 720p, base size of a piece */
	size?: number;
	/** frames before everything has faded out */
	lifetime?: number;
	/** crossfire: frames between the two cannons */
	cannonDelay?: number;
	/** 'mix' = chips, strips and dots; or only one kind */
	shapes?: 'mix' | 'chips' | 'strips' | 'dots';
	seed?: number;
};

const DEFAULT_COLORS = ['#f4f1ea', '#ffd23f', '#ff3b2e', '#29e0ff', '#1f5bff'];

type Piece = {
	angle: number;
	speed: number;
	size: number;
	color: number;
	shape: 'chip' | 'strip' | 'dot';
	rot0: number;
	spin: number;
	flip0: number;
	flipRate: number;
	fallK: number;
	swayAmp: number;
	swayRate: number;
	swayPhase: number;
	cannon: 0 | 1;
	lag: number;
};

const makePieces = (
	count: number,
	mode: NonNullable<ConfettiProps['mode']>,
	angle: number,
	spread: number,
	crossAngle: number,
	shapes: NonNullable<ConfettiProps['shapes']>,
	colorCount: number,
	seed: number,
): Piece[] => {
	const r = rngOf(`confetti-${seed}`);
	return Array.from({length: count}, (_, i) => {
		const cannon = (mode === 'crossfire' ? i % 2 : 0) as 0 | 1;
		let a: number;
		if (mode === 'burst') {
			a = r() * Math.PI * 2;
		} else {
			const centre = mode === 'crossfire' ? (cannon === 0 ? -crossAngle : -(180 - crossAngle)) : angle;
			a = ((centre + (r() - 0.5) * spread) * Math.PI) / 180;
		}
		// bias toward the fast end so the fan has a clear edge, with a few slow stragglers
		const speed = mode === 'burst' ? 0.35 + 0.65 * r() : 0.4 + 0.6 * Math.sqrt(r());
		const pick = r();
		const shape: Piece['shape'] =
			shapes === 'chips' ? 'chip' : shapes === 'strips' ? 'strip' : shapes === 'dots' ? 'dot' : pick < 0.6 ? 'chip' : pick < 0.82 ? 'strip' : 'dot';
		return {
			angle: a,
			speed,
			size: 0.7 + 0.6 * r(),
			color: Math.floor(r() * colorCount),
			shape,
			rot0: r() * 360,
			spin: (r() - 0.5) * 14,
			flip0: r() * Math.PI * 2,
			flipRate: 0.22 + r() * 0.4,
			fallK: 0.6 + 0.8 * r(),
			swayAmp: 6 + 18 * r(),
			swayRate: 0.09 + 0.12 * r(),
			swayPhase: r() * Math.PI * 2,
			cannon,
			lag: r() * 2,
		};
	});
};

/**
 * Seeded confetti, a pure function of the frame: every piece launches at its own speed along a cone / around a point /
 * from two corner cannons, loses speed to drag, then settles into a slow fall with sway; chips flip (cos scale, darker
 * back side) and spin. Quick fade-in, fade-out over the last 30 % of `lifetime`. Starts at frame 0 of its <Sequence>.
 */
export const Confetti: React.FC<ConfettiProps> = ({
	mode = 'cone',
	count = 140,
	colors = DEFAULT_COLORS,
	x,
	y,
	angle = -90,
	spread: spreadIn,
	crossAngle = 62,
	power = 50,
	drag = 0.94,
	fall = 3.4,
	size = 20,
	lifetime = 100,
	cannonDelay = 3,
	shapes = 'mix',
	seed = 1,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	const palette = colors.length > 0 ? colors : DEFAULT_COLORS;
	const n = Math.max(1, Math.round(count));
	const spread = spreadIn ?? (mode === 'crossfire' ? 46 : 64);
	const pieces = useMemo(
		() => makePieces(n, mode, angle, spread, crossAngle, shapes, palette.length, seed),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[n, mode, angle, spread, crossAngle, shapes, palette.length, seed],
	);
	const backs = useMemo(() => palette.map((c) => mixHex(c, '#0b0b10', 0.32)), [palette]);
	if (frame < 0 || frame > lifetime + cannonDelay + 3) {
		return null;
	}

	const d = clamp(drag, 0.5, 0.9995);
	const k = -Math.log(d);
	const origin = (cannon: 0 | 1): [number, number] => {
		if (mode === 'crossfire') {
			return [(cannon === 0 ? -0.03 : 1.03) * width, 1.04 * height];
		}
		return [(x ?? 0.5) * width, (y ?? (mode === 'cone' ? 1.04 : 0.5)) * height];
	};

	const els: React.ReactNode[] = [];
	pieces.forEach((p, i) => {
		const t = frame - p.lag - (p.cannon === 1 ? cannonDelay : 0);
		if (t < 0 || t > lifetime) {
			return;
		}
		const [ox, oy] = origin(p.cannon);
		const v = p.speed * power * u;
		// closed form of per-frame drag: distance covered by the launch velocity, then terminal-velocity fall
		const tau = (1 - Math.pow(d, t)) / k;
		const vt = fall * p.fallK * u;
		const sway = p.swayAmp * u * Math.sin(p.swayPhase + p.swayRate * t) * (1 - Math.exp(-t / 18));
		const px = ox + Math.cos(p.angle) * v * tau + sway;
		const py = oy + Math.sin(p.angle) * v * tau + vt * (t - tau);
		if (px < -60 * u || px > width + 60 * u || py > height + 60 * u) {
			return;
		}
		const opacity = Math.min(clamp(t / 3, 0, 1), 1 - smoothstep((t - lifetime * 0.7) / (lifetime * 0.3)));
		if (opacity <= 0.01) {
			return;
		}
		const rot = p.rot0 + p.spin * t * Math.exp(-t / 60);
		const flip = Math.cos(p.flip0 + p.flipRate * t);
		const w = size * p.size * u;
		const fill = flip >= 0 ? palette[p.color % palette.length] : backs[p.color % backs.length];
		const sx = Math.max(0.06, Math.abs(flip));
		// fill-opacity instead of group opacity: no offscreen layer per piece
		const fo = r2(opacity);
		let shapeEl: React.ReactNode;
		if (p.shape === 'chip') {
			shapeEl = <rect x={-w / 2} y={-w * 0.31} width={w} height={w * 0.62} fill={fill} fillOpacity={fo} />;
		} else if (p.shape === 'strip') {
			shapeEl = <rect x={-w * 0.14} y={-w * 0.95} width={w * 0.28} height={w * 1.9} fill={fill} fillOpacity={fo} />;
		} else {
			shapeEl = <circle r={w * 0.36} fill={fill} fillOpacity={fo} />;
		}
		els.push(
			<g key={i} transform={`translate(${r2(px)} ${r2(py)}) rotate(${r2(rot)}) scale(${r2(sx)} 1)`}>
				{shapeEl}
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

/** demo only: the line the confetti is thrown at */
const Title: React.FC = () => {
	const u = useUnit();
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
			<div style={{fontFamily: DISPLAY_FONT, fontSize: 150 * u, lineHeight: 0.92, color: DEMO.paper, textAlign: 'center', letterSpacing: -2 * u}}>
				STAGE
				<br />
				<span style={{color: DEMO.yellow}}>CLEAR</span>
			</div>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<Backdrop color={DEMO.ink}>
		<Title />
		<Sequence from={-6}>
			<Confetti mode="cone" count={190} seed={2} />
		</Sequence>
		<Sequence from={32}>
			<Confetti mode="crossfire" count={220} seed={5} colors={[DEMO.yellow, DEMO.paper, DEMO.red, DEMO.cyan]} />
		</Sequence>
		<Sequence from={62}>
			<Confetti mode="burst" count={150} seed={9} x={0.5} y={0.48} power={34} colors={[DEMO.red, DEMO.yellow, DEMO.paper]} />
		</Sequence>
	</Backdrop>
);

export const confettiEntry: LibraryEntry = {
	meta: {
		id: 'confetti',
		title: 'Confetti',
		category: 'shapes',
		looks: 'Flat chips, strips and dots leave a cone, a point or two corner cannons at seeded speeds, lose speed to drag, then flutter down flipping and swaying; fades over the last 30 %.',
		use: 'Win / clear / unlock moments, release-date reveals, end cards; crossfire for a big finish.',
		exportName: 'Confetti',
		durationInFrames: 100,
		source: {
			kind: 'ported',
			name: 'Remocn confetti',
			url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/confetti/index.tsx',
			license: 'MIT',
		},
	},
	Demo,
};
