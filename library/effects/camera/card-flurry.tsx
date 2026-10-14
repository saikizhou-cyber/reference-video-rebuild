import React, {useMemo} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, progress, stepped} from '../../core/easing';
import {DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp01, lerp, rnd} from './_space-utils';

// Pinhole projection of flat planes mapped onto the screen with a homography (CSS matrix3d). No preserve-3d is
// involved, so filters (depth blur) behave and the result is a pure function of the frame.
// Generalised from the card flurry of the author's own finished PV project.

type P2 = readonly [number, number];
type Quad = readonly [P2, P2, P2, P2]; // tl, tr, br, bl
type V3 = readonly [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const rotX = ([x, y, z]: V3, a: number): V3 => {
	const c = Math.cos(rad(a));
	const s = Math.sin(rad(a));
	return [x, y * c - z * s, y * s + z * c];
};
const rotY = ([x, y, z]: V3, a: number): V3 => {
	const c = Math.cos(rad(a));
	const s = Math.sin(rad(a));
	return [x * c + z * s, y, -x * s + z * c];
};
const rotZ = ([x, y, z]: V3, a: number): V3 => {
	const c = Math.cos(rad(a));
	const s = Math.sin(rad(a));
	return [x * c - y * s, x * s + y * c, z];
};

type Plane = {x: number; y: number; z: number; w: number; h: number; rx: number; ry: number; rz: number};

/** Screen quad of a plane, which face looks at the camera, its on-screen area and its normal (pointing at the camera side of the front face). */
const projectPlane = (p: Plane, cx: number, cy: number, focal: number) => {
	const X = ((p.x - cx) * p.z) / focal;
	const Y = ((p.y - cy) * p.z) / focal;
	const hw = p.w / 2;
	const hh = p.h / 2;
	const turn = (v: V3): V3 => rotY(rotX(rotZ(v, p.rz), p.rx), p.ry);
	const corners: V3[] = [
		[-hw, -hh, 0],
		[hw, -hh, 0],
		[hw, hh, 0],
		[-hw, hh, 0],
	];
	const quad = corners.map((v) => {
		const q = turn(v);
		const z = Math.max(40, p.z + q[2]);
		return [cx + (focal * (X + q[0])) / z, cy + (focal * (Y + q[1])) / z] as P2;
	}) as unknown as Quad;
	let s = 0;
	for (let i = 0; i < 4; i++) {
		const [x0, y0] = quad[i];
		const [x1, y1] = quad[(i + 1) % 4];
		s += x0 * y1 - x1 * y0;
	}
	return {quad, front: s > 0, area: Math.abs(s / 2), normal: turn([0, 0, -1])};
};

/** CSS matrix3d mapping the rect (0,0)-(w,h) onto the quad [tl, tr, br, bl] (transform-origin 0 0). */
const homography = (w: number, h: number, [tl, tr, br, bl]: Quad) => {
	const [x0, y0] = tl;
	const [x1, y1] = tr;
	const [x2, y2] = br;
	const [x3, y3] = bl;
	const dx1 = x1 - x2;
	const dx2 = x3 - x2;
	const dx3 = x0 - x1 + x2 - x3;
	const dy1 = y1 - y2;
	const dy2 = y3 - y2;
	const dy3 = y0 - y1 + y2 - y3;
	const den = dx1 * dy2 - dy1 * dx2;
	const g = den === 0 ? 0 : (dx3 * dy2 - dy3 * dx2) / den;
	const k = den === 0 ? 0 : (dx1 * dy3 - dy1 * dx3) / den;
	const a = x1 - x0 + g * x1;
	const b = x3 - x0 + k * x3;
	const d = y1 - y0 + g * y1;
	const e = y3 - y0 + k * y3;
	const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
	return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-12 ? 0 : v).toFixed(10)).join(',')})`;
};

// ---- public types -----------------------------------------------------------------------------------------

export type FlurryCard = {
	/** face nodes, laid out in a `w` x `h` box; defaults to FlurryCardFace / FlurryCardBack */
	front?: React.ReactNode;
	back?: React.ReactNode;
	/** where the card is: screen centre in 720p units (frame centre = 640, 360) and depth (1000 = drawn 1:1, smaller = nearer) */
	x: number;
	y: number;
	z: number;
	/** size in px at 720p when z = 1000 */
	w: number;
	h: number;
	/** starting angles in degrees (rz spins in the card's own plane, rx / ry tilt it about the screen axes; ry past +-90 shows the back) */
	rx: number;
	ry: number;
	rz: number;
	/** spin in degrees per second per axis */
	spin: readonly [number, number, number];
	/** drift in px per second: x, y and depth */
	drift: readonly [number, number, number];
	/** overrides for the depth blur (px at 720p) and the brightness (1 = as drawn) */
	blur?: number;
	dim?: number;
};

export type CardFlurryProps = {
	/** place every card yourself; leave out to generate `count` cards from `seed` */
	cards?: readonly FlurryCard[];
	count?: number;
	seed?: number;
	/** generated cards: size at z = 1000, face colours, typical spin (deg/s) and drift (px/s) */
	cardSize?: readonly [number, number];
	colors?: readonly string[];
	spin?: number;
	drift?: number;
	/** generated cards: custom face for card `i` (return null for the default) */
	renderFace?: (i: number, size: {w: number; h: number}, color: string) => React.ReactNode;
	/** depth blur: px at 720p per unit of distance from the focal depth, and that depth (1000 = the 1:1 plane) */
	depthBlur?: number;
	focusZ?: number;
	/** shade each card by its tilt against a light from the upper left */
	light?: boolean;
	/** hold every pose for N frames: 1 = smooth, 2 = on twos (a hand-made 15 fps flutter) */
	every?: number;
	/** cards burst out of the frame centre over `frames`, each `stagger` frames after the last (null = already in flight at frame 0) */
	enter?: {frames: number; stagger: number} | null;
	/** the hero card swings to a stop face-on at its depth `z` between frame `at` and `at + frames`, in a white-hot glow; the rest dim and soften. null = nobody lands */
	hero?: {index: number; at: number; frames: number; z: number} | null;
	/** screen-space camera over the whole Sequence: push (0.06 = 6 % bigger), roll in degrees, pan in px at 720p */
	camera?: {push?: number; roll?: number; pan?: readonly [number, number]};
	/** CSS background of the stage */
	background?: string;
};

// ---- default card faces -----------------------------------------------------------------------------------

const darkInk = (c: string) => [DEMO.paper, DEMO.yellow, DEMO.cyan].some((k) => k === c);

/** A flat designed card face: colour plate, hairline frame, one bold emblem, corner numbers. */
export const FlurryCardFace: React.FC<{index: number; color: string; w: number; h: number; fontFamily?: string}> = ({index, color, w, h, fontFamily = DISPLAY_FONT}) => {
	const fg = darkInk(color) ? DEMO.ink : DEMO.paper;
	const s = w * 0.3;
	const cx = w / 2;
	const cy = h / 2;
	const n = String(index + 1).padStart(2, '0');
	const emblem = [
		<g key="0">
			<circle cx={cx} cy={cy} r={s} fill="none" stroke={fg} strokeWidth={w * 0.05} />
			<circle cx={cx} cy={cy} r={s * 0.36} fill={fg} />
		</g>,
		<polygon key="1" points={`${cx},${cy - s} ${cx + s * 1.05},${cy + s * 0.8} ${cx - s * 1.05},${cy + s * 0.8}`} fill={fg} />,
		<g key="2">
			<polygon points={`${cx},${cy - s * 1.2} ${cx + s * 0.9},${cy} ${cx},${cy + s * 1.2} ${cx - s * 0.9},${cy}`} fill="none" stroke={fg} strokeWidth={w * 0.05} />
			<polygon points={`${cx},${cy - s * 0.5} ${cx + s * 0.38},${cy} ${cx},${cy + s * 0.5} ${cx - s * 0.38},${cy}`} fill={fg} />
		</g>,
		<g key="3" fill={fg}>
			<rect x={cx - s * 0.2} y={cy - s} width={s * 0.4} height={s * 2} />
			<rect x={cx - s} y={cy - s * 0.2} width={s * 2} height={s * 0.4} />
		</g>,
		<g key="4" fill={fg}>
			{[-0.7, 0, 0.7].map((o) => (
				<rect key={o} x={cx - s} y={cy + o * s - s * 0.14} width={s * 2} height={s * 0.28} />
			))}
		</g>,
	][index % 5];
	return (
		<div style={{position: 'absolute', inset: 0, background: color, borderRadius: 14, overflow: 'hidden'}}>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					opacity: 0.12,
					backgroundImage: `repeating-linear-gradient(-30deg, ${fg} 0 4px, transparent 4px 26px)`,
				}}
			/>
			<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{position: 'absolute', inset: 0}} aria-hidden>
				<rect x={12} y={12} width={w - 24} height={h - 24} rx={6} fill="none" stroke={fg} strokeWidth={3} opacity={0.9} />
				{emblem}
				<text x={26} y={60} fontFamily={fontFamily} fontSize={w * 0.17} fill={fg}>
					{n}
				</text>
				<text x={w - 26} y={h - 30} fontFamily={fontFamily} fontSize={w * 0.17} fill={fg} textAnchor="end">
					{n}
				</text>
			</svg>
		</div>
	);
};

/** Card back: pale plate with an ink lattice, frame and a diamond in the card's colour (turning cards flash light). */
export const FlurryCardBack: React.FC<{w: number; h: number; color?: string}> = ({w, h, color = DEMO.blue}) => (
	<div style={{position: 'absolute', inset: 0, background: '#ebe6da', borderRadius: 14, overflow: 'hidden'}}>
		<div
			style={{
				position: 'absolute',
				inset: 0,
				opacity: 0.22,
				backgroundImage: `repeating-linear-gradient(45deg, ${DEMO.ink} 0 2px, transparent 2px 22px), repeating-linear-gradient(-45deg, ${DEMO.ink} 0 2px, transparent 2px 22px)`,
			}}
		/>
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{position: 'absolute', inset: 0}} aria-hidden>
			<rect x={12} y={12} width={w - 24} height={h - 24} rx={6} fill="none" stroke={DEMO.ink} strokeWidth={3} />
			<polygon points={`${w / 2},${h / 2 - w * 0.3} ${w / 2 + w * 0.22},${h / 2} ${w / 2},${h / 2 + w * 0.3} ${w / 2 - w * 0.22},${h / 2}`} fill={color} stroke={DEMO.ink} strokeWidth={5} />
		</svg>
	</div>
);

// ---- card generator ---------------------------------------------------------------------------------------

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * `count` cards laid out on a sunflower spiral over the frame (so none pile up), depths shuffled between 560 and 1450,
 * hashed spin and drift. Everything follows from `seed`, so the same props give the same flurry. W, H are the stage in 720p units.
 */
export const makeFlurryCards = (opts: {
	count: number;
	seed: number;
	W: number;
	H: number;
	cardSize: readonly [number, number];
	colors: readonly string[];
	spin: number;
	drift: number;
	renderFace?: CardFlurryProps['renderFace'];
}): FlurryCard[] => {
	const {count, seed, W, H, cardSize, colors, spin, drift, renderFace} = opts;
	let step = 3;
	while (gcd(step, count) !== 1) {
		step++;
	}
	return Array.from({length: count}, (_, i) => {
		const r = Math.sqrt((i + 0.5) / count);
		const a = i * 2.39996 + seed * 1.3;
		const rank = (i * step + Math.floor(count / 2)) % count;
		const z = 560 + 890 * Math.pow(rank / Math.max(1, count - 1), 1.15);
		const sgn = (k: string) => (rnd(seed, k, i) < 0.5 ? -1 : 1);
		const color = colors[i % colors.length];
		const [w, h] = cardSize;
		const custom = renderFace?.(i, {w, h}, color) ?? null;
		return {
			front: custom ?? <FlurryCardFace index={i} color={color} w={w} h={h} />,
			back: <FlurryCardBack w={w} h={h} color={color} />,
			x: W / 2 + Math.cos(a) * r * W * 0.43 + (rnd(seed, 'jx', i) - 0.5) * 40,
			y: H / 2 + Math.sin(a) * r * H * 0.4 + (rnd(seed, 'jy', i) - 0.5) * 30,
			z,
			w,
			h,
			rx: (rnd(seed, 'rx', i) - 0.5) * 80,
			ry: (rnd(seed, 'ry', i) - 0.5) * 170,
			rz: (rnd(seed, 'rz', i) - 0.5) * 70,
			spin: [sgn('sx') * spin * (0.3 + rnd(seed, 'qx', i) * 0.45), sgn('sy') * spin * (0.6 + rnd(seed, 'qy', i) * 0.5), sgn('sz') * spin * (0.1 + rnd(seed, 'qz', i) * 0.3)],
			drift: [(rnd(seed, 'dx', i) - 0.5) * 2 * drift, (rnd(seed, 'dy', i) - 0.5) * 1.4 * drift, (rnd(seed, 'dz', i) - 0.5) * drift * 0.5],
		};
	});
};

// ---- component --------------------------------------------------------------------------------------------

const LIGHT: V3 = (() => {
	const v: V3 = [0.3, -0.5, -0.8];
	const l = Math.hypot(...v);
	return [v[0] / l, v[1] / l, v[2] / l];
})();

/**
 * About ten flat cards tumble through a 3D field and drift past the camera: each has its own spin, depth blur,
 * a back that shows when it turns away, and shading from a fixed light. One hero card can swing to a stop in a glow.
 * Starts at frame 0 of its <Sequence>.
 */
export const CardFlurry: React.FC<CardFlurryProps> = ({
	cards,
	count = 10,
	seed = 1,
	cardSize = [210, 300],
	colors = [DEMO.blue, DEMO.red, DEMO.yellow, DEMO.cyan, DEMO.paper],
	spin = 90,
	drift = 55,
	renderFace,
	depthBlur = 8,
	focusZ = 900,
	light = true,
	every = 1,
	enter = {frames: 16, stagger: 2},
	hero = {index: 0, at: 40, frames: 22, z: 760},
	camera = {},
	background = `radial-gradient(ellipse at 50% 45%, #1c1a4a 0%, #0e0d26 52%, ${DEMO.ink} 100%)`,
}) => {
	const frame = useCurrentFrame();
	const {width, height, fps, durationInFrames} = useVideoConfig();
	const u = useUnit();
	const W = width / u;
	const H = height / u;
	const cx = W / 2;
	const cy = H / 2;
	const focal = 1000;
	const list = useMemo(
		() => cards ?? makeFlurryCards({count, seed, W, H, cardSize, colors, spin, drift, renderFace}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[cards, count, seed, W, H, cardSize[0], cardSize[1], colors.join(','), spin, drift, renderFace],
	);
	const fq = stepped(frame, every);
	const t = fq / fps;
	const heroAll = hero ? progress(fq, hero.at, hero.frames, CURVES.quintOut) : 0;
	const heroLand = hero ? hero.at + hero.frames : 0;

	let heroCentre: P2 | null = null;
	const drawn = list.map((card, i) => {
		const isHero = hero !== null && hero.index === i;
		const e = enter ? progress(fq, i * enter.stagger, enter.frames, CURVES.expoOut) : 1;
		// a hero stops moving where it was when it starts to land
		const tm = isHero && hero ? Math.min(t, hero.at / fps) : t;
		let x = card.x + card.drift[0] * tm;
		let y = card.y + card.drift[1] * tm;
		let z = card.z + card.drift[2] * tm;
		let rx = card.rx + card.spin[0] * tm;
		let ry = card.ry + card.spin[1] * tm;
		let rz = card.rz + card.spin[2] * tm;
		// burst out of the centre, far away and spinning
		x = lerp(cx, x, e);
		y = lerp(cy, y, e);
		z += (1 - e) * 650;
		ry -= (1 - e) * 220;
		rz += (1 - e) * (i % 2 ? 80 : -80);
		if (isHero && hero) {
			const h = progress(fq, hero.at, hero.frames, CURVES.expoOut);
			const bob = Math.sin((fq - heroLand) * 0.11) * 3 * clamp01(h) * (fq >= heroLand ? 1 : 0);
			x = lerp(x, cx, h);
			y = lerp(y, cy - 8, h) + bob;
			z = lerp(z, hero.z, h);
			rx = lerp(rx, Math.round(rx / 360) * 360, h);
			ry = lerp(ry, Math.round(ry / 360) * 360, h);
			rz = lerp(rz, Math.round(rz / 360) * 360 - 3, h);
		}
		const plane: Plane = {x, y, z, w: card.w, h: card.h, rx, ry, rz};
		const proj = projectPlane(plane, cx, cy, focal);
		if (isHero) {
			heroCentre = [(proj.quad[0][0] + proj.quad[2][0]) / 2, (proj.quad[0][1] + proj.quad[2][1]) / 2];
		}
		return {card, i, isHero, e, plane, proj};
	});
	// far to near; the hero on top once it starts to land
	drawn.sort((a, b) => {
		const za = a.isHero && heroAll > 0.15 ? -1e6 : a.plane.z;
		const zb = b.isHero && heroAll > 0.15 ? -1e6 : b.plane.z;
		return zb - za;
	});

	const cp = progress(frame, 0, Math.max(1, durationInFrames - 1), (v) => v);
	const push = camera.push ?? 0.06;
	const roll = camera.roll ?? -2;
	const pan = camera.pan ?? [0, 0];
	const camT = `translate(${pan[0] * cp}px, ${pan[1] * cp}px) rotate(${roll * cp}deg) scale(${1 + push * cp})`;

	const glow = heroAll;
	const sinceLand = fq - heroLand;
	const flash = hero && sinceLand >= 0 && sinceLand < 5 ? (1 - sinceLand / 5) * 0.7 : 0;
	const hc: P2 = heroCentre ?? [cx, cy];

	return (
		<AbsoluteFill style={{background, overflow: 'hidden'}}>
			<div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', transform: `scale(${u})`}}>
				<div style={{position: 'absolute', inset: 0, transformOrigin: '50% 50%', transform: camT}}>
					{hero && glow > 0.01 ? (
						<div
							style={{
								position: 'absolute',
								left: hc[0] - 460,
								top: hc[1] - 460,
								width: 920,
								height: 920,
								background: `radial-gradient(circle, rgba(255,244,214,0.85) 0%, rgba(255,210,63,0.4) 22%, rgba(226,71,90,0.14) 45%, transparent 66%)`,
								opacity: glow,
								mixBlendMode: 'screen',
							}}
						/>
					) : null}
					{drawn.map(({card, i, isHero, e, plane, proj}) => {
						if (proj.area < 4) {
							return null;
						}
						const q: Quad = proj.front ? proj.quad : [proj.quad[1], proj.quad[0], proj.quad[3], proj.quad[2]];
						const vis: V3 = proj.front ? proj.normal : [-proj.normal[0], -proj.normal[1], -proj.normal[2]];
						const shade = clamp01(vis[0] * LIGHT[0] + vis[1] * LIGHT[1] + vis[2] * LIGHT[2]);
						const lit = light ? 0.6 + 0.5 * shade : 1;
						const depthDim = card.dim ?? lerp(0.55, 1, clamp01((plane.z - 520) / 520));
						const dimNow = isHero ? 1 : lerp(1, 0.6, heroAll);
						const bright = lit * (isHero ? lerp(depthDim, 1.08, heroAll) : depthDim * dimNow);
						const blurPx = isHero ? (card.blur ?? depthBlur * Math.abs(focusZ / plane.z - 1)) * (1 - heroAll) : (card.blur ?? depthBlur * Math.abs(focusZ / plane.z - 1)) + 2.4 * heroAll;
						const local = Math.sqrt(proj.area / (card.w * card.h));
						const localBlur = blurPx > 0.05 ? Math.min(60, blurPx / Math.max(0.08, local)) : 0;
						const filters = [localBlur ? `blur(${localBlur.toFixed(2)}px)` : '', `brightness(${bright.toFixed(3)})`].filter(Boolean).join(' ');
						const front = card.front ?? <FlurryCardFace index={i} color={colors[i % colors.length]} w={card.w} h={card.h} />;
						const back = card.back ?? <FlurryCardBack w={card.w} h={card.h} color={colors[i % colors.length]} />;
						return (
							<div
								key={i}
								style={{
									position: 'absolute',
									left: 0,
									top: 0,
									width: card.w,
									height: card.h,
									transformOrigin: '0 0',
									transform: homography(card.w, card.h, q),
									filter: filters,
									opacity: clamp01(e * 4),
								}}
							>
								{proj.front ? front : back}
							</div>
						);
					})}
					{flash > 0 ? (
						<div
							style={{
								position: 'absolute',
								left: hc[0] - 300,
								top: hc[1] - 300,
								width: 600,
								height: 600,
								background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 30%, transparent 62%)',
								opacity: flash,
								mixBlendMode: 'screen',
							}}
						/>
					) : null}
				</div>
			</div>
		</AbsoluteFill>
	);
};

// ---- demo -----------------------------------------------------------------------------------------------

const HeroFace: React.FC<{w: number; h: number}> = ({w, h}) => (
	<div style={{position: 'absolute', inset: 0, background: DEMO.yellow, borderRadius: 14, overflow: 'hidden'}}>
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{position: 'absolute', inset: 0}}>
			{Array.from({length: 14}, (_, k) => {
				const a = (k / 14) * Math.PI * 2;
				const b = ((k + 0.5) / 14) * Math.PI * 2;
				const R = h;
				return <polygon key={k} points={`${w / 2},${h * 0.5} ${w / 2 + Math.cos(a) * R},${h * 0.5 + Math.sin(a) * R} ${w / 2 + Math.cos(b) * R},${h * 0.5 + Math.sin(b) * R}`} fill={DEMO.red} opacity={0.9} />;
			})}
			<rect x={12} y={12} width={w - 24} height={h - 24} rx={6} fill="none" stroke={DEMO.ink} strokeWidth={4} />
			<circle cx={w / 2} cy={h / 2} r={w * 0.3} fill={DEMO.ink} />
			<text x={w / 2} y={h / 2 + w * 0.17} textAnchor="middle" fontFamily={DISPLAY_FONT} fontSize={w * 0.46} fill={DEMO.yellow}>
				A
			</text>
			<text x={26} y={60} fontFamily={DISPLAY_FONT} fontSize={w * 0.17} fill={DEMO.ink}>
				01
			</text>
			<text x={w - 26} y={h - 30} textAnchor="end" fontFamily={DISPLAY_FONT} fontSize={w * 0.17} fill={DEMO.ink}>
				01
			</text>
		</svg>
	</div>
);

const Demo: React.FC = () => <CardFlurry renderFace={(i, {w, h}) => (i === 0 ? <HeroFace w={w} h={h} /> : null)} />;

export const cardFlurryEntry: LibraryEntry = {
	meta: {
		id: 'card-flurry',
		title: 'Card flurry',
		category: 'camera',
		looks: 'Ten cards burst out of the centre and tumble through a 3D field, near ones dark and soft, backs flashing as they turn; one swings to a stop face-on in a glow.',
		use: 'Gacha pulls, character rosters, deck and inventory reveals; any "many things, then the one" beat.',
		exportName: 'CardFlurry',
		durationInFrames: 96,
		source: {kind: 'original'},
	},
	Demo,
};
