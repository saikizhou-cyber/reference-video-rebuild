import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Filter} from '../../core/filter';
import {Plate} from '../../core/scene';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {GLSL_UTIL, hex, type Vec3} from './_look-utils';

export type PosterizeProps = {
	/** cel = luminance cut into flat tones with the picture's own colour added back; rgb = every channel crushed to `levels` steps */
	mode?: 'cel' | 'rgb';
	/** number of flat tones (cel) / steps per channel (rgb). Fractions work, but whole numbers read as cel bands */
	levels?: number;
	/** cel: how much of the original chroma is added back on top of the flat tones (1 = hue kept, 0 = pure tone ramp) */
	chroma?: number;
	/** cel: gamma on the luminance before banding. > 1 keeps darks dark (more shadow, fewer lights) */
	curve?: number;
	/** 0..1 ordered (Bayer) dither across the band edges; 0 = hard flat bands */
	dither?: number;
	/** colour cast of the darkest / lightest tone (cel) and how strongly it is applied */
	shadow?: string;
	light?: string;
	tint?: number;
	/** 0 = the scene, 1 = fully posterised */
	amount?: number;
};

const BODY = `
uniform float mode;
uniform float levels;
uniform float chroma;
uniform float curve;
uniform float dither;
uniform float tint;
uniform float amount;
uniform vec3 shadow;
uniform vec3 light;
${GLSL_UTIL}
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
float bayer4(vec2 p) {
	ivec2 q = ivec2(mod(floor(p), 4.0));
	return (BAYER[q.y * 4 + q.x] + 0.5) / 16.0;
}

vec4 effect(vec2 uv) {
	vec4 c = getColor(uv);
	vec3 s = unpremul(c);
	float n = max(levels, 2.0);
	float d = (bayer4(gl_FragCoord.xy) - 0.5) * dither;
	vec3 outc;
	if (mode < 0.5) {
		float lum = luma709(s);
		float x = pow(clamp(lum, 0.0, 1.0), curve) * n + d;
		// flat bands, with the step anti-aliased over about one pixel
		float k = floor(x);
		float w = clamp(fwidth(x) * 0.75, 0.0001, 0.5);
		float idx = clamp(k - 1.0 + smoothstep(0.0, w, x - k), 0.0, n - 1.0);
		float t = idx / (n - 1.0);
		vec3 tone = mix(vec3(t), mix(shadow, light, t), tint);
		outc = tone + (s - lum) * chroma;
	} else {
		outc = floor(s * (n - 1.0) + 0.5 + d) / (n - 1.0);
	}
	outc = clamp(outc, 0.0, 1.0);
	return vec4(mix(s, outc, amount) * c.a, c.a);
}
`;

const posterizeFx = makeShaderEffect({
	type: 's17-posterize',
	label: 'Posterize',
	body: BODY,
	defaults: {
		mode: 0,
		levels: 4,
		chroma: 1,
		curve: 1,
		dither: 0,
		tint: 0.25,
		amount: 1,
		shadow: [0.1, 0.06, 0.2] as Vec3,
		light: [1, 0.93, 0.8] as Vec3,
	},
});

/** Cel / posterize as a Remotion effect: `<Filter effects={[posterize({levels: 4})]}>{scene}</Filter>`. */
export const posterize = ({
	mode = 'cel',
	levels = 4,
	chroma = 1,
	curve = 1.15,
	dither = 0,
	shadow = '#1a0f33',
	light = '#ffedcc',
	tint = 0.25,
	amount = 1,
}: PosterizeProps = {}) =>
	posterizeFx({
		mode: mode === 'cel' ? 0 : 1,
		levels,
		chroma,
		curve,
		dither,
		tint,
		amount,
		shadow: hex(shadow),
		light: hex(light),
	});

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	// crunch: 40 tones down to 4 over 20 frames, one whole step per frame so the bands visibly collapse
	const levels = Math.round(interpolate(progress(frame, 4, 20, CURVES.expoOut), [0, 1], [40, 4]));
	// then the colour drains out of the flat tones and comes back
	const chroma = interpolate(frame, [34, 50, 62], [1, 0.1, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: CURVES.inOutCubic});
	const amount = interpolate(frame, [0, 4], [0, 1], {extrapolateRight: 'clamp'});
	const rgb = frame >= 66;
	return (
		<AbsoluteFill>
			<Filter effects={[posterize(rgb ? {mode: 'rgb', levels: 3, dither: 0} : {mode: 'cel', levels, chroma, amount})]}>
				<Plate />
			</Filter>
		</AbsoluteFill>
	);
};

export const posterizeEntry: LibraryEntry = {
	meta: {
		id: 'posterize',
		title: 'Posterize / cel',
		category: 'fx',
		looks: 'The picture crunches from smooth tone down to four flat cel bands that keep their own hue, drains to a pure tone ramp, comes back, then switches to a 3-step-per-channel colour crush.',
		use: 'Cel-shaded look for a character or a stylised cutscene; the fast levels crunch is a hit / flashback transition; pair with ink-edges for comic outlines.',
		exportName: 'posterize',
		durationInFrames: 84,
		source: {kind: 'original'},
	},
	Demo,
};
