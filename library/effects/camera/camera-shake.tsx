// Ported from HyperFrames music-to-video/screen-shake (https://github.com/heygen-com/hyperframes/blob/main/skills/music-to-video/references/motion-primitives/screen-shake/scene.html), Apache-2.0, Copyright 2026 HeyGen, Inc. Changes: 'stepped' mode keeps its 14-entry offset table and the y = 0.7 * x alternating-sign rule but is rewritten as a pure function of the frame, scaled to 720p units and stretched by `decay`; 'trauma' mode is our own reimplementation (squared-trauma shaping as in pmndrs/drei CameraShake, MIT, concept from the GDC "Math for Game Programmers: Juicing Your Cameras With Math" talk) on seeded value noise. Modified.
import React from 'react';
import {Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {WorldScene, CameraRig, RefMark, Tag, coverScale, hash, noise1} from './_moves-utils';
import {useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

/** A hit: just its frame, or the frame plus how hard it lands (0..1, default 1). */
export type ShakeHit = number | {at: number; power?: number};

export type CameraShakeProps = {
	children: React.ReactNode;
	/** frames (relative to the enclosing <Sequence>) on which a hit lands */
	hits?: ShakeHit[];
	/**
	 * 'trauma' = smooth seeded noise on x / y / roll whose amplitude is trauma squared (violent start, gentle tail);
	 * 'stepped' = hard offsets held a frame each from a decaying table, the classic comic-book hit
	 */
	mode?: 'trauma' | 'stepped';
	/** overall multiplier */
	strength?: number;
	/** how fast a hit dies: trauma per second in 'trauma' mode, the table plays in 1 / decay seconds in 'stepped' mode. Default 2 / 2.4 */
	decay?: number;
	/** px at 720p at full trauma, per axis (trauma mode) */
	maxShift?: number;
	/** degrees of roll at full trauma */
	maxRoll?: number;
	/** noise frequency in Hz (trauma mode); 10-25 reads as impact, lower as a rumble */
	frequency?: number;
	/** 0..1 share of a one-off directional jolt on the hit frame itself (trauma mode) */
	kick?: number;
	/** scale just enough to keep the edges hidden while the frame is displaced */
	overscan?: boolean;
	seed?: number;
	style?: React.CSSProperties;
};

// x offsets in px on a 1920x1080 canvas, one entry per hold; y = 0.7 * x with alternating sign
const STEP_TABLE = [28, -24, 20, -22, 16, -18, 14, -14, 10, -8, 6, -5, 3, -2];
const TO_720 = 2 / 3;

/**
 * Camera shake on hits. Wrap a scene (or a whole composition) and list the frames the impacts land on.
 * Deterministic: a pure function of the frame, the hit list and the seed.
 */
export const CameraShake: React.FC<CameraShakeProps> = ({
	children,
	hits = [0],
	mode = 'trauma',
	strength = 1,
	decay,
	maxShift = 38,
	maxRoll = 3,
	frequency = 16,
	kick = 0.7,
	overscan = true,
	seed = 1,
	style,
}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const u = useUnit();
	const rate = decay ?? (mode === 'stepped' ? 2.4 : 2);
	const list = hits.map((h) => (typeof h === 'number' ? {at: h, power: 1} : {at: h.at, power: h.power ?? 1}));

	let tx = 0;
	let ty = 0;
	let rot = 0;
	let cover = 1;

	if (mode === 'trauma') {
		let trauma = 0;
		let kickEnv = 0;
		let kx = 0;
		let ky = 0;
		let kr = 0;
		for (const h of list) {
			const s = frame - h.at;
			if (s < 0) {
				continue;
			}
			trauma += Math.max(0, h.power - (rate * s) / fps);
			// one directional jolt per hit so the first frame is never a lucky near-zero noise sample
			const k = kick * h.power * h.power * Math.exp(-s / 2.5);
			const a = hash(h.at, seed + 5) * Math.PI;
			kickEnv += k;
			kx += Math.cos(a) * k;
			ky += Math.sin(a) * k * 0.8;
			kr += (hash(h.at, seed + 9) < 0 ? -1 : 1) * k;
		}
		trauma = Math.min(1, trauma);
		const A = trauma * trauma;
		const t = frame / fps;
		const nx = noise1(t * frequency, seed * 3 + 1);
		const ny = noise1(t * frequency + 41.7, seed * 3 + 2);
		const nr = noise1(t * frequency * 0.8 + 83.3, seed * 3 + 3);
		tx = maxShift * u * strength * (A * nx + kx);
		ty = maxShift * u * strength * 0.8 * (A * ny + ky);
		rot = maxRoll * strength * (A * nr + kr * 0.6);
		const env = strength * (A + kickEnv);
		cover = coverScale(width, height, maxShift * u * env, maxShift * u * env * 0.8, maxRoll * env);
	} else {
		const durFrames = fps / rate;
		const N = STEP_TABLE.length;
		for (const h of list) {
			const s = frame - h.at;
			if (s < 0) {
				continue;
			}
			const idx = Math.floor((s * N) / durFrames);
			if (idx >= N) {
				continue;
			}
			const a = STEP_TABLE[idx] * TO_720 * u * h.power * strength;
			tx += a;
			ty += a * 0.7 * (idx % 2 ? -1 : 1);
			rot += (STEP_TABLE[idx] / 28) * h.power * strength * maxRoll * 0.35;
		}
		const cap = 28 * TO_720 * u * strength * 1.5;
		tx = Math.max(-cap, Math.min(cap, tx));
		ty = Math.max(-cap, Math.min(cap, ty));
		cover = coverScale(width, height, Math.abs(tx), Math.abs(ty), Math.abs(rot));
	}

	const scale = overscan ? cover : 1;
	return (
		<CameraRig transform={`translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`} style={style}>
			{children}
		</CameraRig>
	);
};

const HITS: ShakeHit[] = [6, {at: 21, power: 0.8}, {at: 36, power: 0.6}];

const Demo: React.FC = () => (
	<>
		<Sequence durationInFrames={45}>
			<CameraShake hits={HITS}>
				<WorldScene palette="dusk" />
			</CameraShake>
			<RefMark />
			<Tag text="TRAUMA / SMOOTH NOISE" />
		</Sequence>
		<Sequence from={45}>
			<CameraShake mode="stepped" hits={HITS} strength={1.8}>
				<WorldScene palette="ember" />
			</CameraShake>
			<RefMark />
			<Tag text="STEPPED / 1-FRAME HOLDS" />
		</Sequence>
	</>
);

export const cameraShakeEntry: LibraryEntry = {
	meta: {
		id: 'camera-shake',
		title: 'Camera shake',
		category: 'camera',
		looks:
			'The whole frame jolts on each hit: either smooth noise on x / y / roll that starts violent and dies gently (trauma squared), or hard 1-frame offsets from a decaying table.',
		use: 'Impacts, drops and stingers on a beat: wrap the scene and list the hit frames.',
		exportName: 'CameraShake',
		durationInFrames: 90,
		source: {
			kind: 'ported',
			name: 'HyperFrames music-to-video screen-shake (stepped table; trauma mode reimplemented after pmndrs/drei, MIT)',
			url: 'https://github.com/heygen-com/hyperframes/blob/main/skills/music-to-video/references/motion-primitives/screen-shake/scene.html',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
