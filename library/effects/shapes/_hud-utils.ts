/** Shared helpers for the shapes/hud group (frames, reticles, readouts, rings, path draws, morphs). */

/** Monospace stack for readouts; no web font is loaded, so this falls back to what the render machine has. */
export const MONO_FONT = '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, "Courier New", monospace';

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const parseHex = (c: string): [number, number, number] | null => {
	const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
	if (!m) {
		return null;
	}
	const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** Linear mix of two #rgb / #rrggbb colours (anything else snaps at the half-way point). */
export const mixColor = (a: string, b: string, t: number): string => {
	const ca = parseHex(a);
	const cb = parseHex(b);
	if (!ca || !cb) {
		return t < 0.5 ? a : b;
	}
	const ch = (i: number) => Math.round(lerp(ca[i], cb[i], clamp01(t)));
	return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
};

/** `rgba(...)` from a #rgb / #rrggbb colour (anything else is returned unchanged). */
export const withAlpha = (c: string, alpha: number): string => {
	const rgb = parseHex(c);
	return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp01(alpha)})` : c;
};

/** Hard on/off/half-on stutter used for HUD pieces that "power up": off, on, dim, on, half, on... */
export const FLICKER = [0, 1, 0.2, 1, 0.55, 1, 0.8, 1] as const;

/** Flicker opacity for a normalised time 0..1 (0 = still off, 1 = settled on). Deterministic, steps with `t`. */
export const flickerAt = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : FLICKER[Math.floor(t * FLICKER.length)]);

/**
 * strokeDasharray / strokeDashoffset that show only the stretch [from, to] (0..1) of a path that
 * carries pathLength={1}. Pair with `strokeLinecap="butt"` (or skip rendering when the window is empty).
 */
export const dashWindow = (from: number, to: number): {strokeDasharray: string; strokeDashoffset: number} => {
	const a = clamp01(Math.min(from, to));
	const b = clamp01(Math.max(from, to));
	return {strokeDasharray: `${Math.max(0, b - a)} 2`, strokeDashoffset: -a};
};

/** `M x y L x y ... Z` from a point list. 4 decimals, so unit-space shapes (-1..1, scaled up by a transform) stay smooth. */
export const polyPath = (pts: ReadonlyArray<readonly [number, number]>, close = true): string =>
	`M${pts.map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(' L')}${close ? ' Z' : ''}`;
