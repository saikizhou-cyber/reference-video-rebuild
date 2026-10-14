import React from 'react';
import {Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {Filter} from '../../core/filter';
import {progress} from '../../core/easing';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {DemoPlate, GLSL_HASH, frameClock} from './_signal-utils';

/**
 * The picture on a curved CRT: barrel-bent glass with a rounded black bezel, curved scanlines, an RGB phosphor
 * mask, halation around bright areas, misconverged colour towards the corners, a falling-away vignette rim,
 * flicker and an optional rolling bar. `power` < 1 squashes the picture into a bright line (power-on / power-off).
 * Own shader; the ingredients are the usual CRT-filter list, as described for Remocn's crt-screen (MIT) and
 * pixijs/filters' crt (MIT) - none of their code is used.
 * Pass `time` (seconds) and `seed` (frame): crt(crtAt(frame, fps))
 */
const defaults = {
	/** seconds: moves the rolling bar */
	time: 0,
	/** integer that re-rolls the flicker */
	seed: 0,
	/** 0..1 barrel bend of the glass (0 = flat) */
	curvature: 0.42,
	/** 0..1 depth of the dark gaps between scanlines */
	scan: 0.45,
	/** px at 720p from one scanline to the next */
	scanSize: 4,
	/** 0..1 strength of the red / green / blue phosphor stripes */
	mask: 0.3,
	/** px at 720p of one red+green+blue triad (stripes are rounded to whole pixels) */
	maskSize: 6,
	/** 0..1 corner darkening and the fall-off towards the glass edge */
	vignette: 0.6,
	/** 0..1 halation: bright areas bloom into their surroundings */
	glow: 0.3,
	/** px at 720p of red / blue misconvergence at the edge of the screen */
	convergence: 2.5,
	/** 0..1 brightness flutter, a new value every frame */
	flicker: 0.035,
	/** 0..1 strength of a soft bright bar that rolls down the screen */
	roll: 0.5,
	/** corner radius of the screen, share of the half-frame */
	corner: 0.07,
	/** 1 = on; below 1 the picture collapses into a bright horizontal line (0 = a thin line) */
	power: 1,
	/** colour outside the glass, [r, g, b, a] 0..1 */
	bezel: [0, 0, 0, 1] as readonly [number, number, number, number],
};

export const crt = makeShaderEffect({
	type: 's17-crt',
	label: 'CRT',
	defaults,
	body: `${GLSL_HASH}
uniform float time;
uniform float seed;
uniform float curvature;
uniform float scan;
uniform float scanSize;
uniform float mask;
uniform float maskSize;
uniform float vignette;
uniform float glow;
uniform float convergence;
uniform float flicker;
uniform float roll;
uniform float corner;
uniform float power;
uniform vec4 bezel;

vec4 effect(vec2 uv) {
	float u = min(resolution.x, resolution.y) / 720.0;
	uint s = uf(seed);

	// glass: barrel bend, then a rounded rectangle is the screen
	vec2 c = uv * 2.0 - 1.0;
	float pw = max(power, 0.004);
	c.y /= pw;
	float k = curvature * 0.22;
	vec2 w = c * (1.0 + k * c.yx * c.yx);
	vec2 q = abs(w) - (1.0 - corner);
	float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
	float aa = max(fwidth(sd), 1e-4);
	float inside = 1.0 - smoothstep(-aa, aa, sd);
	vec2 tuv = w * 0.5 + 0.5;

	// colour guns: red and blue land a little off towards the edges
	vec2 off = w * (convergence * u / resolution.x);
	vec4 g = getColor(tuv);
	vec3 col = vec3(getColor(tuv - off).r, g.g, getColor(tuv + off).b);

	// halation: a ring of taps, only the bright part blooms
	vec3 halo = vec3(0.0);
	for (int i = 0; i < 12; i++) {
		float fi = float(i);
		float r = sqrt((fi + 0.5) / 12.0) * 10.0 * u;
		float a = fi * 2.39996;
		halo += getColor(tuv + vec2(cos(a), sin(a)) * r / resolution).rgb;
	}
	halo /= 12.0;
	col += max(halo - 0.25, 0.0) * glow * 1.3;

	// scanlines follow the glass (computed in the bent space), beam brightest on the line
	float sl = tuv.y * resolution.y / (scanSize * u);
	float beam = pow(0.5 + 0.5 * cos(sl * 6.28318), 1.2);
	col *= (1.0 - scan * (1.0 - beam)) / (1.0 - 0.5 * scan);

	// phosphor mask: R, G, B stripes at whole-pixel widths
	float sw = max(1.0, floor(maskSize * u / 3.0 + 0.5));
	float idx = mod(floor(uv.x * resolution.x / sw), 3.0);
	vec3 lit = vec3(step(idx, 0.5), step(0.5, idx) * step(idx, 1.5), step(1.5, idx));
	col *= mix(vec3(1.0 - mask), vec3(1.0), lit) / (1.0 - 2.0 * mask / 3.0);

	// vignette and a rim that falls away towards the edge of the glass
	float edge = clamp(-sd, 0.0, 1.0);
	float rim = smoothstep(0.0, 0.18, edge);
	float vig = 1.0 - 0.65 * smoothstep(0.3, 1.0, length(c) / 1.4142);
	col *= mix(1.0, rim * vig, vignette);

	// flicker and a rolling bar (wraps)
	col *= 1.0 + flicker * (hf(hu2(s, 31u)) - 0.5) * 2.0;
	float d = tuv.y - (1.0 - fract(time * 0.14));
	d -= floor(d + 0.5);
	col *= 1.0 + roll * 0.22 * exp(-d * d / 0.012);

	// power: the collapsed line is overdriven
	col *= 1.0 + 5.0 * (1.0 - power);

	float a = g.a;
	vec4 screen = vec4(clamp(col, 0.0, 1.5) * a, a) * inside;
	return screen + (1.0 - inside) * vec4(bezel.rgb * bezel.a, bezel.a);
}`,
});

export type CrtParams = Parameters<typeof crt>[0];

/** time + seed from the frame */
export const crtAt = frameClock;

/**
 * Power curve for a CRT turning on: the picture opens from a line to full height over `frames`.
 *   crt({...crtAt(frame), power: crtPowerOn(frame, 8)})
 */
export const crtPowerOn = (frame: number, start = 0, frames = 16): number => 0.004 + 0.996 * progress(frame, start, frames, Easing.out(Easing.quad));

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return (
		<Filter effects={[crt({...crtAt(frame, fps), power: crtPowerOn(frame, 1, 16)})]}>
			<DemoPlate />
		</Filter>
	);
};

export const crtEntry: LibraryEntry = {
	meta: {
		id: 'crt',
		title: 'CRT screen',
		category: 'fx',
		looks: 'The picture opens from a bright line into a barrel-bent glass with scanlines, RGB phosphor stripes, bloom and a dark rim.',
		use: 'Footage shown on an in-world monitor, arcade / retro sections, a power-on or power-off beat.',
		exportName: 'crt',
		durationInFrames: 72,
		source: {kind: 'inspired', name: 'Remocn CRT Screen filter', url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/crt-screen/index.tsx'},
	},
	Demo,
};
