import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Filter} from '../../core/filter';
import {CURVES, progress} from '../../core/easing';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {DemoPlate, GLSL_HASH} from './_signal-utils';

/**
 * Organic film grain with a finishing pass: triangular white noise blended with soft clumps (value noise), both
 * re-rolled from an integer `seed`; weighted by luminance so mid-tones grow the most grain and deep shadows and
 * clipped highlights stay clean; optional colour grain, vignette and a warm (or cold) lower-corner falloff.
 * Own shader. The finishing pass (radial vignette, screen-blended warm corners, a held / stepped seed so held frames
 * stay identical) generalises the author's own Post / Grain helpers from a finished PV project.
 * Seed it from the frame: filmGrain({seed: filmGrainSeed(frame, 2)})  (2 = a new grain every second frame)
 */
const defaults = {
	/** 0..1 grain amplitude (0.1 = faint, 0.25 = film, 0.5 = heavy 16 mm) */
	intensity: 0.22,
	/** px at 720p of one grain cell */
	size: 1,
	/** 0..1: 0 = crisp white noise, 1 = soft emulsion clumps */
	clump: 0.5,
	/** 0 = grey grain, 1 = independent grain per colour channel */
	chroma: 0.15,
	/** 0..1 how much grain survives in deep shadows and bright highlights (1 = flat additive noise) */
	shadows: 0.35,
	/** integer that picks the grain pattern: pass filmGrainSeed(frame, hold) */
	seed: 1,
	/** 0..1 corner darkening (or tinting) */
	vignette: 0.35,
	/** 0..1 where the vignette starts, as a share of the corner distance */
	vignetteInner: 0.45,
	/** colour the vignette fades to, [r, g, b] 0..1 */
	vignetteColor: [0, 0, 0] as readonly [number, number, number],
	/** 0..1 strength of the glow in the two lower corners (screen blend) */
	warm: 0,
	/** colour of that glow, [r, g, b] 0..1: warm red by default, try a teal for a cold look */
	warmColor: [1, 0.36, 0.2] as readonly [number, number, number],
};

export const filmGrain = makeShaderEffect({
	type: 's17-film-grain',
	label: 'Film grain',
	defaults,
	body: `${GLSL_HASH}
uniform float intensity;
uniform float size;
uniform float clump;
uniform float chroma;
uniform float shadows;
uniform float seed;
uniform float vignette;
uniform float vignetteInner;
uniform vec3 vignetteColor;
uniform float warm;
uniform vec3 warmColor;

float vnoise(vec2 p, uint s) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	uint ix = uf(i.x);
	uint iy = uf(i.y);
	float a = hf(hu3(ix, iy, s));
	float b = hf(hu3(ix + 1u, iy, s));
	float c = hf(hu3(ix, iy + 1u, s));
	float d = hf(hu3(ix + 1u, iy + 1u, s));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// one grain value in [-1, 1] for a channel: crisp triangular noise mixed with soft clumps
float grain(vec2 cell, uint s, uint ch) {
	uint ix = uf(cell.x);
	uint iy = uf(cell.y);
	uint k = s * 4u + ch;
	float crisp = hf(hu3(ix, iy, k)) + hf(hu3(iy, ix + 977u, k + 5000u)) - 1.0;
	float soft = ((vnoise(cell / 2.2, k + 9000u) - 0.5) * 0.65 + (vnoise(cell / 5.0, k + 9500u) - 0.5) * 0.35) * 3.6;
	return clamp(mix(crisp, soft, clump), -1.0, 1.0);
}

vec4 effect(vec2 uv) {
	float u = min(resolution.x, resolution.y) / 720.0;
	vec4 src = getColor(uv);
	float a = max(src.a, 1e-4);
	vec3 rgb = src.rgb / a;
	float aspect = resolution.x / resolution.y;

	// warm / cold glow from the two lower corners, screen-blended
	float d1 = length(uv * vec2(aspect, 1.0));
	float d2 = length((vec2(1.0 - uv.x, uv.y)) * vec2(aspect, 1.0));
	float wm = warm * (exp(-pow(d1 / 0.6, 2.0)) + exp(-pow(d2 / 0.6, 2.0)));
	rgb = 1.0 - (1.0 - rgb) * (1.0 - warmColor * min(wm, 1.0));

	// vignette: ellipse that reaches the corners, transparent until vignetteInner
	float vr = length((uv - 0.5) * 2.0) / 1.4142;
	rgb = mix(rgb, vignetteColor, vignette * smoothstep(vignetteInner, 1.0, vr));

	// luminance-weighted grain
	vec2 cell = uv * resolution / (size * u);
	uint s = uf(seed);
	float g0 = grain(cell, s, 0u);
	vec3 n = mix(vec3(g0), vec3(grain(cell, s, 1u), grain(cell, s, 2u), grain(cell, s, 3u)), chroma);
	float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
	float weight = mix(shadows, 1.0, 4.0 * lum * (1.0 - lum));
	rgb += n * intensity * 0.5 * weight;

	return vec4(clamp(rgb, 0.0, 1.0) * src.a, src.a);
}`,
});

export type FilmGrainParams = Parameters<typeof filmGrain>[0];

/** Grain seed that holds for `hold` frames (1 = new grain every frame, 2 = "on twos", a stepped seed keeps held frames identical). */
export const filmGrainSeed = (frame: number, hold = 1): number => Math.floor(frame / Math.max(1, hold));

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	// from clean to heavy, with the warm corner glow arriving last
	const amount = progress(frame, 0, 60, CURVES.inOutCubic);
	return (
		<Filter
			effects={[
				filmGrain({
					seed: filmGrainSeed(frame, 2),
					intensity: 0.05 + 0.35 * amount,
					vignette: 0.15 + 0.4 * amount,
					warm: 0.7 * progress(frame, 30, 36, CURVES.quintOut),
				}),
			]}
		>
			<DemoPlate ticker={false} />
		</Filter>
	);
};

export const filmGrainEntry: LibraryEntry = {
	meta: {
		id: 'film-grain',
		title: 'Film grain',
		category: 'fx',
		looks: 'Boiling grain that clumps like emulsion, strongest in the mid-tones, with a vignette and a warm glow in the lower corners.',
		use: 'The last layer on almost any shot: ties CG, 2D and type into one filmic picture. Raise it for flashbacks.',
		exportName: 'filmGrain',
		durationInFrames: 72,
		source: {kind: 'original'},
	},
	Demo,
};
