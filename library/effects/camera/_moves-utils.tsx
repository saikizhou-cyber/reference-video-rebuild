import React, {useId} from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';

/* ------------------------------------------------------------------ noise */

/** Deterministic hash of (integer lattice index, seed) -> -1..1. */
export const hash = (i: number, seed: number): number => {
	let h = (Math.imul(i | 0, 0x27d4eb2d) + Math.imul(Math.floor(seed * 1013) + 1, 0x165667b1)) | 0;
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
	h ^= h >>> 16;
	return ((h >>> 0) / 4294967295) * 2 - 1;
};

const smootherstep = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** 1D value noise with smootherstep interpolation, -1..1, a pure function of x and seed. */
export const noise1 = (x: number, seed: number): number => {
	const i = Math.floor(x);
	const a = hash(i, seed);
	const b = hash(i + 1, seed);
	return a + (b - a) * smootherstep(x - i);
};

export type Octave = {freq: number; amp: number};

/**
 * Sum of value-noise octaves, normalised to -1..1. Each octave (and each seed) gets its own time offset,
 * otherwise channels that share a frequency move in lockstep and the wander collapses onto a diagonal.
 */
export const fbm = (t: number, seed: number, octaves: readonly Octave[]): number => {
	let sum = 0;
	let norm = 0;
	for (let k = 0; k < octaves.length; k++) {
		const o = octaves[k];
		sum += o.amp * noise1(t * o.freq + seed * 7.13 + k * 17.31, seed + k * 3);
		norm += o.amp;
	}
	return sum / norm;
};

/* ----------------------------------------------------------------- camera */

/**
 * Smallest uniform scale at which a w x h frame, moved by at most (maxTx, maxTy) px and rotated by at most
 * maxRotDeg about its centre, still covers the whole viewport (no edge ever shows).
 */
export const coverScale = (w: number, h: number, maxTx: number, maxTy: number, maxRotDeg: number): number => {
	const r = (Math.abs(maxRotDeg) * Math.PI) / 180;
	const c = Math.cos(r);
	const s = Math.sin(r);
	const hx = w / 2 + Math.abs(maxTx);
	const hy = h / 2 + Math.abs(maxTy);
	return Math.max(1, (hx * c + hy * s) / (w / 2), (hx * s + hy * c) / (h / 2));
};

/** Clamp a pan so a frame scaled by `z` (top-left origin) still covers [0, size]. */
export const clampPan = (t: number, size: number, z: number): number => Math.min(0, Math.max(size * (1 - z), t));

/** Overflow-hidden camera frame; the transformed layer is a plain absolutely positioned block. */
export const CameraRig: React.FC<{
	transform: string;
	origin?: string;
	children: React.ReactNode;
	style?: React.CSSProperties;
}> = ({transform, origin = '50% 50%', children, style}) => (
	<AbsoluteFill style={{overflow: 'hidden', ...style}}>
		<div style={{position: 'absolute', inset: 0, transform, transformOrigin: origin}}>{children}</div>
	</AbsoluteFill>
);

/* ------------------------------------------------------------- demo scene */

type Palette = {sky: [string, string, string]; sun: string; accent: string; grid: string; far: string; near: string; window: string};

const PALETTES: Record<string, Palette> = {
	dusk: {sky: ['#080b26', '#3a1d6e', '#e2475a'], sun: '#ffd23f', accent: '#29e0ff', grid: '#29e0ff', far: '#1a1245', near: '#07060f', window: '#ffd23f'},
	ember: {sky: ['#0b0b10', '#6b1230', '#ff7a2e'], sun: '#f4f1ea', accent: '#ffd23f', grid: '#ff3b2e', far: '#2a0e1c', near: '#09070a', window: '#ffb36b'},
	mint: {sky: ['#04141a', '#0d4a52', '#5ee6b8'], sun: '#f4f1ea', accent: '#ffd23f', grid: '#5ee6b8', far: '#0a2d33', near: '#03090c', window: '#f4f1ea'},
};

export type WorldSceneProps = {
	palette?: keyof typeof PALETTES;
	seed?: number;
	/** show the title lockup bottom-left */
	title?: boolean;
	/** distance of the viewfinder brackets from the frame edge, in 720p px (a camera that overscans needs them further in to keep them visible) */
	inset?: number;
	/** extra layers drawn inside the scene (they move with it) */
	children?: React.ReactNode;
};

/**
 * A vector world for the camera demos: sky, a ringed sun emblem (the focus target at ~62 % / 42 %),
 * two skyline layers, a perspective floor grid, a centre cross-hair and viewfinder brackets.
 * Everything is SVG, so it stays sharp at 3x zoom.
 */
export const WorldScene: React.FC<WorldSceneProps> = ({palette = 'dusk', seed = 3, title = true, inset = 28, children}) => {
	const u = useUnit();
	const P = PALETTES[palette];
	const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
	const W = 1280;
	const H = 720;
	const horizon = 540;

	const stars: React.ReactNode[] = [];
	for (let i = 0; i < 46; i++) {
		const x = (hash(i, seed) * 0.5 + 0.5) * W;
		const y = (hash(i + 99, seed) * 0.5 + 0.5) * 300;
		const r = 1 + (hash(i + 7, seed) * 0.5 + 0.5) * 1.6;
		// pixel-aligned squares, not circles: a sub-pixel dot can flicker at the last bit between raster passes
		const sz = r < 1.8 ? 2 : 3;
		stars.push(<rect key={i} x={Math.round(x)} y={Math.round(y)} width={sz} height={sz} fill="#fff" opacity={0.35 + (hash(i + 31, seed) * 0.5 + 0.5) * 0.5} />);
	}

	// buildings are separate rects, but every lit window of one colour is a sub-path of a single <path>:
	// a few hundred DOM nodes less per frame, which matters when a wrapper renders the scene many times
	const layer = (key: string, base: number, minH: number, maxH: number, fill: string, lit: boolean) => {
		const out: React.ReactNode[] = [];
		let warm = '';
		let cool = '';
		let x = -20; // whole pixels throughout: no anti-aliased edges to flicker between raster passes
		let i = 0;
		while (x < W + 20) {
			const bw = Math.round(46 + (hash(i * 3 + 1, seed + base) * 0.5 + 0.5) * 70);
			const bh = Math.round(minH + (hash(i * 3 + 2, seed + base) * 0.5 + 0.5) * (maxH - minH));
			out.push(<rect key={`${key}-b${i}`} x={x} y={horizon - bh} width={bw + 1} height={bh + 2} fill={fill} />);
			if (lit) {
				const cols = Math.floor((bw - 12) / 14);
				const rows = Math.floor((bh - 16) / 18);
				for (let cx = 0; cx < cols; cx++) {
					for (let cy = 0; cy < rows; cy++) {
						if (hash(i * 131 + cx * 17 + cy * 5, seed + 11) > 0.34) {
							const sq = `M${x + 8 + cx * 14} ${horizon - bh + 10 + cy * 18}h6v8h-6z`;
							if (hash(i * 7 + cx + cy * 3, seed + 5) > 0.7) {
								cool += sq;
							} else {
								warm += sq;
							}
						}
					}
				}
			}
			x += bw;
			i++;
		}
		if (warm) {
			out.push(<path key={`${key}-ww`} d={warm} fill={P.window} opacity={0.8} />);
		}
		if (cool) {
			out.push(<path key={`${key}-wc`} d={cool} fill={P.accent} opacity={0.8} />);
		}
		return out;
	};

	// perspective floor grid converging on (640, horizon)
	const grid: React.ReactNode[] = [];
	for (let k = -14; k <= 14; k++) {
		grid.push(<line key={`v${k}`} x1={640 + k * 14} y1={horizon} x2={640 + k * 150} y2={H} stroke={P.grid} strokeWidth={1.4} opacity={0.32} />);
	}
	for (let k = 0; k < 9; k++) {
		const y = horizon + Math.pow(k / 8, 2.1) * (H - horizon);
		grid.push(<line key={`h${k}`} x1={0} y1={y} x2={W} y2={y} stroke={P.grid} strokeWidth={1.4} opacity={0.32} />);
	}

	const sx = 790;
	const sy = 300;
	const slits: React.ReactNode[] = [];
	for (let k = 0; k < 6; k++) {
		slits.push(<rect key={k} x={sx - 150} y={sy + 20 + k * 22} width={300} height={4 + k * 2.2} fill="#000" />);
	}
	const ticks: React.ReactNode[] = [];
	for (let k = 0; k < 4; k++) {
		const a = (k * Math.PI) / 2;
		ticks.push(
			<line
				key={k}
				x1={sx + Math.cos(a) * 196}
				y1={sy + Math.sin(a) * 196}
				x2={sx + Math.cos(a) * 232}
				y2={sy + Math.sin(a) * 232}
				stroke={P.accent}
				strokeWidth={4}
			/>,
		);
	}

	return (
		<AbsoluteFill style={{overflow: 'hidden', background: P.sky[0]}}>
			<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
				<defs>
					<linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stopColor={P.sky[0]} />
						<stop offset="0.55" stopColor={P.sky[1]} />
						<stop offset="1" stopColor={P.sky[2]} />
					</linearGradient>
					<mask id={`${uid}slit`}>
						<rect x="0" y="0" width={W} height={H} fill="#fff" />
						{slits}
					</mask>
				</defs>
				<rect width={W} height={H} fill={`url(#${uid}sky)`} />
				{stars}
				{/* sun emblem */}
				<circle cx={sx} cy={sy} r={150} fill={P.sun} mask={`url(#${uid}slit)`} />
				<circle cx={sx} cy={sy} r={176} fill="none" stroke={P.sun} strokeWidth={3} opacity={0.9} />
				<circle cx={sx} cy={sy} r={196} fill="none" stroke={P.accent} strokeWidth={5} strokeDasharray="44 20" />
				{ticks}
				{layer('far', 1, 120, 300, P.far, false)}
				{layer('near', 2, 60, 200, P.near, true)}
				<rect x={0} y={horizon} width={W} height={H - horizon} fill={P.near} />
				{grid}
				<line x1={0} y1={horizon} x2={W} y2={horizon} stroke={P.accent} strokeWidth={3} />
				{/* centre cross-hair: the reference the camera moves against */}
				<line x1={640} y1={0} x2={640} y2={H} stroke={P.accent} strokeWidth={1.5} opacity={0.35} />
				<line x1={0} y1={360} x2={W} y2={360} stroke={P.accent} strokeWidth={1.5} opacity={0.35} />
				<circle cx={640} cy={360} r={9} fill="none" stroke={P.accent} strokeWidth={2} opacity={0.8} />
				{/* viewfinder brackets */}
				{[
					[inset, inset, 1, 1],
					[W - inset, inset, -1, 1],
					[inset, H - inset, 1, -1],
					[W - inset, H - inset, -1, -1],
				].map(([x, y, dx, dy], i) => (
					<path key={i} d={`M${x + dx * 44} ${y} L${x} ${y} L${x} ${y + dy * 44}`} fill="none" stroke="#f4f1ea" strokeWidth={3} opacity={0.75} />
				))}
			</svg>
			{title ? (
				<>
					<div
						style={{
							position: 'absolute',
							left: 84 * u,
							top: 250 * u,
							fontFamily: DISPLAY_FONT,
							fontSize: 150 * u,
							lineHeight: 0.92,
							color: DEMO.paper,
							letterSpacing: -2 * u,
						}}
					>
						LAST
						<br />
						LIGHT
					</div>
					<div
						style={{
							position: 'absolute',
							left: 90 * u,
							top: 556 * u,
							fontFamily: BODY_FONT,
							fontWeight: 800,
							fontSize: 20 * u,
							letterSpacing: 7 * u,
							color: P.accent,
						}}
					>
						CHAPTER 03 / OUTSKIRTS
					</div>
				</>
			) : null}
			{children}
		</AbsoluteFill>
	);
};

/* ------------------------------------------------------------- demo bits */

/** Fixed yellow cross-hair at the frame centre, drawn OUTSIDE the camera so the scene visibly moves against it. */
export const RefMark: React.FC = () => {
	const {width, height} = useVideoConfig();
	const u = useUnit();
	const cx = width / 2;
	const cy = height / 2;
	const r = 26 * u;
	return (
		<svg width={width} height={height} style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}>
			<circle cx={cx} cy={cy} r={r} fill="none" stroke={DEMO.yellow} strokeWidth={3 * u} />
			<path
				d={`M${cx - r * 1.9} ${cy} H${cx - r * 0.5} M${cx + r * 0.5} ${cy} H${cx + r * 1.9} M${cx} ${cy - r * 1.9} V${cy - r * 0.5} M${cx} ${cy + r * 0.5} V${cy + r * 1.9}`}
				stroke={DEMO.yellow}
				strokeWidth={3 * u}
				fill="none"
			/>
		</svg>
	);
};

/** Small label plate bottom-right for demos (outside the camera). */
export const Tag: React.FC<{text: string; right?: number; bottom?: number}> = ({text, right = 40, bottom = 34}) => {
	const u = useUnit();
	return (
		<div
			style={{
				position: 'absolute',
				right: right * u,
				bottom: bottom * u,
				background: DEMO.ink,
				color: DEMO.paper,
				fontFamily: BODY_FONT,
				fontWeight: 800,
				fontSize: 18 * u,
				letterSpacing: 4 * u,
				padding: `${8 * u}px ${16 * u}px`,
				borderLeft: `${6 * u}px solid ${DEMO.yellow}`,
				whiteSpace: 'nowrap',
			}}
		>
			{text}
		</div>
	);
};
