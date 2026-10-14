// Inspired by Arwes frames (https://github.com/arwes/arwes/tree/next/packages/frames), MIT: the idea of corner / octagon / notched sci-fi frames that assemble by
// drawing their lines on and flickering their decorations in. No Arwes code is used; all geometry and timing here is written from scratch.
import React from 'react';
import {AbsoluteFill, Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES} from '../../core/easing';
import {Backdrop, BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {MONO_FONT, clamp01, dashWindow, flickerAt, polyPath} from './_hud-utils';

export type HudFrameVariant = 'corners' | 'octagon' | 'notched';

export type HudFrameProps = {
	/** corners = four L brackets joined by faint edge lines; octagon = cut-corner outline; notched = tabbed panel with two cut corners */
	variant?: HudFrameVariant;
	/** frame size in px at 720p; leave both out to fill the composition minus `inset` */
	width?: number;
	height?: number;
	/** left / top in px at 720p (default: centred) */
	x?: number;
	y?: number;
	/** gap to the composition edge when width/height are not given, px at 720p */
	inset?: number;
	/** line colour */
	color?: string;
	/** colour of the flickering decorations (pips, ticks, accent bars) */
	accent?: string;
	/** panel fill that fades in first */
	background?: string;
	backgroundOpacity?: number;
	/** line weight, px at 720p */
	strokeWidth?: number;
	/** bracket arm length for `corners`, px at 720p */
	cornerLength?: number;
	/** corner cut for `octagon` / `notched`, px at 720p */
	cut?: number;
	/** frames the assembly takes */
	inFrames?: number;
	/** frames to wait before assembling (relative to the <Sequence>) */
	delay?: number;
	/** frame at which the frame disassembles (omit to hold forever) */
	outAt?: number;
	outFrames?: number;
	/** hard on/off flicker of the decorations (false = plain fade) */
	flicker?: boolean;
	/** bright spark that rides the leading edge of each line while it draws */
	spark?: boolean;
	/** content placed inside the frame; fades in with the panel */
	children?: React.ReactNode;
	style?: React.CSSProperties;
};

type Stroke = {d: string; max: number; delay: number; width: number; opacity: number; cap: 'butt' | 'square'; spark: boolean; half?: 'a' | 'b'};
type Rect = [x: number, y: number, w: number, h: number];
type Geometry = {bg: string; strokes: Stroke[]; rects: Rect[]; lines: Array<{d: string; width: number}>; pad: [number, number]};

/** lines start fast and land softly, slow enough that the draw-on reads over ~24 frames */
const DRAW = Easing.bezier(0.25, 0.5, 0.25, 1);

const build = (variant: HudFrameVariant, bw: number, bh: number, sw: number, u: number, cornerLength: number, cut: number): Geometry => {
	const s = sw / 2;
	const L = s;
	const R = bw - s;
	const T = s;
	const B = bh - s;
	const mx = bw / 2;
	const my = bh / 2;
	if (variant === 'corners') {
		const arm = Math.min(cornerLength * u, bw / 2 - s - 6 * u, bh / 2 - s - 6 * u);
		const gap = 16 * u;
		const strokes: Stroke[] = [];
		const cs = [
			{ox: L, oy: T, sx: 1, sy: 1},
			{ox: R, oy: T, sx: -1, sy: 1},
			{ox: L, oy: B, sx: 1, sy: -1},
			{ox: R, oy: B, sx: -1, sy: -1},
		];
		cs.forEach((c, i) => {
			const delay = i * 0.05;
			strokes.push({d: `M${c.ox} ${c.oy} L${c.ox + c.sx * arm} ${c.oy}`, max: 1, delay, width: sw, opacity: 1, cap: 'square', spark: true});
			strokes.push({d: `M${c.ox} ${c.oy} L${c.ox} ${c.oy + c.sy * arm}`, max: 1, delay, width: sw, opacity: 1, cap: 'square', spark: true});
			// faint edge lines run from the arm ends toward the middle of each edge
			strokes.push({d: `M${c.ox + c.sx * arm} ${c.oy} L${mx - c.sx * gap} ${c.oy}`, max: 1, delay: delay + 0.1, width: Math.max(1, sw * 0.5), opacity: 0.4, cap: 'butt', spark: false});
			strokes.push({d: `M${c.ox} ${c.oy + c.sy * arm} L${c.ox} ${my - c.sy * gap}`, max: 1, delay: delay + 0.1, width: Math.max(1, sw * 0.5), opacity: 0.4, cap: 'butt', spark: false});
		});
		const p = 9 * u;
		const pip = 5 * u;
		const rects: Rect[] = [
			[L + p, T + p, pip, pip],
			[R - p - pip, T + p, pip, pip],
			[L + p, B - p - pip, pip, pip],
			[R - p - pip, B - p - pip, pip, pip],
			// mid-edge ticks
			[mx - 14 * u, T, 28 * u, sw * 2.2],
			[mx - 14 * u, B - sw * 2.2, 28 * u, sw * 2.2],
			[L, my - 14 * u, sw * 2.2, 28 * u],
			[R - sw * 2.2, my - 14 * u, sw * 2.2, 28 * u],
		];
		return {bg: polyPath([[L, T], [R, T], [R, B], [L, B]]), strokes, rects, lines: [], pad: [18 * u, 18 * u]};
	}
	if (variant === 'octagon') {
		const c = Math.min(cut * u, bw / 3, bh / 3);
		const cw: Array<[number, number]> = [[mx, T], [R - c, T], [R, T + c], [R, B - c], [R - c, B], [L + c, B], [L, B - c], [L, T + c], [L + c, T]];
		const ccw: Array<[number, number]> = [cw[0], ...cw.slice(1).reverse()];
		const strokes: Stroke[] = [
			{d: polyPath(cw), max: 0.5004, delay: 0, width: sw, opacity: 1, cap: 'butt', spark: true, half: 'a'},
			{d: polyPath(ccw), max: 0.5004, delay: 0, width: sw, opacity: 1, cap: 'butt', spark: true, half: 'b'},
		];
		// parallel accent lines inside every cut corner, plus tick bars on the long edges
		const k = (8 * u) / Math.SQRT2;
		const lines = [
			{sx: 1, sy: 1, ox: L, oy: T},
			{sx: -1, sy: 1, ox: R, oy: T},
			{sx: 1, sy: -1, ox: L, oy: B},
			{sx: -1, sy: -1, ox: R, oy: B},
		].map((q) => {
			const pt = (t: number) => `${q.ox + q.sx * (c * (1 - t) + k)} ${q.oy + q.sy * (c * t + k)}`;
			return {d: `M${pt(0.18)} L${pt(0.82)}`, width: Math.max(1.5 * u, sw)};
		});
		const rects: Rect[] = [
			[mx - 22 * u, T + sw * 1.6, 44 * u, sw * 1.4],
			[mx - 22 * u, B - sw * 3, 44 * u, sw * 1.4],
			[L + sw * 1.6, my - 22 * u, sw * 1.4, 44 * u],
			[R - sw * 3, my - 22 * u, sw * 1.4, 44 * u],
		];
		return {bg: polyPath(cw), strokes, rects, lines, pad: [c * 0.7 + 14 * u, c * 0.7 + 14 * u]};
	}
	// notched: a tab at the top left and bottom right, two cut corners
	const c = Math.min(cut * u, bw / 4, bh / 4);
	const nw = Math.min(bw * 0.26, 150 * u);
	const nh = 12 * u;
	const P: Array<[number, number]> = [
		[L, T],
		[L + nw, T],
		[L + nw + nh, T + nh],
		[R - c, T + nh],
		[R, T + nh + c],
		[R, B],
		[R - nw, B],
		[R - nw - nh, B - nh],
		[L + c, B - nh],
		[L, B - nh - c],
	];
	const ccw: Array<[number, number]> = [P[0], ...P.slice(1).reverse()];
	const strokes: Stroke[] = [
		{d: polyPath(P), max: 0.5004, delay: 0, width: sw, opacity: 1, cap: 'butt', spark: true, half: 'a'},
		{d: polyPath(ccw), max: 0.5004, delay: 0, width: sw, opacity: 1, cap: 'butt', spark: true, half: 'b'},
	];
	const pipSize = 4 * u;
	const rects: Rect[] = [
		[L + nw + nh + 12 * u, T + nh + 7 * u, 72 * u, 3 * u],
		[R - nw - nh - 12 * u - 72 * u, B - nh - 7 * u - 3 * u, 72 * u, 3 * u],
	];
	for (let i = 0; i < 3; i++) {
		rects.push([L + 12 * u + i * 10 * u, T + (nh - pipSize) / 2, pipSize, pipSize]);
		rects.push([R - 12 * u - pipSize - i * 10 * u, B - (nh + pipSize) / 2, pipSize, pipSize]);
	}
	return {bg: polyPath(P), strokes, rects, lines: [], pad: [18 * u + nh, 18 * u + nh]};
};

/**
 * Sci-fi frame that assembles: the panel fades in, lines draw on (a spark rides each head), then the decorations
 * flicker on. Optionally disassembles at `outAt`. Starts at frame `delay` of its <Sequence>.
 */
export const HudFrame: React.FC<HudFrameProps> = ({
	variant = 'corners',
	width,
	height,
	x,
	y,
	inset = 48,
	color = DEMO.cyan,
	accent = DEMO.yellow,
	background = '#06121a',
	backgroundOpacity = 0.74,
	strokeWidth = 2,
	cornerLength = 38,
	cut = 26,
	inFrames = 26,
	delay = 0,
	outAt,
	outFrames = 12,
	flicker = true,
	spark = true,
	children,
	style,
}) => {
	const frame = useCurrentFrame();
	const {width: W, height: H} = useVideoConfig();
	const u = useUnit();
	const bw = width !== undefined ? width * u : W - 2 * inset * u;
	const bh = height !== undefined ? height * u : H - 2 * inset * u;
	const left = x !== undefined ? x * u : (W - bw) / 2;
	const top = y !== undefined ? y * u : (H - bh) / 2;
	const sw = Math.max(1, strokeWidth * u);
	const geo = React.useMemo(() => build(variant, bw, bh, sw, u, cornerLength, cut), [variant, bw, bh, sw, u, cornerLength, cut]);

	const t = frame - delay;
	if (t < 0) {
		return null;
	}
	const a = clamp01(t / Math.max(1, inFrames));
	const q = outAt === undefined ? 0 : clamp01((frame - outAt) / Math.max(1, outFrames));
	const bgIn = clamp01(a / 0.5);
	const bgA = bgIn * (1 - clamp01((q - 0.25) / 0.75));
	const lineOut = 1 - CURVES.inOutCubic(q);
	const decoIn = flicker ? flickerAt((a - 0.5) / 0.5) : clamp01((a - 0.5) / 0.5);
	const decoOut = q <= 0 ? 1 : flicker ? flickerAt(1 - q / 0.4) : 1 - clamp01(q / 0.4);
	const deco = decoIn * decoOut;
	if (bgA <= 0 && q >= 1) {
		return null;
	}

	return (
		<div style={{position: 'absolute', left, top, width: bw, height: bh, ...style}}>
			<svg width={bw} height={bh} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
				<path d={geo.bg} fill={background} fillOpacity={backgroundOpacity * bgA} />
				{geo.strokes.map((st, i) => {
					const p = DRAW(clamp01((a - 0.04 - st.delay) / (0.96 - st.delay))) * lineOut;
					if (p <= 0.0005) {
						return null;
					}
					// fully drawn: plain stroke, no dash maths (the two halves of a ring collapse into one closed path)
					const done = p >= 0.9995;
					if (done && st.half === 'b') {
						return null;
					}
					const head = st.spark && spark && p < 0.999 ? (
						<path
							d={st.d}
							pathLength={1}
							fill="none"
							stroke="#ffffff"
							strokeWidth={st.width * 1.7}
							strokeLinecap="butt"
							opacity={1 - clamp01((p - 0.75) / 0.25)}
							{...dashWindow(p * st.max - 0.045 * st.max, p * st.max)}
						/>
					) : null;
					return (
						<React.Fragment key={i}>
							<path
								d={st.d}
								fill="none"
								stroke={color}
								strokeWidth={st.width}
								strokeLinecap={st.cap}
								strokeLinejoin="miter"
								opacity={st.opacity}
								{...(done ? {} : {pathLength: 1, ...dashWindow(0, p * st.max)})}
							/>
							{head}
						</React.Fragment>
					);
				})}
				{deco > 0 ? (
					<g opacity={deco}>
						{geo.rects.map((r, i) => (
							<rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} fill={accent} />
						))}
						{geo.lines.map((l, i) => (
							<path key={i} d={l.d} stroke={accent} strokeWidth={l.width} strokeLinecap="butt" fill="none" />
						))}
					</g>
				) : null}
			</svg>
			{children ? (
				<div style={{position: 'absolute', inset: 0, padding: `${geo.pad[0]}px ${geo.pad[1]}px`, opacity: bgA * (1 - clamp01((q - 0.1) / 0.5))}}>
					{children}
				</div>
			) : null}
		</div>
	);
};

const Label: React.FC<{k: string; v: string; color?: string; u: number}> = ({k, v, color = DEMO.paper, u}) => (
	<div style={{display: 'flex', justifyContent: 'space-between', fontFamily: MONO_FONT, fontSize: 17 * u, letterSpacing: 2 * u, padding: `${6 * u}px 0`, borderBottom: `${u}px solid rgba(41,224,255,0.18)`}}>
		<span style={{color: 'rgba(244,241,234,0.55)'}}>{k}</span>
		<span style={{color, fontWeight: 700}}>{v}</span>
	</div>
);

const Demo: React.FC = () => {
	const u = useUnit();
	return (
		<Backdrop color="#04080c">
			<AbsoluteFill
				style={{
					opacity: 0.5,
					backgroundImage: `linear-gradient(rgba(41,224,255,0.07) ${u}px, transparent ${u}px), linear-gradient(90deg, rgba(41,224,255,0.07) ${u}px, transparent ${u}px)`,
					backgroundSize: `${48 * u}px ${48 * u}px`,
				}}
			/>
			<HudFrame variant="octagon" x={70} y={100} width={700} height={500} outAt={52} delay={0}>
				<div style={{height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${40 * u}px`}}>
					<div style={{fontFamily: MONO_FONT, fontSize: 18 * u, letterSpacing: 8 * u, color: DEMO.yellow}}>SECTOR 07 // LINK 0412</div>
					<div style={{fontFamily: DISPLAY_FONT, fontSize: 128 * u, lineHeight: 0.95, color: DEMO.paper, letterSpacing: -2 * u, marginTop: 14 * u}}>
						RELAY
						<br />
						ONLINE
					</div>
				</div>
			</HudFrame>
			<HudFrame variant="notched" x={810} y={100} width={400} height={280} delay={10} outAt={55} color={DEMO.cyan}>
				<div style={{paddingTop: 10 * u}}>
					<Label k="UPLINK" v="98.4%" u={u} />
					<Label k="LATENCY" v="12 MS" u={u} />
					<Label k="CORE TEMP" v="41 C" u={u} color={DEMO.yellow} />
					<Label k="CREW" v="06 / 06" u={u} />
				</div>
			</HudFrame>
			<HudFrame variant="corners" x={810} y={410} width={400} height={190} delay={20} outAt={58} color={DEMO.paper} accent={DEMO.red} background="#12060a">
				<div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 * u}}>
					<div style={{fontFamily: DISPLAY_FONT, fontSize: 72 * u, color: DEMO.red, lineHeight: 1}}>03</div>
					<div style={{fontFamily: BODY_FONT, fontWeight: 800, fontSize: 18 * u, letterSpacing: 4 * u, color: DEMO.paper, lineHeight: 1.3}}>
						HOSTILES
						<br />
						IN RANGE
					</div>
				</div>
			</HudFrame>
		</Backdrop>
	);
};

export const hudFrameEntry: LibraryEntry = {
	meta: {
		id: 'hud-frame',
		title: 'HUD frame',
		category: 'shapes',
		looks: 'The panel fades in, then corner brackets / an octagon / a notched outline draw on from their corners with a bright spark on each head, and pips and ticks flicker on.',
		use: 'Boxes around game UI, status panels, character cards and any "system online" beat.',
		notes: 'Draws a dark panel (backgroundOpacity 0.74, measured: a bright picture drops to about a quarter) over whatever is behind it: set backgroundOpacity 0 for bare brackets over a picture. Pass your content as children: they draw above the panel and fade in with it.',
		exportName: 'HudFrame',
		durationInFrames: 72,
		source: {kind: 'inspired', name: 'Arwes frames', url: 'https://github.com/arwes/arwes/tree/next/packages/frames'},
	},
	Demo,
};
