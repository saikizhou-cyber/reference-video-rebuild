// Ported from KinoGlitch (https://github.com/keijiro/KinoGlitch), MIT, Copyright (C) 2015 Keijiro Takahashi. Changes: HLSL -> GLSL ES 3.00 for makeShaderEffect; sin-hash nrand() replaced by an integer hash seeded from the frame; scan-line rows made resolution independent (rowSize in px at 720p); parameter mapping of AnalogGlitch.cs folded into the shader; premultiplied alpha kept; burst helper added.
import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Filter} from '../../core/filter';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {DemoPlate, GLSL_HASH, glitchBursts, hashF, hashU, type Burst} from './_signal-utils';

const defaults = {
	/** 0..1 scan-line jitter: how many rows tear sideways and how far (Kino scanLineJitter) */
	jitter: 0.5,
	/** 0..1 vertical jump: how much the picture rolls up the screen (Kino verticalJump) */
	jump: 0.1,
	/** where the vertical roll currently is (add ~0.1 per frame for a rolling band) */
	jumpPhase: 0.35,
	/** 0..1 horizontal shake of the whole frame (Kino horizontalShake) */
	shake: 0.25,
	/** 0..1 colour drift: the green channel snakes sideways down the picture (Kino colorDrift) */
	drift: 0.5,
	/** phase of the colour-drift wave */
	driftPhase: 0,
	/** integer that picks the random pattern: pass something that changes per frame (the frame number) */
	seed: 1,
	/** height of one jittering row, px at 720p */
	rowSize: 2,
};

/**
 * Analog video fault in one cheap pass (2 taps): scan-line jitter, vertical roll with wrap-around,
 * horizontal shake and a wobbling green-channel drift. Fires as long as the params are non-zero:
 * drive them from glitchBursts() so it comes and goes (see analogGlitchFromBurst).
 */
export const analogGlitch = makeShaderEffect({
	type: 's17-analog-glitch',
	label: 'Analog glitch',
	defaults,
	body: `${GLSL_HASH}
uniform float jitter;
uniform float jump;
uniform float jumpPhase;
uniform float shake;
uniform float drift;
uniform float driftPhase;
uniform float seed;
uniform float rowSize;

vec4 effect(vec2 uv) {
	float u = min(resolution.x, resolution.y) / 720.0;
	uint s = uf(seed);
	// Kino's AnalogGlitch.cs mapping from the 0..1 sliders to shader values
	float thresh = clamp(1.0 - jitter * 1.2, 0.0, 1.0);
	float disp = 0.002 + pow(jitter, 3.0) * 0.05;

	// scan-line jitter: each row of rowSize px gets its own random in [-1, 1]; only the strong ones slide
	float row = floor((1.0 - uv.y) * resolution.y / (rowSize * u));
	float j = hf(hu3(uf(row), s, 1u)) * 2.0 - 1.0;
	j *= step(thresh, abs(j)) * disp;

	// vertical jump: blend v toward fract(v + phase) so the picture rolls with wrap-around
	float jumped = mix(uv.y, fract(uv.y + jumpPhase), jump);

	// horizontal shake of the whole frame
	float sh = (hf(hu2(s, 2u)) - 0.5) * shake * 0.2;

	// colour drift: green is sampled shifted by a wave that runs down the (rolled) picture
	float dr = sin(jumped + driftPhase) * drift * 0.04;

	vec4 a = getColor(fract(vec2(uv.x + j + sh, jumped)));
	vec4 b = getColor(fract(vec2(uv.x + j + sh + dr, jumped)));
	return vec4(a.r, b.g, a.b, max(a.a, b.a));
}`,
});

export type AnalogGlitchParams = Parameters<typeof analogGlitch>[0];

/** Turns a glitchBursts() state into analogGlitch params: calm = all zero, burst = tearing + roll + drift scaled by its intensity. */
export const analogGlitchFromBurst = (b: Burst, {strength = 1, roll = 1}: {strength?: number; roll?: number} = {}): AnalogGlitchParams => {
	if (!b.active) {
		return {jitter: 0, jump: 0, shake: 0, drift: 0, seed: b.seed};
	}
	const i = Math.min(1, b.intensity * strength);
	// the roll keeps moving through the burst (phase grows ~0.11 per frame) from a start that differs per burst
	const start = hashF(hashU(b.index * 7919 + 17));
	return {
		jitter: i * 0.95,
		jump: i * 0.35 * roll,
		jumpPhase: start + b.age * 0.11,
		shake: i * 0.7,
		drift: i,
		driftPhase: (b.seed % 628) / 100,
		seed: b.seed,
	};
};

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const burst = glitchBursts(frame, {seed: 26, gap: [2, 5], length: [4, 8], peak: [0.5, 0.9]});
	return (
		<Filter effects={[analogGlitch(analogGlitchFromBurst(burst))]}>
			<DemoPlate />
		</Filter>
	);
};

export const analogGlitchEntry: LibraryEntry = {
	meta: {
		id: 'analog-glitch',
		title: 'Analog glitch',
		category: 'fx',
		looks: 'Scan-line strips tear sideways, the picture rolls up the screen and a green fringe snakes down it, in short bursts.',
		use: 'Signal-loss beats: a hacked screen, a corrupted flashback, the hit before a cut. Drive it with glitchBursts().',
		exportName: 'analogGlitch',
		durationInFrames: 72,
		source: {kind: 'ported', name: 'KinoGlitch (AnalogGlitch)', url: 'https://github.com/keijiro/KinoGlitch', license: 'MIT'},
	},
	Demo,
};
