/** Shared helpers for the fx/look group (shader effects that restyle a whole scene). */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

/** '#rgb' / '#rrggbb' -> [r, g, b] in 0..1 (sRGB values, not linearised). */
export const hex = (color: string): Vec3 => {
	let h = color.trim().replace('#', '');
	if (h.length === 3) {
		h = h
			.split('')
			.map((c) => c + c)
			.join('');
	}
	const n = parseInt(h.slice(0, 6), 16);
	if (Number.isNaN(n)) {
		return [0, 0, 0];
	}
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Linear mix of two hex colours (sRGB), for animating a colour prop: mixHex('#ff0000', '#0000ff', 0.5). */
export const mixHex = (a: string, b: string, t: number): string => {
	const x = hex(a);
	const y = hex(b);
	const to = (i: number) =>
		Math.round(Math.min(1, Math.max(0, x[i] + (y[i] - x[i]) * t)) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${to(0)}${to(1)}${to(2)}`;
};

/** A point given as fractions of the frame, y measured from the TOP (CSS-like) -> uv with y UP, as the shaders expect. */
export const toUv = (p: Vec2): Vec2 => [p[0], 1 - p[1]];

/**
 * GLSL snippets shared by the bodies (premultiplied-alpha helpers, hash).
 * hash12 is "Hash without Sine" by David Hoskins (MIT), as also used in vfx-js.
 */
export const GLSL_UTIL = `
vec3 unpremul(vec4 c) { return c.a > 0.0 ? c.rgb / c.a : vec3(0.0); }
float luma709(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
`;
