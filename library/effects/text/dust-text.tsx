// Ported from WebGPU-clair-obscur-gommage-codrops (https://github.com/WallabyMonochrome/WebGPU-clair-obscur-gommage-codrops/blob/master/src/dustParticles.js, with petalParticles.js, msdfText.js and gommageOrchestrator.js), MIT, Copyright (c) 2009 - 2025 Codrops (https://codrops.com). Changes: the TSL node graphs became plain maths evaluated from the frame (the dust is a seeded particle list: birth = hash-scheduled along the dissolve, position = birth point + wind * age + rise * age^2 + a small swirl, grow-in and fade-out as in the source); the MSDF text and perlin-texture dissolve became DOM text with a makeShaderEffect noise-threshold dissolve (our own value-noise field instead of the perlin texture, same threshold test and the same grey desaturation over the first 45 %); dust is born on the glyph pixels that are dissolving at that moment (a canvas mask of the same text, no fonts or textures from the repo); particles are SVG rects, petals are rotating leaf shapes instead of the glTF petal; sizes in px at 720p.
import React, {useEffect, useId, useMemo, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Filter} from '../../core/filter';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {DISSOLVE_GLSL, dissolveField, rnd} from './_codrops-utils';

type Vec3 = readonly [number, number, number];

export type DustTextProps = {
	text: string;
	/** frame (of the surrounding Sequence) on which the dissolve starts; before it the word is intact */
	delay?: number;
	/** frames the glyphs take to dissolve completely (the threshold ramps 0 -> 1 linearly, as in the source) */
	duration?: number;
	/** px at 720p */
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number | string;
	/** px at 720p */
	letterSpacing?: number;
	color?: string;
	/** colour the glyphs drain to while they dissolve (the source desaturates to ash grey over the first 45 %); null = keep `color` */
	ashColor?: string | null;
	dustColor?: string;
	/** number of dust quads over the whole dissolve */
	particleCount?: number;
	/** side of the biggest dust quad, px at 720p */
	dustSize?: number;
	/** frames a dust quad lives (each gets 80..120 % of it) */
	life?: number;
	/** px at 720p a quad is blown sideways over its life: negative = left like the source, positive = right */
	wind?: number;
	/** px at 720p a quad lifts over its life, accelerating (grows with age squared) */
	rise?: number;
	/** rotating leaf-shaped petals that come off with the dust and live 1.25x as long (0 = none) */
	petals?: number;
	petalColor?: string;
	/** every third petal takes this colour instead (the source mixes red and white) */
	petalAltColor?: string;
	/** length of a petal, px at 720p */
	petalSize?: number;
	/** integer that re-rolls the dissolve pattern, the dust and the petals */
	seed?: number;
	/** centre of the word as shares of the frame */
	anchor?: readonly [number, number];
	style?: React.CSSProperties;
};

const hex = (color: string): Vec3 => {
	let h = color.trim().replace('#', '');
	if (h.length === 3) {
		h = h
			.split('')
			.map((c) => c + c)
			.join('');
	}
	const n = parseInt(h.slice(0, 6), 16);
	return Number.isNaN(n) ? [1, 1, 1] : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const shade = (c: Vec3, k: number): string =>
	`rgb(${Math.round(Math.min(1, c[0] * k) * 255)},${Math.round(Math.min(1, c[1] * k) * 255)},${Math.round(Math.min(1, c[2] * k) * 255)})`;

const smoothstep = (a: number, b: number, x: number): number => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------------
// the dissolve: a noise threshold on the glyphs (alpha * step(progress, noise), softened)
// ---------------------------------------------------------------------------------------------

/** soft edge of the threshold, as a share of the 0..1 ramp */
const SOFT = 0.07;

const dissolveFx = makeShaderEffect({
	type: 's17-dust-dissolve',
	label: 'Dust dissolve',
	body: `
uniform float progress;
uniform float feature;
uniform float seed;
uniform float soft;
uniform float ashAmount;
uniform vec3 ash;
${DISSOLVE_GLSL}
vec4 effect(vec2 uv) {
	vec4 src = getColor(uv);
	if (src.a <= 0.0) {
		return src;
	}
	float un = min(resolution.x, resolution.y) / 720.0;
	vec2 p720 = vec2(uv.x * resolution.x, (1.0 - uv.y) * resolution.y) / un;
	float nz = dissolveField(p720, feature, uint(max(seed, 0.0)));
	float p0 = progress * (1.0 + soft) - soft;
	float vis = smoothstep(p0, p0 + soft, nz);
	vec3 straight = mix(src.rgb / src.a, ash, ashAmount);
	return vec4(straight * src.a * vis, src.a * vis);
}`,
	defaults: {progress: 0, feature: 44, seed: 1, soft: SOFT, ashAmount: 0, ash: [0.37, 0.37, 0.37] as Vec3},
});

// ---------------------------------------------------------------------------------------------
// text metrics + a canvas mask of the glyphs, sorted by dissolve time: where the dust is born
// ---------------------------------------------------------------------------------------------

type TextBox = {width: number; baseline: number};
type Mask = {
	/** x, y (px of the composition, from the top-left), dissolve time; sorted by dissolve time */
	pts: Float32Array;
	count: number;
	step: number;
};

let ctx2d: CanvasRenderingContext2D | null | undefined;
const getCtx = (): CanvasRenderingContext2D | null => {
	if (ctx2d === undefined) {
		ctx2d = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d', {willReadFrequently: true});
	}
	return ctx2d;
};

const setFont = (c: CanvasRenderingContext2D, weight: number | string, size: number, family: string, letterSpacing: number) => {
	c.font = `${weight} ${size}px ${family}`;
	(c as unknown as {letterSpacing: string}).letterSpacing = `${letterSpacing}px`;
};

const measureBox = (text: string, weight: number | string, size: number, family: string, letterSpacing: number): TextBox => {
	const c = getCtx();
	if (!c) {
		return {width: text.length * size * 0.6, baseline: size * 0.85};
	}
	setFont(c, weight, size, family, letterSpacing);
	const m = c.measureText(text);
	const asc = m.fontBoundingBoxAscent ?? size * 0.9;
	const desc = m.fontBoundingBoxDescent ?? size * 0.25;
	// a line box of height `size` (line-height: 1): the baseline sits half the leading below its top plus the ascent
	return {width: m.width, baseline: (size - (asc + desc)) / 2 + asc};
};

const maskCache = new Map<string, Mask>();

const buildMask = (a: {
	text: string;
	weight: number | string;
	size: number;
	family: string;
	letterSpacing: number;
	box: TextBox;
	left: number;
	top: number;
	u: number;
	feature: number;
	seed: number;
	key: string;
}): Mask => {
	const hit = maskCache.get(a.key);
	if (hit) {
		return hit;
	}
	const c = getCtx();
	const empty: Mask = {pts: new Float32Array(0), count: 0, step: 2};
	if (!c) {
		return empty;
	}
	const pad = Math.ceil(a.size * 0.2) + 2;
	const cw = Math.ceil(a.box.width) + pad * 2;
	const chh = Math.ceil(a.size) + pad * 2;
	c.canvas.width = cw;
	c.canvas.height = chh;
	c.clearRect(0, 0, cw, chh);
	setFont(c, a.weight, a.size, a.family, a.letterSpacing);
	c.fillStyle = '#ffffff';
	c.textBaseline = 'alphabetic';
	c.fillText(a.text, pad, pad + a.box.baseline);
	const data = c.getImageData(0, 0, cw, chh).data;
	const step = Math.max(2, Math.round(Math.sqrt((cw * chh) / 45000)));
	const xs: number[] = [];
	const ys: number[] = [];
	const zs: number[] = [];
	for (let y = 0; y < chh; y += step) {
		for (let x = 0; x < cw; x += step) {
			if (data[(y * cw + x) * 4 + 3] > 110) {
				const px = a.left - pad + x;
				const py = a.top - pad + y;
				xs.push(px);
				ys.push(py);
				zs.push(dissolveField(px / a.u, py / a.u, a.feature, a.seed));
			}
		}
	}
	const order = xs.map((_, i) => i).sort((p, q) => zs[p] - zs[q]);
	const pts = new Float32Array(order.length * 3);
	order.forEach((src, i) => {
		pts[i * 3] = xs[src];
		pts[i * 3 + 1] = ys[src];
		pts[i * 3 + 2] = zs[src];
	});
	const mask: Mask = {pts, count: order.length, step};
	maskCache.set(a.key, mask);
	return mask;
};

/** first index whose dissolve time is >= t */
const lowerBound = (m: Mask, t: number): number => {
	let lo = 0;
	let hi = m.count;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (m.pts[mid * 3 + 2] < t) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	return lo;
};

// ---------------------------------------------------------------------------------------------
// particles: a pure list, each one a function of (frame - birth)
// ---------------------------------------------------------------------------------------------

type Particle = {
	x0: number;
	y0: number;
	birth: number;
	life: number;
	/** 0.5..1 size share (the source's per-instance scale) */
	scale: number;
	/** share of the rise this one gets (the source clamps its noise to 0.3..1) */
	lift: number;
	phase: number;
	swirl: number;
	rot: number;
	spin: number;
	/** 0..1 random for opacity / colour picks */
	tone: number;
};

const makeParticles = (
	m: Mask,
	count: number,
	salt: number,
	o: {delay: number; duration: number; life: number; seed: number},
): Particle[] => {
	const out: Particle[] = [];
	if (m.count === 0) {
		return out;
	}
	for (let i = 0; i < count; i++) {
		const r = (k: number) => rnd(o.seed, salt + i, k);
		// born along the dissolve: the share of the ramp already gone at that moment picks which pixels are vanishing
		const pb = (i + r(1)) / count;
		const front = pb * (1 + SOFT) - SOFT;
		const lo = lowerBound(m, Math.max(0, front - 0.06));
		const hi = Math.max(lo + 1, lowerBound(m, front + 0.02));
		const idx = Math.min(m.count - 1, lo + Math.floor(r(2) * (hi - lo)));
		out.push({
			x0: m.pts[idx * 3] + (r(3) - 0.5) * m.step,
			y0: m.pts[idx * 3 + 1] + (r(4) - 0.5) * m.step,
			birth: o.delay + pb * o.duration,
			life: o.life * (0.8 + 0.4 * r(5)),
			scale: 0.5 + 0.5 * r(6),
			lift: 0.3 + 0.7 * r(7),
			phase: r(8) * Math.PI * 2,
			swirl: 0.4 + 0.6 * r(9),
			rot: r(10) * 360,
			spin: (r(11) - 0.5) * 6,
			tone: r(12),
		});
	}
	return out;
};

/** font loading is asynchronous for web fonts: hold the render until the face is in, then rebuild the mask once */
const useFontRev = (font: string, text: string): number => {
	const [rev, setRev] = useState(0);
	useEffect(() => {
		if (typeof document === 'undefined' || !document.fonts) {
			return undefined;
		}
		const handle = delayRender('dust-text: fonts');
		let released = false;
		const release = () => {
			if (!released) {
				released = true;
				setRev((r) => r + 1);
				continueRender(handle);
			}
		};
		document.fonts.load(font, text).then(release, release);
		return release;
	}, [font, text]);
	return rev;
};

const LEAF = 'M0 -1 C0.75 -0.55 0.75 0.45 0 1 C-0.75 0.45 -0.75 -0.55 0 -1 Z';

/**
 * A word that dissolves into ash: the glyphs fade away through a noise threshold (they drain to grey as they go) while small
 * dust quads are born on the pixels that are vanishing, drift sideways with the wind, rise and fade. Optional rotating petals.
 * The word is centred on `anchor`, single line. Starts at frame 0 of its <Sequence>; `delay` holds the intact word first.
 */
export const DustText: React.FC<DustTextProps> = ({
	text,
	delay = 0,
	duration = 60,
	fontSize = 200,
	fontFamily = DISPLAY_FONT,
	fontWeight = 400,
	letterSpacing = 0,
	color = DEMO.paper,
	ashColor = '#5e5e5e',
	dustColor = '#8a8a8a',
	particleCount = 260,
	dustSize = 6,
	life = 54,
	wind = -150,
	rise = 90,
	petals = 0,
	petalColor = '#9b0000',
	petalAltColor = '#eeeeee',
	petalSize = 16,
	seed = 1,
	anchor = [0.5, 0.5],
	style,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	const size = fontSize * u;
	const ls = letterSpacing * u;
	const rev = useFontRev(`${fontWeight} ${size}px ${fontFamily}`, text);
	const haze = `dust-haze-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

	const box = useMemo(() => measureBox(text, fontWeight, size, fontFamily, ls), [text, fontWeight, size, fontFamily, ls, rev]);
	const left = width * anchor[0] - box.width / 2;
	const top = height * anchor[1] - size / 2;
	const feature = Math.max(8, fontSize * 0.22);

	const mask = useMemo(
		() =>
			buildMask({
				text,
				weight: fontWeight,
				size,
				family: fontFamily,
				letterSpacing: ls,
				box,
				left,
				top,
				u,
				feature,
				seed,
				key: [rev, text, fontWeight, fontFamily, size.toFixed(2), ls.toFixed(2), left.toFixed(1), top.toFixed(1), feature, seed].join('|'),
			}),
		[text, fontWeight, fontFamily, size, ls, box, left, top, u, feature, seed, rev],
	);
	const dust = useMemo(
		() => makeParticles(mask, Math.max(0, Math.round(particleCount)), 0, {delay, duration, life, seed}),
		[mask, particleCount, delay, duration, life, seed],
	);
	const leaves = useMemo(
		() => makeParticles(mask, Math.max(0, Math.round(petals)), 100000, {delay, duration, life: life * 1.25, seed}),
		[mask, petals, delay, duration, life, seed],
	);

	const progress = interpolate(frame, [delay, delay + Math.max(1, duration)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const ash = ashColor === null ? hex(color) : hex(ashColor);
	const dustRgb = hex(dustColor);
	const petalRgb = hex(petalColor);
	const altRgb = hex(petalAltColor);

	const dustRects: React.ReactNode[] = [];
	dust.forEach((p, i) => {
		const age = frame - p.birth;
		const a = age / p.life;
		if (a < 0 || a >= 1) {
			return;
		}
		const x = p.x0 + wind * u * a + Math.sin(p.phase + age * 0.18) * 14 * u * p.swirl * a;
		const y = p.y0 - rise * u * p.lift * a * a + Math.cos(p.phase * 1.7 + age * 0.15) * 8 * u * p.swirl * a;
		// ~1 in 4 quads is a big soft sprite (the source textures its quads with a soft dot): a haze between the hard crumbs
		const hazy = p.tone < 0.28;
		const s = dustSize * u * p.scale * (hazy ? 2.6 : 1) * smoothstep(0, 0.05, a);
		const fade = 1 - smoothstep(0.8, 1, a);
		dustRects.push(
			<rect
				key={i}
				x={-s / 2}
				y={-s / 2}
				width={s}
				height={hazy ? s : s * (0.7 + 0.3 * p.tone)}
				rx={hazy ? 0 : s * 0.22}
				fill={hazy ? `url(#${haze})` : shade(dustRgb, 0.85 + 0.3 * p.tone)}
				opacity={hazy ? 0.55 * fade : (0.65 + 0.3 * p.tone) * fade}
				transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(p.rot + p.spin * age).toFixed(1)})`}
			/>,
		);
	});
	const petalPaths: React.ReactNode[] = [];
	leaves.forEach((p, i) => {
		const age = frame - p.birth;
		const a = age / p.life;
		if (a < 0 || a >= 1) {
			return;
		}
		const x = p.x0 + wind * 1.3 * u * a + Math.sin(p.phase + age * 0.12) * 26 * u * p.swirl * a;
		const y = p.y0 - rise * 0.8 * u * p.lift * a * a + Math.cos(p.phase * 1.7 + age * 0.1) * 14 * u * p.swirl * a;
		const half = (petalSize * u * p.scale * smoothstep(0, 0.05, a)) / 2;
		const flip = Math.cos(p.phase + age * (0.16 + 0.1 * p.tone));
		const facing = Math.min(1, Math.max(0.4, Math.abs(flip)));
		const opacity = 1 - smoothstep(0.8, 1, a);
		const base = i % 3 === 0 ? altRgb : petalRgb;
		petalPaths.push(
			<path
				key={i}
				d={LEAF}
				fill={shade(base, facing)}
				opacity={opacity}
				transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(p.rot + p.spin * age * 1.6).toFixed(1)}) skewX(${(Math.sin(p.phase + age * 0.2) * 18).toFixed(1)}) scale(${(half * 0.9 * flip).toFixed(3)} ${half.toFixed(3)})`}
			/>,
		);
	});

	return (
		<AbsoluteFill>
			<Filter
				effects={[
					dissolveFx({
						progress,
						feature,
						seed,
						soft: SOFT,
						ashAmount: ashColor === null ? 0 : smoothstep(0, 0.45, progress),
						ash,
					}),
				]}
			>
				<div
					style={{
						position: 'absolute',
						left,
						top,
						fontFamily,
						fontWeight,
						fontSize: size,
						lineHeight: `${size}px`,
						letterSpacing: ls,
						whiteSpace: 'nowrap',
						color,
						...style,
					}}
				>
					{text}
				</div>
			</Filter>
			<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', left: 0, top: 0}}>
				<defs>
					<radialGradient id={haze}>
						<stop offset="0" stopColor={shade(dustRgb, 1)} stopOpacity="0.9" />
						<stop offset="0.5" stopColor={shade(dustRgb, 1)} stopOpacity="0.4" />
						<stop offset="1" stopColor={shade(dustRgb, 1)} stopOpacity="0" />
					</radialGradient>
				</defs>
				{dustRects}
				{petalPaths}
			</svg>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		<AbsoluteFill style={{background: 'radial-gradient(circle at 50% 46%, #1d1a26 0%, #0b0b10 62%)'}} />
		<DustText
			text="ASHFALL"
			fontSize={200}
			delay={14}
			duration={44}
			life={32}
			particleCount={800}
			dustSize={8}
			petals={56}
			petalSize={24}
			wind={-170}
			rise={100}
			seed={7}
		/>
	</Backdrop>
);

export const dustTextEntry: LibraryEntry = {
	meta: {
		id: 'dust-text',
		title: 'Dust text',
		category: 'text',
		looks: 'A word drains to grey and crumbles through a noise threshold while small dust quads (and optional red petals) are born where the letters vanish, drift on the wind, rise and fade out.',
		use: 'A title or name that must die, fade from memory or be "taken": a character farewell, a chapter end, a countdown to nothing; hold the intact word first with delay.',
		exportName: 'DustText',
		durationInFrames: 120,
		source: {
			kind: 'ported',
			name: 'WebGPU-clair-obscur-gommage-codrops',
			url: 'https://github.com/WallabyMonochrome/WebGPU-clair-obscur-gommage-codrops/blob/master/src/dustParticles.js',
			license: 'MIT',
		},
	},
	Demo,
};
