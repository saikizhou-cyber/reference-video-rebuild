// Shared helpers for the text/reveal group: keyframes, hashing, glyph splitting. Pure functions, no state.

/** Monospace stack for typewriter / decode looks (no web font is loaded, so this falls back to what the machine has). */
export const MONO = '"JetBrains Mono", "IBM Plex Mono", "Cascadia Mono", Consolas, "Courier New", monospace';

/** Split by code point so CJK and emoji survive (no combining-mark handling: keep input NFC). */
export const glyphs = (s: string): string[] => Array.from(s);

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Text as lines: accepts a string with "\n" or an array. */
export const toLines = (text: string | readonly string[]): string[] =>
	typeof text === 'string' ? text.split('\n') : [...text];

/** Deterministic hash of up to four integers to [0, 1): the same inputs always give the same number on any seek. */
export const hash01 = (a: number, b = 0, c = 0, d = 0): number => {
	let h =
		Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((c | 0) + 0x165667b1, 0xc2b2ae35) ^ Math.imul((d | 0) + 0x27d4eb2f, 0x61c88647);
	h ^= h >>> 15;
	h = Math.imul(h, 0x2c1b3c6d);
	h ^= h >>> 12;
	h = Math.imul(h, 0x297a2d39);
	h ^= h >>> 15;
	return (h >>> 0) / 4294967296;
};

export type Ease = (t: number) => number;

/** [frame, value] or [frame, value, easing applied to the segment that ENDS at this key]. */
export type Key = readonly [number, number] | readonly [number, number, Ease];

/** Piecewise keyframes over frames, clamped at both ends. */
export const kf = (frame: number, keys: readonly Key[]): number => {
	if (keys.length === 0) {
		return 0;
	}
	if (frame <= keys[0][0]) {
		return keys[0][1];
	}
	for (let i = 1; i < keys.length; i++) {
		const k = keys[i];
		if (frame <= k[0]) {
			const [t0, v0] = keys[i - 1];
			const span = k[0] - t0;
			const p = span <= 0 ? 1 : (frame - t0) / span;
			const e: Ease | undefined = k.length === 3 ? k[2] : undefined;
			return v0 + (k[1] - v0) * (e ? e(p) : p);
		}
	}
	return keys[keys.length - 1][1];
};

/** Linear progress 0..1 of [start, start + duration], clamped. */
export const lin = (frame: number, start: number, duration: number): number => clamp01((frame - start) / Math.max(1e-6, duration));
