import React, {useMemo} from 'react';
import {AbsoluteFill, Sequence, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp, deg2rad, mod, r2} from './_bursts-utils';

export type PatternKind = 'stripes' | 'chevrons' | 'dots' | 'checker' | 'hex' | 'grid' | 'diamonds' | 'truchet';

export type PatternScrollProps = {
	pattern?: PatternKind;
	background?: string;
	/** main colour of the motif */
	color?: string;
	/** optional second colour (alternate rows / cells / major lines); patterns fall back to the main one without it */
	color2?: string;
	/** px at 720p, size of one cell */
	size?: number;
	/** 0-1 how heavy the motif is within its cell */
	thickness?: number;
	/** degrees, rotates the whole pattern */
	angle?: number;
	/** scroll direction in the pattern's own frame: 0 = along its x axis, 90 = along y (so it turns with `angle`) */
	direction?: number;
	/** px per frame at 720p; negative reverses */
	speed?: number;
	/** frames of acceleration from rest before it reaches `speed` (0 = already moving on frame 0) */
	ramp?: number;
	/** truchet only: seed of the 6 x 6 tile layout */
	seed?: number;
};

type Ctx = {s: number; t: number; hx: number; hy: number; ox: number; oy: number; hasB: boolean; seed: number; flips: boolean[]};
type Out = {a: string; b: string; line: string; lineWidth: number};

const TRUCHET_N = 6;

/** index range of cells of width `step`, starting at `off`, that touch [lo, hi] (plus one cell of margin) */
const span = (lo: number, hi: number, step: number, off: number): [number, number] => [Math.floor((lo - off) / step) - 1, Math.ceil((hi - off) / step) + 1];

const rect = (x: number, y: number, w: number, h: number) => `M${r2(x)} ${r2(y)}h${r2(w)}v${r2(h)}h${r2(-w)}Z`;
const poly = (pts: number[][]) => `M${pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L')}Z`;

type Gen = {
	/** repeat distance of the whole motif along x and y, as a multiple of the cell size */
	period: (s: number) => [number, number];
	draw: (c: Ctx) => Out;
};

const none: Out = {a: '', b: '', line: '', lineWidth: 0};

const PATTERNS: Record<PatternKind, Gen> = {
	stripes: {
		period: (s) => [s, s],
		draw: ({s, t, hx, hy, ox, hasB}) => {
			const o = {...none};
			const w = s * clamp(t, 0.05, 0.95);
			const [i0, i1] = span(-hx, hx, s, ox);
			for (let i = i0; i <= i1; i++) {
				const x = ox + i * s;
				o.a += rect(x, -hy, w, 2 * hy);
				if (hasB) {
					const gap = s - w;
					const w2 = gap * 0.3;
					o.b += rect(x + w + (gap - w2) / 2, -hy, w2, 2 * hy);
				}
			}
			return o;
		},
	},
	chevrons: {
		period: (s) => [s, 2 * s],
		draw: ({s, t, hx, hy, ox, oy, hasB}) => {
			const o = {...none};
			const A = s * 0.42;
			const bt = (s - A) * clamp(t * 1.4, 0.1, 0.95);
			const [j0, j1] = span(-hy, hy, s, oy);
			const [k0, k1] = span(-hx, hx, s / 2, ox);
			for (let j = j0; j <= j1; j++) {
				const y = oy + j * s;
				const top: number[][] = [];
				const bottom: number[][] = [];
				for (let k = k0; k <= k1; k++) {
					const x = ox + k * (s / 2);
					const dy = k & 1 ? A : 0;
					top.push([x, y + dy]);
					bottom.push([x, y + dy + bt]);
				}
				const d = poly([...top, ...bottom.reverse()]);
				if (j & 1 && hasB) {
					o.b += d;
				} else {
					o.a += d;
				}
			}
			return o;
		},
	},
	dots: {
		period: (s) => [s, 2 * s * 0.866],
		draw: ({s, t, hx, hy, ox, oy, hasB}) => {
			const o = {...none};
			const ry = s * 0.866;
			const r = s * 0.5 * (0.35 + 0.6 * clamp(t, 0, 1));
			const [j0, j1] = span(-hy, hy, ry, oy);
			const [i0, i1] = span(-hx, hx, s, ox);
			for (let j = j0; j <= j1; j++) {
				for (let i = i0; i <= i1; i++) {
					const x = ox + i * s + (j & 1 ? s / 2 : 0);
					const y = oy + j * ry;
					const d = `M${r2(x - r)} ${r2(y)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`;
					if (j & 1 && hasB) {
						o.b += d;
					} else {
						o.a += d;
					}
				}
			}
			return o;
		},
	},
	checker: {
		period: (s) => [2 * s, 2 * s],
		draw: ({s, hx, hy, ox, oy, hasB}) => {
			const o = {...none};
			const [i0, i1] = span(-hx, hx, s, ox);
			const [j0, j1] = span(-hy, hy, s, oy);
			for (let j = j0; j <= j1; j++) {
				for (let i = i0; i <= i1; i++) {
					const d = rect(ox + i * s, oy + j * s, s, s);
					if ((i + j) & 1) {
						if (hasB) {
							o.b += d;
						}
					} else {
						o.a += d;
					}
				}
			}
			return o;
		},
	},
	hex: {
		period: (s) => [3 * s, (3 * s) / Math.sqrt(3)],
		draw: ({s, t, hx, hy, ox, oy, hasB}) => {
			const o = {...none};
			const R = s / Math.sqrt(3);
			const rowP = 1.5 * R;
			const hr = R * (0.7 + 0.3 * clamp(t, 0, 1));
			const [j0, j1] = span(-hy, hy, rowP, oy);
			const [i0, i1] = span(-hx, hx, s, ox);
			for (let j = j0; j <= j1; j++) {
				for (let i = i0; i <= i1; i++) {
					// 3-colouring of the hex grid: (q - r) mod 3, so the pattern repeats every 3 cells
					const q = i - (j - (j & 1)) / 2;
					const ci = mod(q - j, 3);
					if (ci === 2) {
						continue;
					}
					const cx = ox + i * s + (j & 1 ? s / 2 : 0);
					const cy = oy + j * rowP;
					const pts = Array.from({length: 6}, (_, k) => {
						const a = deg2rad(-90 + 60 * k);
						return [cx + Math.cos(a) * hr, cy + Math.sin(a) * hr];
					});
					if (ci === 1 && hasB) {
						o.b += poly(pts);
					} else {
						o.a += poly(pts);
					}
				}
			}
			return o;
		},
	},
	grid: {
		period: (s) => [4 * s, 4 * s],
		draw: ({s, t, hx, hy, ox, oy, hasB}) => {
			const o = {...none};
			const lw = s * (0.03 + 0.14 * clamp(t, 0, 1));
			const [i0, i1] = span(-hx, hx, s, ox);
			const [j0, j1] = span(-hy, hy, s, oy);
			for (let i = i0; i <= i1; i++) {
				const major = mod(i, 4) === 0;
				const w = major ? lw * 2 : lw;
				const d = rect(ox + i * s - w / 2, -hy, w, 2 * hy);
				if (major && hasB) {
					o.b += d;
				} else {
					o.a += d;
				}
			}
			for (let j = j0; j <= j1; j++) {
				const major = mod(j, 4) === 0;
				const w = major ? lw * 2 : lw;
				const d = rect(-hx, oy + j * s - w / 2, 2 * hx, w);
				if (major && hasB) {
					o.b += d;
				} else {
					o.a += d;
				}
			}
			return o;
		},
	},
	diamonds: {
		period: (s) => [s, s],
		draw: ({s, t, hx, hy, ox, oy, hasB}) => {
			const o = {...none};
			const h = s * 0.5 * clamp(0.4 + 0.8 * t, 0.3, 0.98);
			const [i0, i1] = span(-hx, hx, s, ox);
			const [j0, j1] = span(-hy, hy, s, oy);
			const dia = (cx: number, cy: number) =>
				poly([
					[cx, cy - h],
					[cx + h, cy],
					[cx, cy + h],
					[cx - h, cy],
				]);
			for (let j = j0; j <= j1; j++) {
				for (let i = i0; i <= i1; i++) {
					const cx = ox + i * s;
					const cy = oy + j * s;
					o.a += dia(cx, cy);
					if (hasB) {
						o.b += dia(cx + s / 2, cy + s / 2);
					}
				}
			}
			return o;
		},
	},
	truchet: {
		period: (s) => [TRUCHET_N * s, TRUCHET_N * s],
		draw: ({s, t, hx, hy, ox, oy, flips}) => {
			const o = {...none};
			const h = s / 2;
			o.lineWidth = s * (0.12 + 0.36 * clamp(t, 0, 1));
			const [i0, i1] = span(-hx, hx, s, ox);
			const [j0, j1] = span(-hy, hy, s, oy);
			for (let j = j0; j <= j1; j++) {
				for (let i = i0; i <= i1; i++) {
					const x = ox + i * s;
					const y = oy + j * s;
					const flip = flips[mod(j, TRUCHET_N) * TRUCHET_N + mod(i, TRUCHET_N)];
					// two quarter circles that join the midpoints of neighbouring edges, so lines run on across tiles
					if (!flip) {
						o.line += `M${r2(x + h)} ${r2(y)}A${r2(h)} ${r2(h)} 0 0 1 ${r2(x)} ${r2(y + h)}M${r2(x + h)} ${r2(y + s)}A${r2(h)} ${r2(h)} 0 0 1 ${r2(x + s)} ${r2(y + h)}`;
					} else {
						o.line += `M${r2(x + s)} ${r2(y + h)}A${r2(h)} ${r2(h)} 0 0 1 ${r2(x + h)} ${r2(y)}M${r2(x)} ${r2(y + h)}A${r2(h)} ${r2(h)} 0 0 1 ${r2(x + h)} ${r2(y + s)}`;
					}
				}
			}
			return o;
		},
	},
};

/**
 * Seamless scrolling graphic background: stripes, chevrons, dots, checker, hex, grid, diamonds or a truchet maze, one or two
 * colours, any angle and scroll direction, optional acceleration from rest. The motif is drawn as a few big paths (crisp at
 * any size, no tile seams). Place it as the bottom layer; it moves from frame 0 of its <Sequence>.
 */
export const PatternScroll: React.FC<PatternScrollProps> = ({
	pattern = 'stripes',
	background = '#0b0b10',
	color = '#f4f1ea',
	color2,
	size = 64,
	thickness = 0.5,
	angle = -30,
	direction = 0,
	speed = 4,
	ramp = 0,
	seed = 1,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	const flips = useMemo(() => Array.from({length: TRUCHET_N * TRUCHET_N}, (_, i) => random(`truchet-${seed}-${i}`) < 0.5), [seed]);
	const gen = PATTERNS[pattern] ?? PATTERNS.stripes;
	const s = Math.max(4, size * u);
	const [pw, ph] = gen.period(s);

	// distance travelled, with an optional linear ramp-up from rest
	const f = Math.max(0, frame);
	const travelled = ramp > 0 ? (f < ramp ? (f * f) / (2 * ramp) : f - ramp / 2) : f;
	const dist = speed * u * travelled;
	const dir = deg2rad(direction);
	const ox = mod(dist * Math.cos(dir), pw);
	const oy = mod(dist * Math.sin(dir), ph);

	// half-extents of the frame in the rotated pattern frame
	const a = deg2rad(angle);
	const hx = (width / 2) * Math.abs(Math.cos(a)) + (height / 2) * Math.abs(Math.sin(a));
	const hy = (width / 2) * Math.abs(Math.sin(a)) + (height / 2) * Math.abs(Math.cos(a));
	const out = gen.draw({s, t: thickness, hx, hy, ox, oy, hasB: color2 !== undefined, seed, flips});

	return (
		<AbsoluteFill style={{background}}>
			<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{display: 'block'}}>
				<g transform={`translate(${width / 2} ${height / 2}) rotate(${angle})`}>
					{out.a ? <path d={out.a} fill={color} /> : null}
					{out.b ? <path d={out.b} fill={color2} /> : null}
					{out.line ? <path d={out.line} fill="none" stroke={color} strokeWidth={out.lineWidth} /> : null}
				</g>
			</svg>
		</AbsoluteFill>
	);
};

/** demo only: name chip in the corner */
const Chip: React.FC<{name: string}> = ({name}) => {
	const u = useUnit();
	return (
		<div
			style={{
				position: 'absolute',
				left: 56 * u,
				bottom: 52 * u,
				background: DEMO.ink,
				color: DEMO.paper,
				fontFamily: DISPLAY_FONT,
				fontSize: 54 * u,
				letterSpacing: 4 * u,
				padding: `${8 * u}px ${24 * u}px`,
				transform: 'skewX(-12deg)',
			}}
		>
			{name}
		</div>
	);
};

type Slot = {name: string} & PatternScrollProps;

const SLOTS: Slot[] = [
	{name: 'STRIPES', pattern: 'stripes', background: DEMO.ink, color: DEMO.yellow, color2: DEMO.paper, size: 96, thickness: 0.5, angle: -30, speed: 7},
	{name: 'DIAMONDS', pattern: 'diamonds', background: DEMO.yellow, color: DEMO.ink, color2: DEMO.red, size: 100, thickness: 0.3, angle: 0, direction: 45, speed: 5},
	{name: 'CHEVRONS', pattern: 'chevrons', background: DEMO.red, color: DEMO.ink, color2: DEMO.paper, size: 110, thickness: 0.5, angle: 0, direction: 90, speed: -6},
	{name: 'DOTS', pattern: 'dots', background: DEMO.blue, color: DEMO.paper, color2: DEMO.cyan, size: 48, thickness: 0.55, angle: 15, direction: 0, speed: 4},
	{name: 'CHECKER', pattern: 'checker', background: DEMO.paper, color: DEMO.ink, size: 90, angle: 20, direction: 0, speed: 6},
	{name: 'HEX', pattern: 'hex', background: DEMO.ink, color: DEMO.cyan, color2: DEMO.blue, size: 84, thickness: 0.6, angle: 0, direction: 30, speed: 4},
	{name: 'TRUCHET', pattern: 'truchet', background: DEMO.paper, color: DEMO.ink, size: 80, thickness: 0.4, angle: 0, direction: 0, speed: 4},
	{name: 'GRID', pattern: 'grid', background: DEMO.blue, color: '#4f82ff', color2: DEMO.paper, size: 56, thickness: 0.3, angle: 0, direction: 90, speed: 5},
];

const Demo: React.FC = () => (
	<AbsoluteFill>
		{SLOTS.map(({name, ...props}, i) => (
			<Sequence key={name} from={i * 12} durationInFrames={12}>
				<PatternScroll {...props} />
				<Chip name={name} />
			</Sequence>
		))}
	</AbsoluteFill>
);

export const patternScrollEntry: LibraryEntry = {
	meta: {
		id: 'pattern-scroll',
		title: 'Pattern scroll',
		category: 'shapes',
		looks: 'A seamless full-frame graphic (stripes, chevrons, dots, checker, hex, grid, diamonds, truchet) scrolls at any angle and direction in one or two colours; optional ease-up from rest.',
		use: 'Moving backdrop under titles and character cards; a rhythmic wipe layer; a ramped scroll as a transition accent.',
		exportName: 'PatternScroll',
		durationInFrames: 96,
		source: {
			kind: 'inspired',
			name: 'GeoPattern',
			url: 'https://github.com/btmills/geopattern',
		},
	},
	Demo,
};
