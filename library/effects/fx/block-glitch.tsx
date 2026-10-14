// Ported from KinoGlitch (https://github.com/keijiro/KinoGlitch), MIT, Copyright (C) 2015 Keijiro Takahashi. Changes: HLSL -> GLSL ES 3.00 for makeShaderEffect; the 64x32 run-structured noise texture is computed in the shader from an integer hash (no texture upload, no Unity Random); the 13/73-frame "trash" captures become GlitchTrash, a time-lagged copy of the scene clipped to the same blocks (frame-pure); premultiplied alpha kept; displace and grid exposed; burst helpers added.
// glitchBursts (the sporadic-burst scheduler, in _signal-utils.tsx) is our own design, not part of Kino.
import React, {useMemo} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {Filter} from '../../core/filter';
import {makeShaderEffect} from '../../core/shader-effect';
import type {LibraryEntry} from '../../core/types';
import {DemoPlate, GLSL_HASH, glitchBursts, hash2, hash3, hashF, rnd} from './_signal-utils';

export {glitchBursts} from './_signal-utils';
export type {Burst, BurstOptions} from './_signal-utils';

/**
 * Digital block glitch (KinoGlitch "Digital"). A 64 x 32 grid of blocks, each with four random numbers
 * (x, y, z, w). The noise is built like Kino's texture: every block keeps the previous block's numbers and
 * re-rolls them only with a 0.11 chance, which leaves horizontal runs of identical blocks, so the grid reads
 * as wide rectangles rather than confetti. Per block, with threshold = 1.001 - intensity * 1.001:
 *   z^2.5 >= threshold  -> the block shows the picture from (x, y) away (wrapped), the "displacement" block
 *   z^3.5 >= threshold  -> its channels are swizzled to g, r, b and lifted by (1 - sum) / 2: green / magenta corruption
 *   w^2.5 >= threshold  -> the block shows an OLD frame ("trash"): see GlitchTrash (needs a second render of the scene)
 * Higher intensity = more blocks. The noise is only re-rolled when `seed` changes, so blocks pop instead of crawl.
 */
const defaults = {
	/** 0..1: share of blocks that glitch (0 = untouched) */
	intensity: 0.4,
	/** which random grid: pass blockGlitchSeed(frame) */
	seed: 1,
	/** blocks across and down, [cols, rows] (Kino: 64 x 32) */
	grid: [64, 32] as readonly [number, number],
	/** 0..1: how far a displaced block reaches into the picture (1 = anywhere, as in Kino; 0.2 = nearby) */
	displace: 1,
};

export const blockGlitch = makeShaderEffect({
	type: 's17-block-glitch',
	label: 'Block glitch',
	defaults,
	body: `${GLSL_HASH}
uniform float intensity;
uniform float seed;
uniform vec2 grid;
uniform float displace;

// the four random numbers of block idx: a run of blocks shares one set, a new run starts with chance 0.11
vec4 blockNoise(uint idx, uint s) {
	uint k = idx;
	for (int n = 0; n < 48; n++) {
		if (k == 0u || hf(hu3(k, s, 11u)) > 0.89) { break; }
		k -= 1u;
	}
	return vec4(hf(hu3(k, s, 1u)), hf(hu3(k, s, 2u)), hf(hu3(k, s, 3u)), hf(hu3(k, s, 4u)));
}

vec4 effect(vec2 uv) {
	uint cols = uint(grid.x);
	uint rows = uint(grid.y);
	uint cx = min(uint(uv.x * grid.x), cols - 1u);
	uint cy = min(uint(uv.y * grid.y), rows - 1u);
	vec4 glitch = blockNoise(cy * cols + cx, uf(seed));

	float thresh = 1.001 - intensity * 1.001;
	float wd = step(thresh, pow(glitch.z, 2.5)); // displacement glitch
	float wc = step(thresh, pow(glitch.z, 3.5)); // colour glitch

	vec2 uv2 = fract(uv + glitch.xy * displace * wd);
	vec4 src = getColor(uv2);

	// swizzle on straight colour, then premultiply again
	vec3 color = src.a > 0.0 ? src.rgb / src.a : vec3(0.0);
	vec3 neg = clamp(color.grb + (1.0 - dot(color, vec3(1.0))) * 0.5, 0.0, 1.0);
	color = mix(color, neg, wc);
	return vec4(color * src.a, src.a);
}`,
});

export type BlockGlitchParams = Parameters<typeof blockGlitch>[0];

/**
 * Frame-pure noise version for blockGlitch / GlitchTrash. The grid is re-rolled on a hold-frame beat
 * with probability `churn` (Kino re-rolls 10-50 % of frames at 60 fps; at 30 fps a PV wants more).
 */
export const blockGlitchSeed = (frame: number, {seed = 1, hold = 2, churn = 0.7}: {seed?: number; hold?: number; churn?: number} = {}): number => {
	let s = Math.floor(frame / Math.max(1, hold));
	for (let n = 0; n < 64 && s > 0; n++) {
		if (rnd(seed, s, 21) < churn) {
			break;
		}
		s--;
	}
	return hash2(seed, s) & 0xffffff;
};

type Block = {x: number; y: number; z: number; w: number};

/** the same block numbers as the shader (JS twin of blockNoise, including its 48-block cap on a run), for every block of the grid */
const noiseGrid = (cols: number, rows: number, seed: number): Block[] => {
	const roll = (k: number): Block => ({
		x: hashF(hash3(k, seed, 1)),
		y: hashF(hash3(k, seed, 2)),
		z: hashF(hash3(k, seed, 3)),
		w: hashF(hash3(k, seed, 4)),
	});
	const out: Block[] = [];
	for (let i = 0; i < cols * rows; i++) {
		let k = i;
		for (let n = 0; n < 48; n++) {
			if (k === 0 || hashF(hash3(k, seed, 11)) > 0.89) {
				break;
			}
			k--;
		}
		out.push(roll(k));
	}
	return out;
};

export type GlitchTrashProps = {
	/** same value as blockGlitch's intensity */
	intensity: number;
	/** same value as blockGlitch's seed */
	seed: number;
	/** same value as blockGlitch's grid */
	grid?: readonly [number, number];
	/** the two stale-frame lengths: a block shows the scene as it was frame % period frames ago (Kino captured every 13th and 73rd frame) */
	periods?: readonly [number, number];
	children: React.ReactNode;
};

/**
 * The "frame glitch" of the Digital Glitch: some blocks show an old picture. Put it INSIDE the <Filter>, around
 * the scene, and give it the blockGlitch values; it clips time-lagged copies of the scene (frame - frame % 13 and
 * frame - frame % 73, so the lag is a pure function of the frame) to the flagged blocks.
 * Cost: renders the scene up to 3 times while intensity > 0 (cheap for DOM scenes, heavy with video).
 */
export const GlitchTrash: React.FC<GlitchTrashProps> = ({intensity, seed, grid = [64, 32], periods = [13, 73], children}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const [cols, rows] = grid;
	const clips = useMemo(() => {
		const thresh = 1.001 - intensity * 1.001;
		const layers: string[][] = [[], []];
		if (intensity <= 0) {
			return layers;
		}
		const blocks = noiseGrid(cols, rows, seed);
		for (let cy = 0; cy < rows; cy++) {
			// merge neighbouring flagged blocks of the same layer in a row into one rectangle
			let runStart = -1;
			let runLayer = -1;
			const flush = (end: number) => {
				if (runStart >= 0) {
					const x0 = Math.floor((runStart * width) / cols);
					const x1 = Math.ceil((end * width) / cols);
					const y0 = Math.floor(((rows - 1 - cy) * height) / rows);
					const y1 = Math.ceil(((rows - cy) * height) / rows);
					layers[runLayer].push(`M${x0} ${y0}H${x1}V${y1}H${x0}Z`);
				}
				runStart = -1;
				runLayer = -1;
			};
			for (let cx = 0; cx < cols; cx++) {
				const i = cy * cols + cx;
				const flagged = Math.pow(blocks[i].w, 2.5) >= thresh;
				const layer = hashF(hash3(i, seed, 12)) < 0.5 ? 0 : 1;
				if (!flagged || layer !== runLayer) {
					flush(cx);
				}
				if (flagged && runStart < 0) {
					runStart = cx;
					runLayer = layer;
				}
			}
			flush(cols);
		}
		return layers;
	}, [intensity, seed, cols, rows, width, height]);

	return (
		<AbsoluteFill>
			{children}
			{clips.map((rects, li) =>
				rects.length ? (
					<AbsoluteFill key={li} style={{clipPath: `path('${rects.join(' ')}')`}}>
						<Sequence from={frame % periods[li]} name={`trash-${periods[li]}`}>
							{children}
						</Sequence>
					</AbsoluteFill>
				) : null,
			)}
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const burst = glitchBursts(frame, {seed: 26, gap: [2, 5], length: [4, 8], peak: [0.3, 0.6]});
	const seed = blockGlitchSeed(frame, {seed: 3, hold: 2, churn: 0.8});
	return (
		<Filter effects={[blockGlitch({intensity: burst.intensity, seed, displace: 0.6})]}>
			<GlitchTrash intensity={burst.intensity} seed={seed}>
				<DemoPlate />
			</GlitchTrash>
		</Filter>
	);
};

export const blockGlitchEntry: LibraryEntry = {
	meta: {
		id: 'block-glitch',
		title: 'Block glitch',
		category: 'fx',
		looks: 'Wide rectangles jump to other parts of the picture, flip to green/magenta, or show the scene a few frames ago.',
		use: 'Data-corruption hits: a system breach, a cut that must feel broken, a boss reveal. Fire it with glitchBursts().',
		exportName: 'blockGlitch',
		durationInFrames: 72,
		source: {kind: 'ported', name: 'KinoGlitch (DigitalGlitch)', url: 'https://github.com/keijiro/KinoGlitch', license: 'MIT'},
	},
	Demo,
};
