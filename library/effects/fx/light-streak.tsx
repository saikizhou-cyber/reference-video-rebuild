import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Filter} from '../../core/filter';
import {Plate} from '../../core/scene';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {GLSL_UTIL, hex, mixHex, type Vec3} from './_look-utils';

export type LightStreakProps = {
	/** reach of the streak on each side of a highlight, px at 720p */
	length?: number;
	/** brightness (0..1) above which a pixel throws a streak; high values give thin streaks off lamps and glints only */
	threshold?: number;
	/** gain of the streak (soft-saturated, so it never clips to a flat bar) */
	intensity?: number;
	/** colour of the streak and how much of it replaces the highlight's own colour */
	tint?: string;
	tintAmount?: number;
	/** 0..1 dispersion: red reaches shorter than green, blue longer, so tails fade from white to the tint */
	spread?: number;
	/** direction in degrees; 0 = horizontal (anamorphic), 90 = vertical */
	angle?: number;
	/** falloff exponent along the streak: 1 = linear tent, higher = tighter around the highlight */
	falloff?: number;
	/** vertical softness of the streak edge in px at 720p (0 = hard, saves two thirds of the samples) */
	soft?: number;
	/** samples per side (more = smoother tails on small lights, slower) */
	taps?: number;
};

const BODY = `
uniform float len;
uniform float threshold;
uniform float intensity;
uniform float tintAmount;
uniform float spread;
uniform float angle;
uniform float falloff;
uniform float taps;
uniform float soft;
uniform vec3 tint;
${GLSL_UTIL}

float hot(vec2 uv) {
	vec3 c = getColor(uv).rgb;
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	float k = clamp((l - threshold) / max(1.0 - threshold, 1e-3), 0.0, 1.0);
	return k * k;
}

// the highlight seen through three rows (centre and +-perp): gives the streak a soft top and bottom edge
float hotRows(vec2 p, vec2 perp) {
	if (soft <= 0.01) { return hot(p); }
	return hot(p) * 0.52 + (hot(p + perp) + hot(p - perp)) * 0.24;
}

vec4 effect(vec2 uv) {
	vec4 src = getColor(uv);
	if (len <= 0.5 || intensity <= 0.0) { return src; }
	float un = resolution.y / 720.0;
	float a = radians(angle);
	vec3 reach = len * un * vec3(1.0 - 0.45 * spread, 1.0, 1.0 + 0.35 * spread);
	float stepPx = reach.b / taps;
	vec2 stepUv = vec2(cos(a), sin(a)) * stepPx / resolution;
	float jit = hash12(gl_FragCoord.xy) - 0.5;
	vec2 perp = soft > 0.01 ? vec2(-sin(a), cos(a)) * soft * un / resolution : vec2(0.0);
	vec3 acc = vec3(hotRows(uv, perp));
	for (int i = 1; i <= 160; i++) {
		if (float(i) > taps) { break; }
		// a per-pixel offset of the sample positions turns the beading of small lights into fine grain
		float fi = float(i) + jit;
		float k = hotRows(uv + stepUv * fi, perp) + hotRows(uv - stepUv * fi, perp);
		vec3 w = pow(max(vec3(1.0) - (fi * stepPx) / reach, 0.0), vec3(falloff));
		acc += k * w;
	}
	// one 10 px wide highlight gives roughly 1.0 of gain at its edge; soft-saturate like film
	vec3 streak = 1.0 - exp(-acc * (stepPx / (10.0 * un)) * intensity);
	vec3 col = streak * mix(vec3(1.0), tint, tintAmount);
	vec3 rgb = 1.0 - (1.0 - src.rgb) * (1.0 - col);
	return vec4(rgb, max(src.a, max(col.r, max(col.g, col.b))));
}
`;

const lightStreakFx = makeShaderEffect({
	type: 's17-light-streak',
	label: 'Light streak',
	body: BODY,
	defaults: {
		len: 420,
		threshold: 0.92,
		intensity: 1.5,
		tintAmount: 0.8,
		spread: 0.6,
		angle: 0,
		falloff: 2,
		taps: 96,
		soft: 3.5,
		tint: [0.45, 0.62, 1] as Vec3,
	},
});

/** Anamorphic light streaks as a Remotion effect: `<Filter effects={[lightStreak({length: 420})]}>{scene}</Filter>`. */
export const lightStreak = ({
	length = 420,
	threshold = 0.92,
	intensity = 1.5,
	tint = '#7396ff',
	tintAmount = 0.8,
	spread = 0.6,
	angle = 0,
	falloff = 2,
	taps = 96,
	soft = 3.5,
}: LightStreakProps = {}) =>
	lightStreakFx({len: length, threshold, intensity, tintAmount, spread, angle, falloff, soft, taps: Math.min(160, Math.max(8, Math.round(taps))), tint: hex(tint)});

/** demo-only: small, hard lights placed over the plate so there is something to streak */
const LAMPS: ReadonlyArray<readonly [number, number, number, string]> = [
	[0.12, 0.8, 9, '#ffffff'],
	[0.33, 0.73, 8, '#fff3d8'],
	[0.52, 0.86, 10, '#ffffff'],
	[0.74, 0.77, 8, '#e8f6ff'],
	[0.9, 0.84, 9, '#ffffff'],
];

const Lamp: React.FC<{x: number; y: number; r: number; color: string}> = ({x, y, r, color}) => (
	<div
		style={{
			position: 'absolute',
			left: `${x * 100}%`,
			top: `${y * 100}%`,
			width: r * 2,
			height: r * 2,
			marginLeft: -r,
			marginTop: -r,
			borderRadius: '50%',
			background: `radial-gradient(circle, ${color} 0%, ${color} 55%, rgba(255,255,255,0) 100%)`,
		}}
	/>
);

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	// the streaks snap open on frame 4 and settle; the tint turns from cold blue to a warm amber for the second half
	const length = 440 * progress(frame, 4, 9, CURVES.snap);
	const intensity = 1.8 + 1.6 * Math.exp(-Math.max(0, frame - 4) / 5);
	const tint = mixHex('#6f93ff', '#ffa24a', progress(frame, 44, 14, CURVES.inOutCubic));
	// a hot orb crosses the frame so the streak is seen following a light
	const orbX = interpolate(frame, [18, 80], [-0.05, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	// the sun gets a white-hot core that flares on the hit, so one streak runs clean through it
	const core = 15 + 9 * Math.exp(-Math.max(0, frame - 4) / 6);
	return (
		<Filter effects={[lightStreak({length, intensity, tint, threshold: 0.975})]}>
			<Plate />
			<AbsoluteFill>
				{LAMPS.map(([x, y, r, c], i) => (
					<Lamp key={i} x={x} y={y} r={r} color={c} />
				))}
				<Lamp x={0.697} y={0.349} r={core} color="#ffffff" />
				<Lamp x={orbX} y={0.5} r={13} color="#ffffff" />
			</AbsoluteFill>
		</Filter>
	);
};

export const lightStreakEntry: LibraryEntry = {
	meta: {
		id: 'light-streak',
		title: 'Light streak',
		category: 'fx',
		looks: 'Every bright point in the frame snaps out a long horizontal anamorphic streak, white-hot at the core and fading to blue (then amber) in the tails.',
		use: 'Cinematic flare on lamps, neon, sun glints and muzzle flashes; a moving light drags its streak with it. Animate length with a snap curve on a hit.',
		exportName: 'lightStreak',
		durationInFrames: 84,
		source: {
			kind: 'inspired',
			name: 'vfx-js anamorphic light streaks / HyperFrames vfx-anamorphic-flare',
			url: 'https://github.com/fand/vfx-js/blob/main/packages/effects/src/light-streak.ts',
		},
	},
	Demo,
};
