import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import type {LibraryEntry} from '../../core/types';
import {makeTransitionDemo} from './_gl-utils';

export type LensPunchProps = {
	/** outgoing scene: zoom reached at the cut (1 = none, 1.5 = 150 %) */
	outScale?: number;
	/** incoming scene: zoom it lands from (1 = none) */
	inScale?: number;
	/** outgoing fisheye field of view at the cut, degrees (0 = flat) */
	outFov?: number;
	/** incoming fisheye field of view at the start, degrees */
	inFov?: number;
	/** outgoing radial (zoom) blur at the cut, 0..60+ (60 = smears 30 % of the radius) */
	outBlur?: number;
	/** incoming radial blur at the start */
	inBlur?: number;
	/** outgoing camera roll at the cut, degrees */
	outRoll?: number;
	/** incoming camera roll at the start, degrees (settles to 0) */
	inRoll?: number;
	/** red / blue channel scale split (0.01 = red 101 %, blue 99 %); 0 = off */
	rgbSplit?: number;
	/** handheld shake that grows towards the cut and settles after it (1 = default, 0 = off) */
	shake?: number;
	/** opt-in anticipation: how far the outgoing picture squeezes back (0.06 = to 94 %) before the punch; 0 = off */
	anticipate?: number;
	/** letterbox aspect that slides in during the punch (2.39 = scope); 0 = off */
	letterbox?: number;
};

const BODY = `
uniform float outScale;
uniform float inScale;
uniform float outFov;
uniform float inFov;
uniform float outBlur;
uniform float inBlur;
uniform float outRoll;
uniform float inRoll;
uniform float rgbSplit;
uniform float shake;
uniform float anticipate;
uniform float letterbox;

const float PI = 3.141592653589793;
const int TAPS = 20;
// 160 deg of nominal field of view is mapped through a slightly softer lens so the middle of the picture stays readable at the cut
const float LENS_SOFT = 0.85;

// CSS cubic-bezier(x1, y1, x2, y2) solved with Newton steps
float bezier(float x, vec4 c) {
	float cx = 3.0 * c.x;
	float bx = 3.0 * (c.z - c.x) - cx;
	float ax = 1.0 - cx - bx;
	float t = x;
	for (int i = 0; i < 8; i++) {
		float e = ((ax * t + bx) * t + cx) * t - x;
		float d = (3.0 * ax * t + 2.0 * bx) * t + cx;
		if (abs(d) < 1e-5) break;
		t = clamp(t - e / d, 0.0, 1.0);
	}
	float cy = 3.0 * c.y;
	float by = 3.0 * (c.w - c.y) - cy;
	float ay = 1.0 - cy - by;
	return ((ay * t + by) * t + cy) * t;
}

// barrel / fisheye: p is aspect-corrected and centred; the middle of the picture is magnified, the rim is squeezed
vec2 lens(vec2 p, float zoom, float fovDeg, float rollDeg) {
	float a = radians(rollDeg);
	float cs = cos(a);
	float sn = sin(a);
	p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
	float R = 0.5 * sqrt(ratio * ratio + 1.0);
	float r = length(p);
	float half_ = radians(fovDeg) * 0.5 * LENS_SOFT;
	if (half_ > 0.001 && r > 1e-5) {
		p *= (R * tan(min(r / R, 1.0) * half_) / tan(half_)) / r;
	}
	return p / max(zoom, 0.01);
}

float jitter(float x, float seed) {
	return sin(x * 71.3 + seed) + 0.6 * sin(x * 131.7 + seed * 2.1 + 1.3) + 0.35 * sin(x * 223.9 + seed * 3.7);
}

vec4 transition(vec2 uv) {
	bool outgoing = progress < 0.5;
	float k;
	float zoom;
	float fov;
	float blur;
	float roll;
	if (outgoing) {
		float t = progress * 2.0;
		float e = bezier(t, vec4(0.54, 0.0, 0.82, 0.8));
		k = e;
		zoom = mix(1.0, outScale, e) * (1.0 - anticipate * sin(PI * clamp(t / 0.35, 0.0, 1.0)));
		fov = outFov * e;
		blur = outBlur * e;
		roll = outRoll * e;
	} else {
		float t = (progress - 0.5) * 2.0;
		float e = bezier(t, vec4(0.18, 0.2, 0.46, 1.0));
		k = 1.0 - e;
		zoom = mix(inScale, 1.0, e);
		fov = inFov * (1.0 - e);
		blur = inBlur * (1.0 - e);
		roll = inRoll * (1.0 - e);
	}

	vec2 p = uv - 0.5;
	p.x *= ratio;

	// handheld shake, strongest around the cut
	float amp = shake * k * k;
	p += vec2(jitter(progress, 0.0), jitter(progress, 4.0)) * 0.0075 * amp;

	float span = blur / 60.0 * 0.30;
	vec3 sum = vec3(0.0);
	float wsum = 0.0;
	// per-pixel jitter of the tap positions turns the ghost copies of a coarse radial blur into fine grain
	float dither = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
	for (int i = 0; i < TAPS; i++) {
		float f = (float(i) + dither) / float(TAPS - 1) - 0.5;
		float w = max(1.0 - abs(f) * 1.15, 0.02);
		vec2 q = lens(p * (1.0 + span * f * 2.0), zoom, fov, roll);
		vec2 qr = q / (1.0 + rgbSplit);
		vec2 qb = q / (1.0 - rgbSplit);
		vec2 ur = vec2(0.5 + qr.x / ratio, 0.5 + qr.y);
		vec2 ug = vec2(0.5 + q.x / ratio, 0.5 + q.y);
		vec2 ub = vec2(0.5 + qb.x / ratio, 0.5 + qb.y);
		vec3 c;
		if (outgoing) {
			c = vec3(getFromColor(ur).r, getFromColor(ug).g, getFromColor(ub).b);
		} else {
			c = vec3(getToColor(ur).r, getToColor(ug).g, getToColor(ub).b);
		}
		sum += c * w;
		wsum += w;
	}
	vec3 col = sum / wsum;

	if (letterbox > 0.0) {
		float env = smoothstep(0.0, 0.3, sin(PI * progress));
		float bar = max(0.0, 0.5 - ratio / (2.0 * letterbox)) * env;
		col *= step(bar, uv.y) * step(uv.y, 1.0 - bar);
	}
	return vec4(col, 1.0);
}`;

const make = makeGlTransition(BODY, {
	outScale: 1.5,
	inScale: 1.35,
	outFov: 160,
	inFov: 135,
	outBlur: 60,
	inBlur: 45,
	outRoll: -15,
	inRoll: -15,
	rgbSplit: 0.01,
	shake: 1,
	anticipate: 0,
	letterbox: 0,
});

/**
 * A hard cut hidden inside a lens punch: the outgoing shot dives into a fisheye zoom with radial blur, roll and RGB fringing,
 * the cut lands at exactly the midpoint, the incoming shot settles out of the same distortion. 28 frames = two 14-frame ramps.
 * Single shader pass: cost does not depend on the scene.
 */
export const lensPunch = (props: LensPunchProps = {}) => make(props);

const Demo = makeTransitionDemo([{presentation: lensPunch(), durationInFrames: 28, timing: linearTiming({durationInFrames: 28})}], 10, 14);

export const lensPunchEntry: LibraryEntry = {
	meta: {
		id: 'lens-punch',
		title: 'Lens punch',
		category: 'transitions',
		looks: 'The old shot dives into a fisheye zoom with radial blur, roll and red/blue fringing, hard cut at the midpoint, the new shot settles out of the same distortion with a little handheld shake.',
		use: 'Impact cut on a hit or a drum fill: hero look-up to the next shot, gameplay to logo, anywhere a whip would feel too soft.',
		exportName: 'lensPunch',
		durationInFrames: 52,
		source: {
			kind: 'inspired',
			name: 'Remocn lens-zoom',
			url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/lens-zoom/index.tsx',
		},
	},
	Demo,
};
