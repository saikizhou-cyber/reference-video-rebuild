/**
 * GLSL building blocks shared by the Codrops "cover, then reveal" transitions (ink-blot, spiral-cover, velvet-curtain).
 * Original code (our own hash and noise); the shaders only borrow the ideas of the three.js originals.
 *
 * The originals run a cover (`progress` 0 -> 1) and then a reveal (`progress` 1 -> 0) as two GSAP tweens. Here one
 * transition progress 0..1 does both: the first half covers the outgoing scene A, the second half opens onto B.
 * `cPhase()` turns it back into the original `progress` (0 -> 1 -> 0) and `reveal` (0 while covering, 1 revealing).
 */

/** Integer-hash gradient noise (3D, about -1..1) and a 3-octave fbm (lacunarity 2, gain 0.5), no sine hashes: same result on every GPU. */
export const CODROPS_NOISE_GLSL = `
const float C_PI = 3.141592653589793;

uint cHash(uint x) {
	x ^= x >> 16;
	x *= 0x7feb352du;
	x ^= x >> 15;
	x *= 0x846ca68bu;
	x ^= x >> 16;
	return x;
}

vec3 cGrad(ivec3 p, float seed) {
	uvec3 u = uvec3(p + ivec3(8192));
	uint h = cHash(u.x ^ cHash(u.y ^ cHash(u.z ^ uint(abs(seed)))));
	return vec3(float(h & 255u), float((h >> 8) & 255u), float((h >> 16) & 255u)) / 127.5 - 1.0;
}

float cNoise(vec3 p, float seed) {
	vec3 i = floor(p);
	vec3 f = p - i;
	vec3 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	ivec3 b = ivec3(i);
	float n000 = dot(cGrad(b, seed), f);
	float n100 = dot(cGrad(b + ivec3(1, 0, 0), seed), f - vec3(1.0, 0.0, 0.0));
	float n010 = dot(cGrad(b + ivec3(0, 1, 0), seed), f - vec3(0.0, 1.0, 0.0));
	float n110 = dot(cGrad(b + ivec3(1, 1, 0), seed), f - vec3(1.0, 1.0, 0.0));
	float n001 = dot(cGrad(b + ivec3(0, 0, 1), seed), f - vec3(0.0, 0.0, 1.0));
	float n101 = dot(cGrad(b + ivec3(1, 0, 1), seed), f - vec3(1.0, 0.0, 1.0));
	float n011 = dot(cGrad(b + ivec3(0, 1, 1), seed), f - vec3(0.0, 1.0, 1.0));
	float n111 = dot(cGrad(b + ivec3(1, 1, 1), seed), f - vec3(1.0, 1.0, 1.0));
	return mix(
		mix(mix(n000, n100, w.x), mix(n010, n110, w.x), w.y),
		mix(mix(n001, n101, w.x), mix(n011, n111, w.x), w.y),
		w.z
	);
}

float cFbm(vec3 p, float seed) {
	float sum = 0.0;
	float amp = 1.0;
	for (int i = 0; i < 3; i++) {
		sum += amp * cNoise(p, seed);
		p = p * 2.0 + vec3(5.2, 1.3, 7.7);
		amp *= 0.5;
	}
	return sum;
}
`;

/** GSAP-style power eases (power2.out = n 2) and the cover/reveal phase split. */
export const CODROPS_PHASE_GLSL = `
float cOut(float t, float n) {
	return 1.0 - pow(1.0 - clamp(t, 0.0, 1.0), n);
}

float cInOut(float t, float n) {
	t = clamp(t, 0.0, 1.0);
	return t < 0.5 ? 0.5 * pow(2.0 * t, n) : 1.0 - 0.5 * pow(2.0 * (1.0 - t), n);
}

// Transition progress 0..1 -> the original cover progress (0 -> 1 while covering, 1 -> 0 while revealing) and the reveal flag.
// Covering eases in-out with power coverPow, revealing eases out with power revealPow (or in-out when revealInOut is true).
void cPhase(float t, float coverPow, float revealPow, bool revealInOut, out float p, out float rev) {
	rev = step(0.5, t);
	float local = rev < 0.5 ? t * 2.0 : t * 2.0 - 1.0;
	float eased = rev < 0.5 ? cInOut(local, coverPow) : (revealInOut ? cInOut(local, revealPow) : cOut(local, revealPow));
	p = rev < 0.5 ? eased : 1.0 - eased;
}

// 1 where field is below threshold, 0 above: the covered side of an edge, anti-aliased, softness widens it into a gradient.
float cBelow(float field, float threshold, float softness) {
	float hw = max(fwidth(field), softness) * 0.5;
	return 1.0 - smoothstep(threshold - hw, threshold + hw, field);
}

// Composite the cover over the page that is currently visible (A while covering, B while revealing).
// alpha is how covered the pixel is; a full cover is exactly opaque and an empty one exactly transparent, as in the original.
vec4 cComposite(vec2 uv, float rev, float p, vec3 col, float alpha) {
	vec4 page = rev > 0.5 ? getToColor(uv) : getFromColor(uv);
	float a = p >= 0.999 ? 1.0 : clamp(alpha, 0.0, 1.0) * step(0.001, p);
	return mix(page, vec4(col, 1.0), a);
}

vec3 cToLinear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

vec3 cToSrgb(vec3 c) {
	c = clamp(c, 0.0, 1.0);
	return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`;
