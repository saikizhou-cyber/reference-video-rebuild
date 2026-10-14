import React from 'react';
import {AbsoluteFill, Freeze, useCurrentFrame, useVideoConfig} from 'remotion';
import {BODY_FONT, DEMO, DISPLAY_FONT} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp, hash} from './_hits-utils';

/* ------------------------------------------------------------------------------------------------
 * SliceGlitch: compression-style row-band datamosh for 1-3 frames (a cut, a hit, a corrupted beat).
 * Generalised from the author's own datamosh from a finished PV project (rowSlices / blockSlices / ShotGlitch):
 * the picture is re-rendered through clipped bands, each band shifted / stretched sideways and showing a
 * neighbouring frame of the wrapped tree. Everything is a pure function of the frame and the seed.
 * All sizes are authored in 720p units and scaled to the composition.
 * ---------------------------------------------------------------------------------------------- */

export type GlitchSlice = {
	/** band top and height, 720p units */
	y: number;
	h: number;
	/** horizontal limits of the band, 720p units (default: full width) */
	x0?: number;
	x1?: number;
	/** sideways shift in 720p px and horizontal stretch about `ox` */
	dx: number;
	sx?: number;
	ox?: number;
	/** which frame of the wrapped tree the band shows, relative to now (0 = this frame, -2, +2 ...) */
	from?: number;
	/** extra brightness of the band (0.3 = +30 %), for smeared highlights */
	bright?: number;
};

export type GlitchKind = 'rows' | 'blocks' | 'tear' | 'mix';

export type GlitchEvent = {
	/** first glitched frame (frame number inside the surrounding <Sequence>) */
	at: number;
	/** how many frames it lasts; 1-3 reads as a glitch, more reads as a broken signal */
	frames?: number;
	/** rows = 4-40 px bands shifted and stretched; blocks = 8-32 px macroblocks; tear = thin hard tears; mix = all three */
	kind?: GlitchKind;
	/** 0.5 = light, 1 = default, 1.5 = heavy */
	intensity?: number;
	seed?: number;
};

type Box = {x0: number; y0: number; x1: number; y1: number};

type RowOpts = Partial<Box> & {
	seed: number;
	/** share of the region's height that gets displaced, 0..1 (default 0.55) */
	density?: number;
	minH?: number;
	maxH?: number;
	/** min / max sideways shift in px (default [20, 300]) */
	shift?: [number, number];
	/** max extra horizontal stretch, 0.6 = up to x1.6 (default 0.6) */
	stretch?: number;
	/** frames (relative) a band may come from, e.g. [-2, 2] */
	offsets?: number[];
	/** -0.5..0.5: push bands to the left (negative) or right (positive) */
	bias?: number;
	/** share of bands brightened (default 0.2) */
	lift?: number;
};

const FULL: Box = {x0: 0, y0: 0, x1: 1280, y1: 720};

const pick = <T,>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))];

const liftOf = (seed: number, i: number, lift: number): number | undefined =>
	hash(seed + i * 8.3) < lift ? 0.25 + 0.5 * hash(seed + i * 6.7) : undefined;

/** Deterministic horizontal bands inside a region (720p units). Pure and seeded: same seed, same bands. */
export const rowSlices = (o: RowOpts): GlitchSlice[] => {
	const {x0 = FULL.x0, y0 = FULL.y0, x1 = FULL.x1, y1 = FULL.y1} = o;
	const minH = o.minH ?? 4;
	const maxH = o.maxH ?? 40;
	const density = o.density ?? 0.55;
	const shift = o.shift ?? [20, 300];
	const offs = o.offsets ?? [0];
	const partial = x0 > FULL.x0 || x1 < FULL.x1;
	const out: GlitchSlice[] = [];
	let y = y0;
	let i = 0;
	while (y < y1) {
		const h = Math.min(y1 - y, minH + Math.floor(hash(o.seed + i * 1.37) * (maxH - minH)));
		if (hash(o.seed + i * 3.11) < density) {
			const mag = shift[0] + (shift[1] - shift[0]) * hash(o.seed + i * 7.7);
			const sign = hash(o.seed + i * 5.3) < 0.5 + (o.bias ?? 0) ? -1 : 1;
			out.push({
				y,
				h,
				x0: partial ? x0 : undefined,
				x1: partial ? x1 : undefined,
				dx: sign * mag,
				sx: 1 + hash(o.seed + i * 2.9) * (o.stretch ?? 0.6),
				ox: x0,
				from: pick(offs, hash(o.seed + i * 9.3)),
				bright: liftOf(o.seed, i, o.lift ?? 0.2),
			});
		}
		y += h;
		i++;
	}
	return out;
};

/** Square-ish macroblocks (8-32 px grid, 1-4 cells wide) scattered in a region, each nudged sideways. */
export const blockSlices = (
	o: Partial<Box> & {seed: number; n?: number; shift?: number; offsets?: number[]; lift?: number},
): GlitchSlice[] => {
	const {x0 = FULL.x0, y0 = FULL.y0, x1 = FULL.x1, y1 = FULL.y1} = o;
	const offs = o.offsets ?? [0];
	const shift = o.shift ?? 32;
	return Array.from({length: Math.max(0, Math.round(o.n ?? 40))}, (_, i) => {
		const size = pick([8, 16, 16, 32], hash(o.seed + i * 4.1));
		const w = size * (1 + Math.floor(hash(o.seed + i * 6.1) * 4));
		const x = x0 + Math.floor((hash(o.seed + i * 1.7) * Math.max(8, x1 - x0 - w)) / 8) * 8;
		const y = y0 + Math.floor((hash(o.seed + i * 2.3) * Math.max(8, y1 - y0 - size)) / 8) * 8;
		return {
			y,
			h: size,
			x0: x,
			x1: x + w,
			dx: (hash(o.seed + i * 9.9) - 0.5) * 2 * shift,
			from: pick(offs, hash(o.seed + i * 3.3)),
			bright: liftOf(o.seed, i, o.lift ?? 0.2),
		};
	});
};

/** A few hairline tears (2-8 px tall) thrown far sideways: the "broken scanout" part of a glitch. */
export const tearSlices = (
	o: Partial<Box> & {seed: number; n?: number; shift?: [number, number]; offsets?: number[]},
): GlitchSlice[] => {
	const {x0 = FULL.x0, y0 = FULL.y0, x1 = FULL.x1, y1 = FULL.y1} = o;
	const shift = o.shift ?? [60, 240];
	const offs = o.offsets ?? [0];
	return Array.from({length: Math.max(0, Math.round(o.n ?? 4))}, (_, i) => {
		const h = 2 + Math.floor(hash(o.seed + i * 2.2) * 7);
		const y = y0 + hash(o.seed + i * 4.9) * Math.max(1, y1 - y0 - h);
		const mag = shift[0] + (shift[1] - shift[0]) * hash(o.seed + i * 7.1);
		return {
			y: Math.round(y),
			h,
			x0: x0 > FULL.x0 ? x0 : undefined,
			x1: x1 < FULL.x1 ? x1 : undefined,
			dx: (hash(o.seed + i * 5.9) < 0.5 ? -1 : 1) * mag,
			sx: 1 + hash(o.seed + i * 3.7) * 0.15,
			ox: x0,
			from: pick(offs, hash(o.seed + i * 9.1)),
			bright: 0.35,
		};
	});
};

/** The band list for one glitch frame of a given kind and intensity. */
export const glitchSlices = (
	kind: GlitchKind,
	seed: number,
	intensity: number,
	box: Box,
	offsets: number[],
	lift: number,
): GlitchSlice[] => {
	const k = Math.max(0, intensity);
	const rows = () =>
		rowSlices({...box, seed, density: clamp(0.55 * k, 0.05, 0.92), shift: [20 * k, 300 * k], offsets, lift});
	const blocks = (n: number) => blockSlices({...box, seed: seed + 5, n: n * k, shift: 32 * Math.max(0.6, k), offsets, lift});
	const tears = (n: number) => tearSlices({...box, seed: seed + 9, n: Math.round(n * k), shift: [60 * k, 240 * k], offsets});
	if (kind === 'rows') {
		return rows();
	}
	if (kind === 'blocks') {
		return blocks(56);
	}
	if (kind === 'tear') {
		return tears(4);
	}
	return [...blocks(22), ...rows().filter((_, i) => i % 2 === 0), ...tears(3)];
};

export type SliceGlitchProps = {
	/** glitch events; each runs for `frames` frames starting at `at` */
	events?: GlitchEvent[];
	/** art-directed bands for THIS frame (overrides `events`); build them with rowSlices / blockSlices / tearSlices */
	slices?: GlitchSlice[] | null;
	/** restrict generated bands to a part of the frame, as fractions [x0, y0, x1, y1] (default the whole frame) */
	region?: [number, number, number, number];
	/** where bands take their picture from: 'neighbours' = frames -2..+2 (bleeds across a cut), 'past' = this and the 2 previous frames (never reaches past a cut that is ahead) */
	sample?: 'neighbours' | 'past';
	/** explicit frame offsets to sample from, overrides `sample` */
	offsets?: number[];
	/** opacity of the neighbour frame blended under the bands during a glitch (0.5 = 50/50) */
	ghost?: number;
	/** share of bands that get a brightness lift (smeared highlights) */
	lift?: number;
	children: React.ReactNode;
};

/**
 * Wrap a scene (or a whole shot) to corrupt it for a few frames. Outside the events the children render untouched.
 * Cost: every band re-renders the children once, so keep the tree light or the events short.
 */
export const SliceGlitch: React.FC<SliceGlitchProps> = ({
	events = [],
	slices = null,
	region = [0, 0, 1, 1],
	sample = 'neighbours',
	offsets,
	ghost = 0.5,
	lift = 0.2,
	children,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = Math.min(width, height) / 720;
	const W = width / u;
	const H = height / u;
	const offs = offsets ?? (sample === 'past' ? [0, -1, -2] : [-2, -1, 1, 2]);

	let list: GlitchSlice[] | null = slices && slices.length > 0 ? slices : null;
	let ghostFrame: number | null = null;
	if (!list) {
		const ev = events.find((e) => frame >= e.at && frame < e.at + (e.frames ?? 2));
		if (ev) {
			const k = frame - ev.at;
			const seed = (ev.seed ?? 1) * 977 + k * 131;
			const box: Box = {x0: region[0] * W, y0: region[1] * H, x1: region[2] * W, y1: region[3] * H};
			list = glitchSlices(ev.kind ?? 'rows', seed, ev.intensity ?? 1, box, offs, lift);
			const others = offs.filter((o) => o !== 0);
			if (ghost > 0 && others.length > 0) {
				ghostFrame = Math.max(0, frame + pick(others, hash(seed + 0.5)));
			}
		}
	}
	if (!list) {
		return <>{children}</>;
	}

	return (
		<AbsoluteFill>
			<AbsoluteFill>{children}</AbsoluteFill>
			{ghostFrame !== null && ghostFrame !== frame ? (
				<AbsoluteFill style={{opacity: clamp(ghost, 0, 1)}}>
					<Freeze frame={ghostFrame}>{children}</Freeze>
				</AbsoluteFill>
			) : null}
			{list.map((s, i) => {
				const x0 = s.x0 ?? 0;
				const x1 = s.x1 ?? W;
				const clip = `inset(${s.y * u}px ${Math.max(0, W - x1) * u}px ${Math.max(0, H - s.y - s.h) * u}px ${x0 * u}px)`;
				const f = Math.max(0, frame + (s.from ?? 0));
				return (
					<AbsoluteFill key={i} style={{clipPath: clip, overflow: 'hidden'}}>
						<AbsoluteFill
							style={{
								transform: `translateX(${(s.dx * u).toFixed(1)}px) scaleX(${(s.sx ?? 1).toFixed(3)})`,
								transformOrigin: `${(s.ox ?? x0) * u}px 50%`,
								filter: s.bright ? `brightness(${1 + s.bright})` : undefined,
							}}
						>
							{f === frame ? children : <Freeze frame={f}>{children}</Freeze>}
						</AbsoluteFill>
					</AbsoluteFill>
				);
			})}
		</AbsoluteFill>
	);
};

/* ------------------------------------------------------------------------------------------------ demo */

const CUT = 33;

/** Two shots on one clock: blue "RELAY" up to the cut, red "BREACH" after it, plus a moving block so neighbour frames differ. */
const CutScene: React.FC = () => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = Math.min(width, height) / 720;
	const x = ((frame * 22) % 1500) - 160;
	const first = frame < CUT;
	const ink = first ? DEMO.paper : DEMO.ink;
	return (
		<AbsoluteFill style={{background: first ? DEMO.blue : DEMO.red, overflow: 'hidden'}}>
			<AbsoluteFill
				style={{
					opacity: 0.2,
					backgroundImage: `radial-gradient(${first ? DEMO.paper : DEMO.ink} ${3 * u}px, transparent ${3.5 * u}px)`,
					backgroundSize: `${30 * u}px ${30 * u}px`,
				}}
			/>
			{first ? (
				<div style={{position: 'absolute', right: 80 * u, top: 70 * u, width: 250 * u, height: 250 * u, borderRadius: '50%', border: `${18 * u}px solid ${DEMO.yellow}`}} />
			) : (
				<div style={{position: 'absolute', left: 70 * u, top: 330 * u, width: 340 * u, height: 90 * u, background: DEMO.ink, transform: 'skewX(-18deg)'}} />
			)}
			<div
				style={{
					position: 'absolute',
					left: 70 * u,
					top: first ? 130 * u : 130 * u,
					fontFamily: DISPLAY_FONT,
					fontSize: (first ? 290 : 235) * u,
					lineHeight: 1,
					letterSpacing: -6 * u,
					color: ink,
				}}
			>
				{first ? 'RELAY' : 'BREACH'}
			</div>
			<div
				style={{
					position: 'absolute',
					left: x * u,
					top: 520 * u,
					width: 160 * u,
					height: 58 * u,
					background: first ? DEMO.yellow : DEMO.ink,
					fontFamily: DISPLAY_FONT,
					fontSize: 42 * u,
					lineHeight: `${58 * u}px`,
					textAlign: 'center',
					color: first ? DEMO.ink : DEMO.paper,
				}}
			>
				GO
			</div>
			<div
				style={{
					position: 'absolute',
					left: 74 * u,
					bottom: 50 * u,
					fontFamily: BODY_FONT,
					fontWeight: 800,
					fontSize: 30 * u,
					letterSpacing: 7 * u,
					color: ink,
				}}
			>
				{first ? 'CH 01 / SIGNAL' : 'CH 02 / OVERRIDE'}
			</div>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<SliceGlitch
		events={[
			{at: 14, frames: 3, kind: 'rows', intensity: 0.7, seed: 3},
			{at: 24, frames: 2, kind: 'blocks', intensity: 1, seed: 5},
			{at: 32, frames: 3, kind: 'rows', intensity: 1.2, seed: 7},
			{at: 43, frames: 2, kind: 'tear', intensity: 1.3, seed: 11},
			{at: 53, frames: 3, kind: 'mix', intensity: 1, seed: 13},
		]}
	>
		<CutScene />
	</SliceGlitch>
);

export const sliceGlitchEntry: LibraryEntry = {
	meta: {
		id: 'slice-glitch',
		title: 'Slice glitch',
		category: 'fx',
		looks:
			'For 1-3 frames the picture breaks into horizontal bands and macroblocks that slide sideways, stretch and pull from the frames before and after, over a 50/50 ghost of the neighbour frame.',
		use: 'On a hard cut, a hit or a "signal lost" beat; art-direct bands per region for a shot-specific smear.',
		exportName: 'SliceGlitch',
		durationInFrames: 60,
		source: {kind: 'original'},
	},
	Demo,
};
