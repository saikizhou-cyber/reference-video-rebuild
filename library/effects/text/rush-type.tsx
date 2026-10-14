import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES} from '../../core/easing';
import {DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {fitSize, measure} from './_display-utils';

export type RushTypeProps = {
	/** one forceful word at a time */
	words: string[];
	/** px at 720p */
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number | string;
	/** word colour (the three channels add up to this when the word rests) */
	color?: string;
	/** opaque plate behind the words (null = transparent, the channels then blend over what is below) */
	background?: string | null;
	/** frames the word takes to arrive from small, still trailing */
	arriveFrames?: number;
	/** frames the word rests pixel-sharp */
	holdFrames?: number;
	/** frames of the rush toward camera */
	rushFrames?: number;
	/** scale the word reaches at the end of its rush */
	rushScale?: number;
	/** multiplies the length of the three shutters (0 = no trails) */
	trail?: number;
	/** the last word stays instead of rushing out */
	lastStays?: boolean;
	/** the word is shrunk to fit this share of the frame width at rest (0 = never shrink) */
	fitWidth?: number;
	style?: React.CSSProperties;
};


/** shutter lengths in frames: green longest, blue tightest, red between */
const SHUTTER = {r: 0.55, g: 0.95, b: 0.3};

const hexRgb = (hex: string): [number, number, number] => {
	let h = hex.replace('#', '');
	if (h.length === 3) {
		h = h
			.split('')
			.map((c) => c + c)
			.join('');
	}
	const n = parseInt(h.slice(0, 6), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Splits `total` into `n` integer parts that add up to exactly `total` (so additive layers conserve brightness). */
const split = (total: number, n: number): number[] => {
	const base = Math.floor(total / n);
	const extra = total - base * n;
	return Array.from({length: n}, (_, i) => base + (i < extra ? 1 : 0));
};

/**
 * One forceful word at a time. Each word arrives from small, rests pixel-sharp, then rushes toward the
 * camera. While it moves, the same glyph is accumulated into R, G and B over different shutter lengths
 * (green longest, blue tightest), so the motion leaves vertical RGB trails; once it stops all three
 * channels land on the same pixels and the word resolves to its colour with no crossfade.
 * Starts at frame 0 of its <Sequence>.
 */
export const RushType: React.FC<RushTypeProps> = ({
	words,
	fontSize = 290,
	fontFamily = DISPLAY_FONT,
	fontWeight = 400,
	color = '#ffffff',
	background = '#000000',
	arriveFrames = 4,
	holdFrames = 8,
	rushFrames = 8,
	rushScale = 5,
	trail = 1,
	lastStays = true,
	fitWidth = 0.8,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const {width, height} = useVideoConfig();
	const cycle = arriveFrames + holdFrames + rushFrames;
	const last = words.length - 1;
	const w = Math.max(0, Math.min(last, Math.floor(frame / cycle)));
	const local = frame - w * cycle;
	const stays = w === last && lastStays;
	const word = words[w] ?? '';
	const fs = fitSize(word, fontFamily, fontSize * u, fitWidth * width, fontWeight);
	const box = measure(word, fontFamily, fs, fontWeight);
	const cy = box.baseline - box.capHeight / 2;

	/** pose of the word at time l (frames since the word started): scale and vertical offset in px */
	const pose = (l: number) => {
		const t = Math.max(0, l);
		if (t < arriveFrames) {
			const q = CURVES.expoOut(t / arriveFrames);
			return {s: 0.62 + 0.38 * q, y: (1 - q) * 0.17 * height};
		}
		if (stays || t < arriveFrames + holdFrames) {
			return {s: 1, y: 0};
		}
		const r = Math.min(1, (t - arriveFrames - holdFrames) / Math.max(1, rushFrames));
		const q = Math.pow(r, 2.2);
		return {s: Math.exp(q * Math.log(rushScale)), y: -Math.pow(q, 1.3) * 0.26 * height};
	};

	const cur = pose(local);
	const longest = SHUTTER.g * trail;
	const back = pose(local - longest);
	const moving = trail > 0 && (Math.abs(cur.s - back.s) > 0.004 || Math.abs(cur.y - back.y) > 0.5);
	const [cr, cg, cb] = hexRgb(color);

	const layer = (key: React.Key, p: {s: number; y: number}, css: React.CSSProperties) => (
		<div
			key={key}
			style={{
				position: 'absolute',
				left: width / 2 - box.width / 2,
				top: height / 2 - cy,
				width: box.width,
				height: fs,
				lineHeight: 1,
				whiteSpace: 'pre',
				textAlign: 'center',
				fontFamily,
				fontWeight,
				fontSize: fs,
				transformOrigin: `${box.width / 2}px ${cy}px`,
				transform: `translateY(${p.y}px) scale(${p.s})`,
				...css,
			}}
		>
			{word}
		</div>
	);

	let layers: React.ReactNode;
	if (!moving) {
		layers = layer('rest', cur, {color});
	} else {
		// enough sub-frame samples that neighbouring copies overlap (no visible stepping), at most 64
		const travel = Math.abs(cur.y - back.y) + Math.abs(cur.s - back.s) * box.width * 0.5;
		const samples = Math.min(64, Math.max(8, Math.ceil(travel / 2.5)));
		const dt = longest / (samples - 1);
		const nR = Math.max(1, Math.round((SHUTTER.r * trail) / dt) + 1);
		const nG = samples;
		const nB = Math.max(1, Math.round((SHUTTER.b * trail) / dt) + 1);
		const vr = split(cr, nR);
		const vg = split(cg, nG);
		const vb = split(cb, nB);
		layers = Array.from({length: samples}, (_, k) =>
			layer(k, pose(local - k * dt), {
				color: `rgb(${k < nR ? vr[k] : 0},${vg[k]},${k < nB ? vb[k] : 0})`,
				mixBlendMode: 'plus-lighter',
			}),
		);
	}

	return (
		<div style={{position: 'absolute', inset: 0, overflow: 'hidden', isolation: 'isolate', background: background ?? undefined, ...style}}>
			{layers}
		</div>
	);
};

const Demo: React.FC = () => <RushType words={['THE', 'LAST', 'LIGHT', 'FADES']} />;

export const rushTypeEntry: LibraryEntry = {
	meta: {
		id: 'rush-type',
		title: 'Rush type',
		category: 'text',
		looks: 'One word at a time: it arrives, rests sharp, then rushes at the camera leaving vertical red / green / blue shutter trails before the next word cuts in.',
		use: 'Rapid-fire taglines and hype lists over a flat plate; a loud word-per-beat section.',
		exportName: 'RushType',
		durationInFrames: 78,
		source: {kind: 'inspired', name: 'Remocn rush-type', url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/rush-type/index.tsx'},
	},
	Demo,
};
