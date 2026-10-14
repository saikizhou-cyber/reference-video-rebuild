// Ported from pixijs/filters ShockwaveFilter (https://github.com/pixijs/filters/blob/main/src/shockwave/shockwave.frag), MIT, Copyright (c) 2013-2025 Mathew Groves, Chad Engler.
// Changes: rewritten as a makeShaderEffect body working in px at 720p; centre as a frame fraction; added chromatic split of the refraction,
// a bright crest rim and a smooth fade-out; the pmndrs ShockWaveEffect variant (gist of unknown licence) was NOT used.
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {Filter} from '../../core/filter';
import {Plate} from '../../core/scene';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {hex, toUv, type Vec2, type Vec3} from './_look-utils';

export type ShockwaveProps = {
	/** seconds since the hit (frame / fps). <= 0 = the wave has not started. Start a new instance per hit */
	time?: number;
	/** origin as fractions of the frame, y from the top: [0.5, 0.5] = centre */
	center?: Vec2;
	/** ring speed in px/s at 720p */
	speed?: number;
	/** peak displacement in px at 720p */
	amplitude?: number;
	/** width of the refracting band in px at 720p */
	wavelength?: number;
	/** brightness multiplier at the middle of the band (> 1 lights the ring, < 1 darkens it) */
	brightness?: number;
	/** radius in px at 720p at which the wave has died out (the amplitude fades quadratically); 0 = never */
	maxRadius?: number;
	/** 0..1 chromatic split: red / blue are refracted a little more / less than green */
	split?: number;
	/** 0..1 additive highlight on the crest of the wave, and its colour */
	rim?: number;
	rimColor?: string;
};

const BODY = `
uniform vec2 centre;
uniform float time;
uniform float speed;
uniform float amplitude;
uniform float wavelength;
uniform float brightness;
uniform float maxRadius;
uniform float split;
uniform float rim;
uniform vec3 rimColor;

const float PI = 3.14159265;

vec4 effect(vec2 uv) {
	vec4 plain = getColor(uv);
	float un = resolution.y / 720.0;
	vec2 dir = (uv - centre) * resolution;
	float dist = length(dir);
	float halfW = wavelength * un * 0.5;
	float cur = time * speed * un;
	float fade = 1.0;
	if (maxRadius > 0.0) {
		float mr = maxRadius * un;
		if (cur > mr) { return plain; }
		fade = 1.0 - pow(cur / mr, 2.0);
	}
	if (time <= 0.0 || dist <= 0.0 || dist < cur - halfW || dist > cur + halfW) { return plain; }

	float diff = (dist - cur) / halfW;
	float p = 1.0 - diff * diff;
	float disp = 1.25 * sin(diff * PI) * p * (amplitude * un * fade);
	vec2 off = (dir / dist) * disp / resolution;
	vec4 g = getColor(uv + off);
	float r = getColor(uv + off * (1.0 + split)).r;
	float b = getColor(uv + off * (1.0 - split)).b;
	vec4 col = vec4(r, g.g, b, g.a);
	col.rgb *= 1.0 + (brightness - 1.0) * p * fade;
	col.rgb += rimColor * rim * pow(p, 6.0) * fade * col.a;
	return col;
}
`;

const shockwaveFx = makeShaderEffect({
	type: 's17-shockwave',
	label: 'Shockwave',
	body: BODY,
	defaults: {
		centre: [0.5, 0.5] as Vec2,
		time: 0,
		speed: 500,
		amplitude: 30,
		wavelength: 160,
		brightness: 1.25,
		maxRadius: 1100,
		split: 0.35,
		rim: 0.3,
		rimColor: [1, 0.92, 0.78] as Vec3,
	},
});

/** Shockwave as a Remotion effect: `<Filter effects={[shockwave({center: [0.7, 0.4], time: (frame - hit) / fps})]}>{scene}</Filter>`. */
export const shockwave = ({
	time = 0,
	center = [0.5, 0.5],
	speed = 500,
	amplitude = 30,
	wavelength = 160,
	brightness = 1.25,
	maxRadius = 1100,
	split = 0.35,
	rim = 0.3,
	rimColor = '#ffecc7',
}: ShockwaveProps = {}) =>
	shockwaveFx({
		centre: toUv(center),
		time,
		speed,
		amplitude,
		wavelength,
		brightness,
		maxRadius,
		split,
		rim,
		rimColor: hex(rimColor),
	});

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const hit1 = 6;
	const hit2 = 42;
	// the picture takes a small punch-in on each hit, decaying fast
	const punch = (since: number) => (since >= 0 ? 0.045 * Math.exp(-since / 3.5) : 0);
	const scale = 1 + punch(frame - hit1) + 0.6 * punch(frame - hit2);
	return (
		<Filter
			effects={[
				shockwave({time: (frame - hit1) / fps, center: [0.69, 0.35], speed: 640, amplitude: 40, wavelength: 230, brightness: 1.3}),
				shockwave({time: (frame - hit2) / fps, center: [0.27, 0.6], speed: 560, amplitude: 32, wavelength: 160, brightness: 1.25, maxRadius: 900}),
			]}
		>
			<AbsoluteFill style={{transform: `scale(${scale})`}}>
				<Plate />
			</AbsoluteFill>
		</Filter>
	);
};

export const shockwaveEntry: LibraryEntry = {
	meta: {
		id: 'shockwave',
		title: 'Shockwave',
		category: 'fx',
		looks: 'A bright refracting ring bursts from an impact point, bending the picture outward with a colour fringe as it races across the frame and fades; two hits, each with a punch-in.',
		use: 'Impact frames, explosions, power-up pulses, a drop on the beat; start one instance per hit and feed it (frame - hitFrame) / fps.',
		exportName: 'shockwave',
		durationInFrames: 84,
		source: {
			kind: 'ported',
			name: 'pixijs/filters shockwave',
			url: 'https://github.com/pixijs/filters/blob/main/src/shockwave/shockwave.frag',
			license: 'MIT',
		},
	},
	Demo,
};
