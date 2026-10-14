import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {DEMO, Plate, useUnit} from '../../core/scene';

/**
 * Shared helpers of the fx/signal group (rgb-split, analog-glitch, block-glitch, vhs, crt, film-grain, zoom-blur):
 * a frame-pure integer hash (same maths in TypeScript and in GLSL), hit envelopes, a glitch burst scheduler
 * and the moving plate the demos run on.
 */

// ---------------------------------------------------------------------------------------------
// integer hash. lowbias32 by Chris Wellons (public domain / Unlicense), no sin(): same result on every GPU and in JS.
// ---------------------------------------------------------------------------------------------

/** 32-bit avalanche hash of an unsigned integer. */
export const hashU = (x: number): number => {
	let h = x >>> 0;
	h = (h ^ (h >>> 16)) >>> 0;
	h = Math.imul(h, 0x7feb352d) >>> 0;
	h = (h ^ (h >>> 15)) >>> 0;
	h = Math.imul(h, 0x846ca68b) >>> 0;
	h = (h ^ (h >>> 16)) >>> 0;
	return h;
};

const toU = (n: number): number => Math.floor(n) >>> 0;

/** hash of two / three integers (mirrors hu2 / hu3 in GLSL_HASH) */
export const hash2 = (a: number, b: number): number => hashU((hashU(toU(a)) + toU(b)) >>> 0);
export const hash3 = (a: number, b: number, c: number): number => hashU((hashU((hashU(toU(a)) + toU(b)) >>> 0) + toU(c)) >>> 0);

/** top 24 bits of a hash as a float in [0, 1) (mirrors hf in GLSL_HASH) */
export const hashF = (h: number): number => (h >>> 8) / 16777216;

/** seeded random float in [0, 1) from up to three integers: rnd(seed, burstIndex, slot) */
export const rnd = (a: number, b = 0, c = 0): number => hashF(hash3(a, b, c));

/** GLSL twin of the functions above. Paste at the top of a shader body (it declares `precision highp int`). */
export const GLSL_HASH = `
precision highp int;
uint hu(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
uint hu2(uint a, uint b) { return hu(hu(a) + b); }
uint hu3(uint a, uint b, uint c) { return hu(hu(hu(a) + b) + c); }
float hf(uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }
uint uf(float v) { return uint(max(floor(v), 0.0)); }
`;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** the two values every frame-driven shader here wants: `time` in seconds and an integer `seed` that changes every frame */
export const frameClock = (frame: number, fps = 30): {time: number; seed: number} => ({time: frame / fps, seed: frame});

// ---------------------------------------------------------------------------------------------
// hit envelopes
// ---------------------------------------------------------------------------------------------

export type HitEnvelope = {
	/** frames the hit stays at full strength */
	hold?: number;
	/** frames the tail takes to fall to 0 */
	decay?: number;
	/** tail curve: 1 = linear, 2 = quick drop with a long thin tail */
	power?: number;
};

/** 1 on `start`, flat for `hold` frames, then a power-curve tail to 0 over `decay` frames. 0 before `start`. */
export const hitEnvelope = (frame: number, start: number, {hold = 1, decay = 8, power = 2}: HitEnvelope = {}): number => {
	const age = frame - start;
	if (age < 0) {
		return 0;
	}
	if (age < hold) {
		return 1;
	}
	const t = Math.min(1, (age - hold + 1) / Math.max(1, decay));
	return Math.pow(1 - t, power);
};

/** The hit (from a list of frames) that most recently fired at or before `frame`: its frame and its position in the list, or null. */
export const lastHit = (frame: number, hits: readonly number[]): {at: number; index: number} | null => {
	let at = -Infinity;
	let index = -1;
	for (let i = 0; i < hits.length; i++) {
		if (hits[i] <= frame && hits[i] >= at) {
			at = hits[i];
			index = i;
		}
	}
	return index < 0 ? null : {at, index};
};

// ---------------------------------------------------------------------------------------------
// glitch burst scheduler: glitches should feel accidental, not constant
// ---------------------------------------------------------------------------------------------

export type BurstOptions = {
	/** change it to get a different (still repeatable) pattern of bursts */
	seed?: number;
	/** frames of calm between the end of one burst and the start of the next, [min, max] */
	gap?: readonly [number, number];
	/** frames a burst lasts, [min, max] */
	length?: readonly [number, number];
	/** peak intensity of a burst, drawn per burst from [min, max] (0..1) */
	peak?: readonly [number, number];
	/** nothing fires before this frame */
	from?: number;
};

export type Burst = {
	/** true while a burst is on */
	active: boolean;
	/** which burst (0, 1, 2...), -1 while calm before the first */
	index: number;
	/** frames since the burst started */
	age: number;
	/** length of this burst in frames */
	length: number;
	/** 0 while calm, otherwise 0..1: hard first frame, flickering body, thinning tail */
	intensity: number;
	/** integer 0..65535 that changes every frame of a burst (use it as the pattern seed); also changes while calm */
	seed: number;
};

/**
 * Pure scheduler: which frames carry a glitch burst, from a seed alone.
 *   const b = glitchBursts(frame, {seed: 3, gap: [18, 34], length: [2, 6]});
 *   analogGlitch(analogGlitchFromBurst(b, frame))
 * Every burst draws its own gap, length and peak from the seed, so the rhythm is irregular but repeatable.
 * Own design and constants (gap 18-34 frames, 2-6 frames long, hard first frame / flickering body / thinning tail).
 * The sporadic modes of pmndrs/postprocessing's GlitchEffect (zlib; its reference shader is unlicensed) and of
 * storybynumbers/remotion-glitch-effect (no licence) were read as inspiration only; none of their code or numbers is used.
 */
export const glitchBursts = (frame: number, o: BurstOptions = {}): Burst => {
	const {seed = 1, gap = [18, 34], length = [2, 6], peak = [0.6, 1], from = 0} = o;
	let cursor = from;
	for (let i = 0; i < 200000; i++) {
		const start = Math.round(cursor + lerp(gap[0], gap[1], rnd(seed, i, 1)));
		const len = Math.max(1, Math.round(lerp(length[0], length[1], rnd(seed, i, 2))));
		if (frame < start) {
			break;
		}
		if (frame < start + len) {
			const age = frame - start;
			const t = len > 1 ? age / (len - 1) : 0;
			const hit = age === 0 ? 0.8 : 1;
			const tail = 1 - 0.55 * t * t;
			const flicker = 0.75 + 0.25 * rnd(seed, i, 100 + age);
			const top = lerp(peak[0], peak[1], rnd(seed, i, 3));
			return {active: true, index: i, age, length: len, intensity: Math.min(1, top * hit * tail * flicker), seed: hash3(seed, i, age) & 0xffff};
		}
		cursor = start + len;
	}
	return {active: false, index: -1, age: 0, length: 0, intensity: 0, seed: hash2(seed, frame) & 0xffff};
};

// ---------------------------------------------------------------------------------------------
// demo picture: Plate with slow drift, a ticker bar that sweeps across, and an optional punch-in scale
// ---------------------------------------------------------------------------------------------

export const DemoPlate: React.FC<{
	/**
	 * extra scale on top of the slow drift (1 = none). The total is capped at 1.07: the 150 px headline of Plate must stay
	 * under Chrome's 162 px glyph-atlas limit, above which text is drawn from distance fields that are not bit-exact
	 * between two renders (the determinism check would flag it).
	 */
	scale?: number;
	/** transform origin as a share of the frame, [x, y] */
	origin?: readonly [number, number];
	/** ticker bar that sweeps left to right (shows what a time-lagged copy looks like) */
	ticker?: boolean;
}> = ({scale = 1, origin = [0.5, 0.5], ticker = true}) => {
	const frame = useCurrentFrame();
	const {width} = useVideoConfig();
	const u = useUnit();
	const drift = 1 + 0.0004 * frame;
	const x = ((frame * 17 * u) % (width + 520 * u)) - 460 * u;
	return (
		<AbsoluteFill style={{overflow: 'hidden', background: DEMO.ink}}>
			<AbsoluteFill style={{transform: `scale(${Math.min(1.07, drift * scale)})`, transformOrigin: `${origin[0] * 100}% ${origin[1] * 100}%`}}>
				<Plate />
				{ticker ? (
					<AbsoluteFill style={{overflow: 'hidden'}}>
						<div
							style={{
								position: 'absolute',
								left: 0,
								bottom: 74 * u,
								width: 460 * u,
								height: 30 * u,
								background: DEMO.yellow,
								transform: `translateX(${x}px) skewX(-18deg)`,
							}}
						/>
					</AbsoluteFill>
				) : null}
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
