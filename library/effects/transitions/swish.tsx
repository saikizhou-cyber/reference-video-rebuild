// Ported from xfade-easing Exponential_Swish.glsl (https://github.com/scriptituk/xfade-easing/blob/main/glsl/Exponential_Swish.glsl), MIT, Copyright (c) 2025 Raymond Luckhurst (shader by Boundless, adapted by Raymond Luckhurst). Changes: int uniforms turned into floats, wrap given as a named mode, defaults tuned for 26 frames.
import {linearTiming} from '@remotion/transitions';
import {makeGlTransition} from '../../core/gl-transition';
import type {LibraryEntry} from '../../core/types';
import {makeTransitionDemo} from './_gl-utils';

export type SwishProps = {
	/** zoom strength: the picture reaches 1 / (1 - zoom) x at the cut (0.8 = 5x). Negative zooms out instead */
	zoom?: number;
	/** extra rotation at the peak, degrees */
	angle?: number;
	/** drift of the zoom target, share of the frame ((0, 0) = dead centre) */
	offset?: readonly [number, number];
	/** acceleration: higher = longer calm, harder rush into the cut (4 = default) */
	exponent?: number;
	/** motion blur shutter, in frames of the transition (0 = none) */
	blur?: number;
	/** length of the transition in frames: the blur shutter is blur / frames of the move, so set this to the transition's durationInFrames */
	frames?: number;
	/** what happens outside the frame while zoomed: mirror-tiled copies (default), repeating tiles, or black */
	wrap?: 'mirror' | 'repeat' | 'black';
};

const BODY = `
uniform float zoom;
uniform float angle;
uniform vec2 offset;
uniform float exponent;
uniform vec2 wrap;
uniform float blur;
uniform float frames;

#define PI 3.14159265

vec2 rot(float a, vec2 uv) {
	uv.x *= ratio;
	uv.x -= (ratio - 1.0) / 2.0;
	uv -= 0.5;
	uv = uv * mat2(cos(a), -sin(a), sin(a), cos(a));
	uv += 0.5;
	uv.x += (ratio - 1.0) / 2.0;
	uv.x /= ratio;
	return uv;
}

vec4 transition(vec2 uv) {
	float deg = angle / 180.0 * PI;
	uv -= 0.5;
	vec4 comp = vec4(0.0);
	for (int i = 0; i < 50; i++) {
		float p = clamp(progress + float(i) * blur / frames / 50.0, 0.0, 1.0);
		float px0, px1, px2, px3, pa0, pa1;
		pa0 = pow(2.0 * p, exponent);
		pa1 = pow(-2.0 * p + 2.0, exponent);
		px0 = (-pa0 * abs(zoom)) + 1.0;
		px1 = (-pa1 * abs(zoom)) + 1.0;
		px2 = (-pa0 * max(-zoom, 0.0)) + 1.0;
		px3 = (-pa1 * max(zoom, 0.0)) + 1.0;
		vec2 uv0, uv1;
		if (zoom > 0.0) {
			uv0 = uv * px0;
			uv1 = uv / px1;
		} else if (zoom < 0.0) {
			uv0 = uv / px0;
			uv1 = uv * px1;
		} else {
			uv0 = uv;
			uv1 = uv;
		}
		uv0 += 0.5;
		uv0 -= (pa0 / px2) * offset;
		uv0 = rot(deg * pa0, uv0);
		uv1 += 0.5;
		uv1 += (pa1 / px3) * offset;
		uv1 = rot(-deg * pa1, uv1);
		if (wrap.x > 1.5) {
			uv0.x = acos(cos(PI * uv0.x)) / PI;
			uv1.x = acos(cos(PI * uv1.x)) / PI;
		} else if (wrap.x > 0.5) {
			uv0.x = mod(uv0.x, 1.0);
			uv1.x = mod(uv1.x, 1.0);
		}
		if (wrap.y > 1.5) {
			uv0.y = acos(cos(PI * uv0.y)) / PI;
			uv1.y = acos(cos(PI * uv1.y)) / PI;
		} else if (wrap.y > 0.5) {
			uv0.y = mod(uv0.y, 1.0);
			uv1.y = mod(uv1.y, 1.0);
		}
		vec4 c = (p < 0.5) ? getFromColor(uv0) : getToColor(uv1);
		if (wrap.x < 0.5) {
			if (p < 0.5)
				c = (uv0.x >= 0.0 && uv0.x <= 1.0) ? c : vec4(0.0, 0.0, 0.0, 1.0);
			else
				c = (uv1.x >= 0.0 && uv1.x <= 1.0) ? c : vec4(0.0, 0.0, 0.0, 1.0);
		}
		if (wrap.y < 0.5) {
			if (p < 0.5)
				c = (uv0.y >= 0.0 && uv0.y <= 1.0) ? c : vec4(0.0, 0.0, 0.0, 1.0);
			else
				c = (uv1.y >= 0.0 && uv1.y <= 1.0) ? c : vec4(0.0, 0.0, 0.0, 1.0);
		}
		if (blur == 0.0) {
			comp = c;
			break;
		}
		comp += c / 50.0;
	}
	return comp;
}`;

const make = makeGlTransition(BODY, {
	zoom: 0.8,
	angle: 0,
	offset: [0, 0] as readonly [number, number],
	exponent: 4,
	wrap: [2, 2] as readonly [number, number],
	blur: 0.5,
	frames: 26,
});

const WRAP = {mirror: 2, repeat: 1, black: 0} as const;

/**
 * Exponential swish: the old shot accelerates into a point at the centre (up to 5x, with motion blur), cuts at the middle,
 * and the new shot arrives as a swarm of mirror-tiled copies that rushes outward and settles to one full frame. 20-30 frames.
 * Set `frames` to the transition's durationInFrames so the blur shutter matches.
 */
export const swish = (props: SwishProps = {}) => {
	const {wrap = 'mirror', ...rest} = props;
	const w = WRAP[wrap] ?? 2;
	return make({...rest, wrap: [w, w] as const});
};

const Demo = makeTransitionDemo([{presentation: swish({frames: 26}), durationInFrames: 26, timing: linearTiming({durationInFrames: 26})}], 10, 12);

export const swishEntry: LibraryEntry = {
	meta: {
		id: 'swish',
		title: 'Swish',
		category: 'transitions',
		looks: 'Zoom-through: the old shot rushes into a single point at 5x with motion blur, cuts, and the new shot flies out as a mirror-tiled swarm that slows into one full frame.',
		use: 'Fast section changes, "dive into the map / screen" shots, power-ups, any jump that should feel like travelling through the picture.',
		exportName: 'swish',
		durationInFrames: 48,
		source: {
			kind: 'ported',
			name: 'xfade-easing Exponential_Swish (Boundless / Raymond Luckhurst)',
			url: 'https://github.com/scriptituk/xfade-easing/blob/main/glsl/Exponential_Swish.glsl',
			license: 'MIT',
		},
	},
	Demo,
};
