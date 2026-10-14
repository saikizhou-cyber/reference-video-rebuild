import {random} from 'remotion';

/** Small pure helpers shared by the burst / particle effects in this folder. */

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const smoothstep = (v: number): number => {
	const t = clamp(v, 0, 1);
	return t * t * (3 - 2 * t);
};

/** 2 decimals is plenty for SVG path data and keeps the DOM small */
export const r2 = (v: number): number => Math.round(v * 100) / 100;

export const deg2rad = (d: number): number => (d * Math.PI) / 180;

/** Sequential seeded stream built on remotion's random(): the same seed always gives the same numbers. */
export const rngOf = (seed: number | string): (() => number) => {
	let i = 0;
	return () => random(`${seed}-${i++}`);
};

/** Mix two #rrggbb colours (k = 0 gives a, 1 gives b). Anything else is returned unchanged. */
export const mixHex = (a: string, b: string, k: number): string => {
	const pa = /^#([0-9a-f]{6})$/i.exec(a);
	const pb = /^#([0-9a-f]{6})$/i.exec(b);
	if (!pa || !pb) {
		return a;
	}
	const ca = parseInt(pa[1], 16);
	const cb = parseInt(pb[1], 16);
	const ch = (shift: number) => {
		const x = (ca >> shift) & 255;
		const y = (cb >> shift) & 255;
		return Math.round(x + (y - x) * k);
	};
	return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
};

/** GSAP "power4.out" (quintic) so ports of timelines keep their feel */
export const power4Out = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 5);

/** Positive modulo (works for negative inputs) */
export const mod = (n: number, m: number): number => ((n % m) + m) % m;
