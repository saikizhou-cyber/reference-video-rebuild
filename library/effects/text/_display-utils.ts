import {random} from 'remotion';

/**
 * Shared helpers for the text/display group: text measuring (canvas, so no web-font loading and no
 * opentype), a seeded hash and a hex colour mix. Everything is a pure function of its inputs.
 */

export type TextBox = {
	/** advance width in px, letter spacing included */
	width: number;
	/** cap height in px (measured on "H") */
	capHeight: number;
	/** distance from the top of a line box (line-height: 1) to the baseline, in px */
	baseline: number;
};

const cache = new Map<string, TextBox>();
let ctx2d: CanvasRenderingContext2D | null | undefined;

const getCtx = (): CanvasRenderingContext2D | null => {
	if (ctx2d === undefined) {
		ctx2d = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
	}
	return ctx2d;
};

/** Measures `text` set in `family` at `size` px. Falls back to rough numbers when no canvas is available. */
export const measure = (
	text: string,
	family: string,
	size: number,
	weight: number | string = 400,
	letterSpacing = 0,
): TextBox => {
	const key = `${text}|${family}|${size.toFixed(3)}|${weight}|${letterSpacing.toFixed(3)}`;
	const hit = cache.get(key);
	if (hit) {
		return hit;
	}
	const c = getCtx();
	let box: TextBox;
	if (!c) {
		box = {width: text.length * size * 0.55 + text.length * letterSpacing, capHeight: size * 0.72, baseline: size * 0.85};
	} else {
		c.font = `${weight} ${size}px ${family}`;
		(c as unknown as {letterSpacing: string}).letterSpacing = `${letterSpacing}px`;
		const h = c.measureText('H');
		const asc = h.fontBoundingBoxAscent ?? size * 0.9;
		const desc = h.fontBoundingBoxDescent ?? size * 0.25;
		box = {
			width: c.measureText(text).width,
			capHeight: h.actualBoundingBoxAscent || size * 0.72,
			baseline: (size - (asc + desc)) / 2 + asc,
		};
	}
	cache.set(key, box);
	return box;
};

export type CharLayout = {
	chars: string[];
	/** left edge of each glyph relative to the start of the text (kerning of the previous glyph included) */
	x: number[];
	/** advance of each glyph */
	w: number[];
	width: number;
	capHeight: number;
	baseline: number;
};

/** Per-glyph positions of a single line, from prefix widths (keeps kerning without opentype). */
export const charLayout = (
	text: string,
	family: string,
	size: number,
	weight: number | string = 400,
	letterSpacing = 0,
): CharLayout => {
	const chars = Array.from(text);
	const whole = measure(text, family, size, weight, letterSpacing);
	const x: number[] = [];
	const w: number[] = [];
	let prefix = '';
	for (const ch of chars) {
		prefix += ch;
		const upTo = measure(prefix, family, size, weight, letterSpacing).width;
		const own = measure(ch, family, size, weight, letterSpacing).width;
		x.push(upTo - own);
		w.push(own);
	}
	return {chars, x, w, width: whole.width, capHeight: whole.capHeight, baseline: whole.baseline};
};

/** Seeded 0..1 value from any parts (remotion random, no state). */
export const rnd = (...parts: (string | number)[]): number => random(parts.join('|'));

const parseHex = (hex: string): [number, number, number] => {
	const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(hex);
	if (m) {
		return [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))];
	}
	let h = hex.replace('#', '');
	if (h.length === 3) {
		h = h
			.split('')
			.map((c) => c + c)
			.join('');
	}
	const n = parseInt(h.slice(0, 6), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (r: number, g: number, b: number): string => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

/** Linear mix of two colours given as #rgb / #rrggbb / rgb() (t = 0 -> a, 1 -> b); returns #rrggbb so results can be mixed again. */
export const mixHex = (a: string, b: string, t: number): string => {
	const [ar, ag, ab] = parseHex(a);
	const [br, bg, bb] = parseHex(b);
	const k = Math.min(1, Math.max(0, t));
	return toHex(Math.round(ar + (br - ar) * k), Math.round(ag + (bg - ag) * k), Math.round(ab + (bb - ab) * k));
};

/** #rrggbb + alpha -> rgba() string. */
export const withAlpha = (hex: string, alpha: number): string => {
	const [r, g, b] = parseHex(hex);
	return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, alpha))})`;
};

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export type GlyphContour = {
	/** length of the longest single contour of the glyph, in em (dashing restarts on every contour) */
	longest: number;
	/** sum of all contours, in em */
	total: number;
};

const contourCache = new Map<string, GlyphContour>();
const CONTOUR_FALLBACK: GlyphContour = {longest: 7, total: 7};

/**
 * Outline length of one glyph, measured by rasterising it once on a canvas (no font parsing): the pixel mask
 * is split into 8-connected ink and 4-connected paper regions, every ink/paper border is one contour, and its
 * length comes from Cauchy-Crofton crossing counts over the horizontal, vertical and two diagonal scan
 * directions (exact on average, -5 % on purely axis-aligned edges, +3 % on 22 degree ones). Pure per
 * (glyph, font, weight); cached. Used to size a stroke-dash pen so a trace always reaches the end of the contour.
 */
export const glyphContour = (ch: string, family: string, weight: number | string = 400): GlyphContour => {
	const key = `${ch}|${family}|${weight}`;
	const hit = contourCache.get(key);
	if (hit) {
		return hit;
	}
	if (typeof document === 'undefined') {
		return CONTOUR_FALLBACK;
	}
	const size = 192;
	const pad = 24;
	let out: GlyphContour = CONTOUR_FALLBACK;
	try {
		const probe = document.createElement('canvas').getContext('2d');
		if (!probe) {
			return CONTOUR_FALLBACK;
		}
		probe.font = `${weight} ${size}px ${family}`;
		const cw = Math.min(1024, Math.ceil(probe.measureText(ch).width) + pad * 2);
		const chh = Math.ceil(size * 1.6) + pad * 2;
		const cv = document.createElement('canvas');
		cv.width = cw;
		cv.height = chh;
		const c = cv.getContext('2d', {willReadFrequently: true});
		if (!c) {
			return CONTOUR_FALLBACK;
		}
		c.font = `${weight} ${size}px ${family}`;
		c.textBaseline = 'alphabetic';
		c.fillStyle = '#000';
		c.fillText(ch, pad, pad + size * 1.15);
		const data = c.getImageData(0, 0, cw, chh).data;
		const n = cw * chh;
		const ink = new Uint8Array(n);
		for (let i = 0; i < n; i++) {
			ink[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
		}
		// connected regions: ink with 8 neighbours, paper with 4
		const label = new Int32Array(n).fill(-1);
		const stack = new Int32Array(n);
		let labels = 0;
		for (let s = 0; s < n; s++) {
			if (label[s] !== -1) {
				continue;
			}
			const v = ink[s];
			const id = labels++;
			let sp = 0;
			stack[sp++] = s;
			label[s] = id;
			while (sp > 0) {
				const p = stack[--sp];
				const px = p % cw;
				const py = (p - px) / cw;
				for (let dy = -1; dy <= 1; dy++) {
					for (let dx = -1; dx <= 1; dx++) {
						if ((dx === 0 && dy === 0) || (v === 0 && dx !== 0 && dy !== 0)) {
							continue;
						}
						const qx = px + dx;
						const qy = py + dy;
						if (qx < 0 || qy < 0 || qx >= cw || qy >= chh) {
							continue;
						}
						const q = qy * cw + qx;
						if (label[q] === -1 && ink[q] === v) {
							label[q] = id;
							stack[sp++] = q;
						}
					}
				}
			}
		}
		// crossings per ink/paper border (keyed by the two region ids)
		const borders = new Map<number, number>();
		const add = (a: number, b: number, wgt: number) => {
			if (ink[a] === ink[b]) {
				return;
			}
			const la = label[a];
			const lb = label[b];
			const k = la < lb ? la * labels + lb : lb * labels + la;
			borders.set(k, (borders.get(k) ?? 0) + wgt);
		};
		const diag = 1 / Math.SQRT2;
		for (let y = 0; y < chh - 1; y++) {
			for (let x = 0; x < cw - 1; x++) {
				const p = y * cw + x;
				add(p, p + 1, 1);
				add(p, p + cw, 1);
				add(p, p + cw + 1, diag);
				add(p + 1, p + cw, diag);
			}
		}
		let longest = 0;
		let total = 0;
		const k = Math.PI / 8;
		borders.forEach((v) => {
			const len = (v * k) / size;
			total += len;
			longest = Math.max(longest, len);
		});
		out = longest > 0 ? {longest, total} : CONTOUR_FALLBACK;
	} catch {
		out = CONTOUR_FALLBACK;
	}
	contourCache.set(key, out);
	return out;
};

/**
 * Shrinks `size` (never grows it) so a line fits `maxWidth` px. The display font stack falls back to
 * whatever the machine has (Arial Black is much wider than Anton), so every effect fits its word.
 */
export const fitSize = (
	text: string,
	family: string,
	size: number,
	maxWidth: number,
	weight: number | string = 400,
	letterSpacing = 0,
): number => {
	if (maxWidth <= 0) {
		return size;
	}
	const w = measure(text, family, size, weight, letterSpacing).width;
	if (w <= maxWidth) {
		return size;
	}
	const s1 = size * (maxWidth / w);
	const w1 = measure(text, family, s1, weight, letterSpacing * (s1 / size)).width;
	return w1 > maxWidth ? s1 * (maxWidth / w1) : s1;
};
