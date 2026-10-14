import React, {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {BODY_FONT, DEMO, Plate, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {hash, useSafeId} from './_hits-utils';

/* ------------------------------------------------------------------------------------------------
 * ScreenTexture: the cheap finishing pass for a whole picture, DOM + one 2D canvas, no WebGL.
 * Grain: one small canvas of seeded integer-hash noise (the stepped-seed idea comes from the author's own film grain from a finished PV
 * project), overlaid; scanlines, vignette, warm corners and lens dirt are written fresh.
 * Everything is a pure function of the frame; grain can be held so still frames stay identical. The noise is made
 * at 720p-equivalent size whatever the render size, so it costs the same at 4K as at 720p.
 * ---------------------------------------------------------------------------------------------- */

export type ScreenTextureProps = {
	/** grain opacity (overlay blend), 0 = off. Film-like values are 0.06-0.15 */
	grain?: number;
	/** grain coarseness: 1 = fine, 2 = twice as coarse */
	grainSize?: number;
	/** hold each grain pattern for this many frames (1 = new grain every frame, 2 = half the frame rate, 4 = stuttery) */
	grainEvery?: number;
	/** scanline opacity, 0 = off. 0.08-0.18 reads as a screen, more as a gimmick */
	scanlines?: number;
	/** distance between scanlines, px at 720p */
	scanSpacing?: number;
	/** px per frame the lines crawl down (0 = fixed) */
	scanScroll?: number;
	/** 'soft' = alternating darker and lighter bands (overlay), 'hard' = thin dark lines */
	scanStyle?: 'soft' | 'hard';
	/** vignette strength 0..1, 0 = off */
	vignette?: number;
	/** where the vignette starts, % of the radius */
	vignetteInner?: number;
	/** vignette colour: black for a lens, deep blue or brown for a mood */
	vignetteColor?: string;
	/** warm falloff in the lower corners (screen blend), 0..1, 0 = off */
	warm?: number;
	warmColor?: string;
	/** lens dirt (blobs, specks and aperture hexagons, screen blend), 0..1, 0 = off */
	dirt?: number;
	dirtColor?: string;
	/** changes the grain sequence and the dirt layout */
	seed?: number;
	/** optional picture underneath, so the pack can wrap a scene instead of overlaying it */
	children?: React.ReactNode;
};

/** 32-bit integer hash (lowbias32): the same input gives the same output on every machine, unlike a sin() hash. */
const mix32 = (n: number): number => {
	let x = n | 0;
	x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
	x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
	return (x ^ (x >>> 16)) >>> 0;
};

/** Fills a canvas with grey noise centred on mid-grey (the neutral value of an overlay blend). */
const paintGrain = (canvas: HTMLCanvasElement, w: number, h: number, key: number): void => {
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		return;
	}
	const img = ctx.createImageData(w, h);
	const px = new Uint32Array(img.data.buffer);
	const base = mix32(key);
	for (let i = 0; i < px.length; i++) {
		const r = mix32(base + Math.imul(i, 0x9e3779b1));
		// three bytes of one hash, averaged: bell-shaped grain, widened a little so it reads at low opacity
		const g = 0.5 + ((((r & 255) + ((r >>> 8) & 255) + ((r >>> 16) & 255)) / 765) - 0.5) * 1.35;
		const v = Math.max(0, Math.min(255, Math.round(g * 255)));
		px[i] = 0xff000000 | (v << 16) | (v << 8) | v;
	}
	ctx.putImageData(img, 0, 0);
};

const Grain: React.FC<{opacity: number; size: number; every: number; seed: number; u: number}> = ({opacity, size, every, seed, u}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const ref = useRef<HTMLCanvasElement>(null);
	const step = Math.floor(frame / Math.max(1, every));
	// one noise pixel = `size` px at 720p, so the canvas is the same resolution at any render size
	const cell = Math.max(0.5, size) * u;
	const w = Math.max(1, Math.ceil(width / cell));
	const h = Math.max(1, Math.ceil(height / cell));
	const key = Math.imul(step + 1, 0x9e3779b1) ^ Math.imul(Math.round(seed * 1000) + 11, 0x85ebca6b);
	useLayoutEffect(() => {
		if (ref.current) {
			paintGrain(ref.current, w, h, key);
		}
	}, [w, h, key]);
	return (
		<AbsoluteFill style={{mixBlendMode: 'overlay', opacity}}>
			<canvas ref={ref} width={w} height={h} style={{display: 'block', width: '100%', height: '100%'}} />
		</AbsoluteFill>
	);
};

const Scanlines: React.FC<{opacity: number; spacing: number; scroll: number; mode: 'soft' | 'hard'; u: number}> = ({opacity, spacing, scroll, mode, u}) => {
	const frame = useCurrentFrame();
	const sp = Math.max(2, spacing) * u;
	const shift = scroll === 0 ? 0 : (frame * scroll * u) % sp;
	const soft = mode === 'soft';
	return (
		<AbsoluteFill
			style={{
				top: -sp,
				transform: `translateY(${shift}px)`,
				mixBlendMode: soft ? 'overlay' : 'normal',
				opacity,
				backgroundImage: soft
					? `repeating-linear-gradient(to bottom, #000 0, #fff ${sp / 2}px, #000 ${sp}px)`
					: `repeating-linear-gradient(to bottom, #000 0, #000 ${Math.max(1, sp * 0.34)}px, transparent ${Math.max(1, sp * 0.34)}px, transparent ${sp}px)`,
			}}
		/>
	);
};

const Vignette: React.FC<{strength: number; inner: number; color: string}> = ({strength, inner, color}) => (
	<AbsoluteFill
		style={{
			opacity: Math.min(1, strength),
			background: `radial-gradient(ellipse 74% 80% at 50% 50%, transparent ${inner}%, color-mix(in srgb, ${color} 28%, transparent) ${(inner + 100) / 2}%, ${color} 100%)`,
		}}
	/>
);

/** Hot glow in the two lower corners: a pale core, the tint, then a quick falloff (screen blend, so it only ever adds light). */
const Warm: React.FC<{amount: number; color: string}> = ({amount, color}) => {
	const core = `color-mix(in srgb, ${color} 45%, white)`;
	const tail = `color-mix(in srgb, ${color} 30%, transparent)`;
	const glow = (x: number) => `radial-gradient(ellipse 50% 56% at ${x}% 100%, ${core} 0%, ${color} 26%, ${tail} 58%, transparent 100%)`;
	return (
		<AbsoluteFill
			style={{
				mixBlendMode: 'screen',
				opacity: Math.min(1, amount),
				background: `${glow(0)}, ${glow(100)}`,
			}}
		/>
	);
};

const Dirt: React.FC<{amount: number; color: string; seed: number}> = ({amount, color, seed}) => {
	const {width, height} = useVideoConfig();
	const id = useSafeId('dirt');
	const hexId = useSafeId('hex');
	const u = Math.min(width, height) / 720;
	// dirt gathers towards the frame edge, like on a real lens: a random angle and a radius that leaves the middle clear
	const around = (a: number, b: number, lo: number): {x: number; y: number} => {
		const ang = hash(a) * Math.PI * 2;
		const rad = lo + hash(b) * (0.62 - lo);
		return {x: width * (0.5 + Math.cos(ang) * rad), y: height * (0.5 + Math.sin(ang) * rad)};
	};
	const blobs = Array.from({length: 10}, (_, i) => ({
		...around(seed * 3.1 + i * 1.9, seed * 5.3 + i * 2.7, 0.22),
		r: (70 + hash(seed + i * 4.1) * 190) * u,
		o: 0.08 + hash(seed + i * 6.3) * 0.17,
	}));
	const specks = Array.from({length: 90}, (_, i) => ({
		x: hash(seed * 7.7 + i * 1.3) * width,
		y: hash(seed * 9.1 + i * 2.1) * height,
		r: (0.8 + hash(seed + i * 3.7) ** 2 * 5) * u,
		o: 0.15 + hash(seed + i * 5.1) * 0.5,
	}));
	const hexes = Array.from({length: 6}, (_, i) => {
		const {x: cx, y: cy} = around(seed * 2.3 + i * 8.1, seed * 4.7 + i * 6.9, 0.34);
		const r = (30 + hash(seed + i * 9.9) * 62) * u;
		const rot = hash(seed + i * 1.1) * 60;
		const pts = Array.from({length: 6}, (_, k) => {
			const a = ((rot + k * 60) * Math.PI) / 180;
			return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
		}).join(' ');
		return {pts, o: 0.55 + hash(seed + i * 7.3) * 0.45};
	});
	return (
		<AbsoluteFill style={{mixBlendMode: 'screen', opacity: Math.min(1, amount)}}>
			<svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{display: 'block'}}>
				<defs>
					<radialGradient id={id}>
						<stop offset="0" stopColor={color} stopOpacity="1" />
						<stop offset="0.55" stopColor={color} stopOpacity="0.35" />
						<stop offset="1" stopColor={color} stopOpacity="0" />
					</radialGradient>
					{/* aperture ghosts: clear in the middle, brighter towards the rim, like a real lens */}
					<radialGradient id={hexId}>
						<stop offset="0" stopColor={color} stopOpacity="0.07" />
						<stop offset="0.62" stopColor={color} stopOpacity="0.16" />
						<stop offset="1" stopColor={color} stopOpacity="0.5" />
					</radialGradient>
				</defs>
				{blobs.map((b, i) => (
					<circle key={`b${i}`} cx={b.x} cy={b.y} r={b.r} fill={`url(#${id})`} opacity={b.o} />
				))}
				{hexes.map((h, i) => (
					<polygon key={`h${i}`} points={h.pts} fill={`url(#${hexId})`} opacity={h.o} />
				))}
				{specks.map((s, i) => (
					<circle key={`s${i}`} cx={s.x} cy={s.y} r={s.r} fill={color} opacity={s.o} />
				))}
			</svg>
		</AbsoluteFill>
	);
};

/**
 * Scanlines, vignette, grain, warm corners and lens dirt in one overlay. Put it over the picture (or give it children).
 * Defaults are a restrained film look: fine stepped grain, a soft vignette and faint screen lines.
 */
export const ScreenTexture: React.FC<ScreenTextureProps> = ({
	grain = 0.1,
	grainSize = 1,
	grainEvery = 2,
	scanlines = 0.12,
	scanSpacing = 4,
	scanScroll = 0.5,
	scanStyle = 'soft',
	vignette = 0.55,
	vignetteInner = 45,
	vignetteColor = '#000000',
	warm = 0,
	warmColor = '#ff5a2a',
	dirt = 0,
	dirtColor = '#fff1d6',
	seed = 1,
	children,
}) => {
	const u = useUnit();
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			{children ? <AbsoluteFill>{children}</AbsoluteFill> : null}
			{dirt > 0 ? <Dirt amount={dirt} color={dirtColor} seed={seed} /> : null}
			{vignette > 0 ? <Vignette strength={vignette} inner={vignetteInner} color={vignetteColor} /> : null}
			{warm > 0 ? <Warm amount={warm} color={warmColor} /> : null}
			{scanlines > 0 ? <Scanlines opacity={scanlines} spacing={scanSpacing} scroll={scanScroll} mode={scanStyle} u={u} /> : null}
			{grain > 0 ? <Grain opacity={grain} size={grainSize} every={grainEvery} seed={seed} u={u} /> : null}
		</AbsoluteFill>
	);
};

/* ------------------------------------------------------------------------------------------------ demo */

const ramp = (frame: number, at: number): number =>
	interpolate(frame, [at, at + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

/** Layers come in one by one so each stage of the pack is visible in the preview strip. */
const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const stages = [
		{at: 15, name: 'VIGNETTE'},
		{at: 30, name: 'GRAIN'},
		{at: 45, name: 'SCANLINES'},
		{at: 60, name: 'WARM'},
		{at: 75, name: 'LENS DIRT'},
	];
	const on = stages.filter((s) => frame >= s.at).map((s) => s.name);
	return (
		<AbsoluteFill>
			<Plate />
			<ScreenTexture
				vignette={0.7 * ramp(frame, 15)}
				grain={0.15 * ramp(frame, 30)}
				scanlines={0.18 * ramp(frame, 45)}
				scanScroll={0.6}
				warm={0.7 * ramp(frame, 60)}
				dirt={0.8 * ramp(frame, 75)}
				seed={4}
			/>
			<div
				style={{
					position: 'absolute',
					// own compositor layer from the start: a label with a fractional text width otherwise gets its layer
						// promoted late in about one render in ten, which shifts its right edge by a hair
					willChange: 'transform',
					right: 40 * u,
					bottom: 36 * u,
					padding: `${8 * u}px ${16 * u}px`,
					background: DEMO.ink,
					color: DEMO.paper,
					fontFamily: BODY_FONT,
					fontWeight: 800,
					fontSize: 20 * u,
					letterSpacing: 4 * u,
				}}
			>
				{on.length > 0 ? on.join(' + ') : 'CLEAN'}
			</div>
		</AbsoluteFill>
	);
};

export const screenTextureEntry: LibraryEntry = {
	meta: {
		id: 'screen-texture',
		title: 'Screen texture',
		category: 'fx',
		looks:
			'Stepped film grain (a new pattern every 2nd frame), soft or hard scanlines that crawl, a radial vignette, warm lower-corner falloff and optional lens dirt, as one DOM overlay; the demo adds one layer at a time.',
		use: 'The last layer over a whole sequence to glue it together; heavier settings for CRT / found-footage moments.',
		exportName: 'ScreenTexture',
		durationInFrames: 90,
		source: {kind: 'original'},
	},
	Demo,
};
