import React from 'react';
import {AbsoluteFill, Easing, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {measureText} from '@remotion/layout-utils';
import {CURVES, progress, sinceBeat} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {kf, lin} from './_reveal-utils';

export type BeatEntrance = 'drop' | 'slide-left' | 'slide-right' | 'pop' | 'slam' | 'stomp' | 'flicker';

export type BeatWordsProps = {
	/** one word (or short phrase) per beat */
	words: readonly string[];
	/** the frame each word cuts in on, same length as `words` (e.g. beat_frames from beat_check.py) */
	beats: readonly number[];
	/** frame the last word leaves (default: last beat + 24) */
	endFrame?: number;
	/** entrance styles, cycled by word index */
	entrances?: readonly BeatEntrance[];
	/** indices of words drawn in the accent colour */
	accentWords?: readonly number[];
	accent?: string;
	/** [base, flash]: the backdrop flickers flash, base, flash... every 2 frames for 8 frames after a word lands (null = none) */
	flash?: readonly [string, string] | null;
	/** word indices that get the flash (default: all, when `flash` is set) */
	flashWords?: readonly number[];
	/** slow push-in over the hold, as a fraction of scale (0 = dead still) */
	drift?: number;
	/** frames a word fades out before the next cut (0 = hard cut) */
	exitFrames?: number;
	color?: string;
	/** largest font size in px at 720p; longer words shrink to fit `maxWidth` */
	fontSize?: number;
	/** the width a word may fill, px at 720p */
	maxWidth?: number;
	fontFamily?: string;
	fontWeight?: number;
	/** em */
	letterSpacing?: number;
	style?: React.CSSProperties;
};

const DEFAULT_ENTRANCES: readonly BeatEntrance[] = ['drop', 'slide-left', 'slide-right', 'pop'];

type Pose = {x: number; y: number; scale: number; rotate: number; opacity: number};

/** Where a word is `since` frames after its cut. x / y in px, y relative to the font size `fs`. */
const entrance = (kind: BeatEntrance, since: number, index: number, fs: number, frameWidth: number): Pose => {
	const rest: Pose = {x: 0, y: 0, scale: 1, rotate: 0, opacity: 1};
	switch (kind) {
		case 'drop': {
			const p = progress(since, 0, 7, Easing.out(Easing.back(1.7)));
			return {...rest, y: -0.6 * fs * (1 - p)};
		}
		case 'slide-left': {
			const p = progress(since, 0, 6, CURVES.expoOut);
			return {...rest, x: -0.24 * frameWidth * (1 - p)};
		}
		case 'slide-right': {
			const p = progress(since, 0, 6, CURVES.expoOut);
			return {...rest, x: 0.24 * frameWidth * (1 - p)};
		}
		case 'pop': {
			const p = progress(since, 0, 7, Easing.out(Easing.back(2.2)));
			return {...rest, scale: 0.4 + 0.6 * p};
		}
		case 'slam': {
			const p = progress(since, 0, 5, CURVES.snap);
			const hit = since - 5;
			const amp = hit >= 0 ? 0.03 * fs * Math.exp(-hit / 2.2) : 0;
			return {
				x: amp * (random(`bw-x-${index}-${since}`) * 2 - 1),
				y: amp * (random(`bw-y-${index}-${since}`) * 2 - 1),
				scale: 1 + 0.7 * (1 - p),
				rotate: 0,
				opacity: 1,
			};
		}
		case 'stomp': {
			const dir = index % 2 ? -1 : 1;
			return {
				...rest,
				scale: kf(since, [[0, 1.18], [3, 0.98, CURVES.snap], [6, 1, CURVES.inOutCubic]]),
				rotate: dir * kf(since, [[0, 2.5], [6, 0, CURVES.snap]]),
			};
		}
		default:
			// flicker: on, off, on, off, on, then solid
			return {...rest, scale: kf(since, [[0, 1.05], [6, 1, CURVES.expoOut]]), opacity: since < 5 && since % 2 === 1 ? 0 : 1};
	}
};

/**
 * One word on screen at a time, hard-cut on each beat frame; the entrance style cycles with the word index
 * (drop, slide, slide, pop by default), every word auto-fits its width and keeps creeping in while it is held.
 */
export const BeatWords: React.FC<BeatWordsProps> = ({
	words,
	beats,
	endFrame,
	entrances = DEFAULT_ENTRANCES,
	accentWords = [],
	accent = DEMO.yellow,
	flash = null,
	flashWords,
	drift = 0.04,
	exitFrames = 0,
	color = DEMO.paper,
	fontSize = 220,
	maxWidth = 1100,
	fontFamily = DISPLAY_FONT,
	fontWeight,
	letterSpacing = -0.01,
	style,
}) => {
	const frame = useCurrentFrame();
	const {width} = useVideoConfig();
	const u = useUnit();
	if (words.length === 0 || frame < beats[0]) {
		return null;
	}
	const end = endFrame ?? beats[beats.length - 1] + 24;
	if (frame >= end) {
		return null;
	}
	let idx = 0;
	for (let i = 0; i < beats.length && i < words.length; i++) {
		if (beats[i] <= frame) {
			idx = i;
		}
	}
	const word = words[idx];
	const since = sinceBeat(frame, beats);
	const until = (idx + 1 < beats.length ? beats[idx + 1] : end) - beats[idx];
	// auto-fit: measure at 100 px, scale to the width the word may use
	const w100 = measureText({text: word, fontFamily, fontSize: 100, fontWeight, letterSpacing: `${letterSpacing * 100}px`}).width;
	const fs = Math.min(fontSize * u, (100 * maxWidth * u) / Math.max(1, w100));
	const kind = entrances[idx % entrances.length];
	const pose = entrance(kind, since, idx, fs, width);
	const hold = 1 + drift * lin(since, 0, until);
	const out = exitFrames > 0 ? lin(since, until - exitFrames, exitFrames) : 0;
	const flashing = flash !== null && (flashWords ? flashWords.includes(idx) : true) && since < 8;
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', ...style}}>
			{flashing && flash ? <AbsoluteFill style={{background: flash[(Math.floor(since / 2) + 1) % 2]}} /> : null}
			<div
				style={{
					fontFamily,
					fontWeight,
					fontSize: fs,
					lineHeight: 1,
					letterSpacing: `${letterSpacing}em`,
					color: accentWords.includes(idx) ? accent : color,
					whiteSpace: 'nowrap',
					opacity: pose.opacity * (1 - out),
					transform: `translate(${pose.x}px, ${pose.y}px) rotate(${pose.rotate}deg) scale(${pose.scale * hold * (1 - 0.04 * out)})`,
				}}
			>
				{word}
			</div>
		</AbsoluteFill>
	);
};

const WORDS = ['ONE', 'CARD', 'ONE', 'CHANCE', 'NO', 'RETREAT'];
// a syncopated pattern (long and short holds) so the six preview stills catch some words mid-entrance and one held
const BEATS = [7, 22, 31, 54, 70, 83];

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const since = sinceBeat(frame, BEATS);
	return (
		<Backdrop>
			<BeatWords
				words={WORDS}
				beats={BEATS}
				endFrame={96}
				entrances={['drop', 'slide-left', 'slide-right', 'pop', 'stomp', 'slam']}
				accentWords={[3, 5]}
				accent={DEMO.red}
				flash={[DEMO.ink, '#2b1226']}
				flashWords={[4, 5]}
			/>
			{/* the beat grid every cut sits on */}
			<AbsoluteFill style={{alignItems: 'flex-end', justifyContent: 'center', flexDirection: 'row', gap: 10 * u, paddingBottom: 46 * u}}>
				{BEATS.map((b, i) => {
					const live = frame >= b && (i === BEATS.length - 1 || frame < BEATS[i + 1]);
					return <div key={b} style={{width: 34 * u, height: 7 * u, background: live ? DEMO.yellow : DEMO.grey, opacity: live && since < 3 ? 1 : live ? 0.7 : 1}} />;
				})}
			</AbsoluteFill>
		</Backdrop>
	);
};

export const beatWordsEntry: LibraryEntry = {
	meta: {
		id: 'beat-words',
		title: 'Beat words',
		category: 'text',
		looks: 'One auto-fitted word on screen at a time, hard-cut on each beat frame; the entrance rotates (drop, slide left, slide right, pop, plus stomp, slam, flicker) and the held word keeps creeping in.',
		use: 'Lyric and slogan cuts on the music, hype montages, one-word-per-hit title sequences.',
		notes: '`beats` are frames local to its `<Sequence>`, one per word, in order: subtract the Sequence start from the `beat_frames` you cut on.',
		exportName: 'BeatWords',
		durationInFrames: 96,
		source: {kind: 'inspired', name: 'HyperFrames caption-kinetic-slam', url: 'https://github.com/heygen-com/hyperframes/blob/main/registry/components/caption-kinetic-slam/caption-kinetic-slam.html'},
	},
	Demo,
};
