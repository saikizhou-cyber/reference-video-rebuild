import React from 'react';
import {Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {charLayout, fitSize, rnd} from './_display-utils';

export type GlitchTextProps = {
	text: string;
	/** px at 720p */
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number | string;
	color?: string;
	/** frames (relative to the Sequence) at which a burst starts; the word is hidden before the first one unless appear = 'visible' */
	bursts?: number[];
	/** frames a burst lasts before the word locks clean */
	burstFrames?: number;
	/** 0..2: strength of slice displacement, ghost split and glyph swaps */
	intensity?: number;
	/** every glitch pose is held this many frames (the stutter) */
	hold?: number;
	/** warm ghost behind the word */
	ghostWarm?: string;
	/** cool ghost behind the word */
	ghostCool?: string;
	/** share of glyphs that flip to a symbol at full strength (0 = none) */
	swapRatio?: number;
	/** faint scanlines over the word while it glitches */
	scanlines?: boolean;
	/** scaleX the word starts the FIRST burst at, snapping back to 1 (1 = no stretch) */
	stretch?: number;
	/** 'burst': invisible until the first burst; 'visible': clean word until the burst hits */
	appear?: 'burst' | 'visible';
	/** the word is shrunk to fit this share of the frame width (0 = never shrink) */
	fitWidth?: number;
	seed?: number;
	style?: React.CSSProperties;
};

const SYMBOLS = '#@%&$/\\|?!<>=+*';

/**
 * Glitch type burst: the word stutters on held poses, is cut into horizontal bands that jump sideways,
 * grows warm / cool ghost copies with quantised jitter and sometimes flips glyphs to symbols, then
 * locks clean on a hard frame. Several bursts can be placed on beats. Starts at frame 0 of its <Sequence>.
 */
export const GlitchText: React.FC<GlitchTextProps> = ({
	text,
	fontSize = 190,
	fontFamily = DISPLAY_FONT,
	fontWeight = 400,
	color = DEMO.paper,
	bursts = [0],
	burstFrames = 12,
	intensity = 1,
	hold = 2,
	ghostWarm = '#ff2a3d',
	ghostCool = DEMO.cyan,
	swapRatio = 0.22,
	scanlines = true,
	stretch = 1.3,
	appear = 'burst',
	fitWidth = 0.88,
	seed = 1,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const {width, height} = useVideoConfig();
	const fs = fitSize(text, fontFamily, fontSize * u, fitWidth * width, fontWeight);
	const lay = charLayout(text, fontFamily, fs, fontWeight);
	const boxW = lay.width;
	const capTop = lay.baseline - lay.capHeight;
	const left = (width - boxW) / 2;
	const top = height / 2 - (lay.baseline - lay.capHeight / 2);

	let burst = -1;
	bursts.forEach((b, k) => {
		if (frame >= b && frame < b + burstFrames) {
			burst = k;
		}
	});
	const first = bursts.length ? Math.min(...bursts) : 0;
	if (appear === 'burst' && frame < first) {
		return null;
	}
	const t = burst >= 0 ? frame - bursts[burst] : -1;
	const glitching = t >= 0 && intensity > 0;
	const ft = glitching ? Math.floor(t / Math.max(1, hold)) * Math.max(1, hold) : 0;
	const amp = glitching ? intensity * Math.pow(Math.max(0, 1 - ft / burstFrames), 0.7) : 0;
	const key = `${seed}-${burst}-${ft}`;

	const dropout = glitching && amp > 0.45 && rnd(key, 'drop') < 0.14 * Math.min(1.5, intensity);
	const stretchX = burst === 0 && glitching ? 1 + (stretch - 1) * (1 - progress(t, 0, burstFrames, Easing.out(Easing.poly(4)))) : 1;

	// glyphs: some flip to symbols while the burst is strong
	const shown = lay.chars.map((ch, i) => {
		if (!glitching || ch.trim() === '') {
			return ch;
		}
		return rnd(key, 'sw', i) < swapRatio * amp ? SYMBOLS[Math.floor(rnd(key, 'sy', i) * SYMBOLS.length)] : ch;
	});

	const Word: React.FC<{c: string; extra?: React.CSSProperties}> = ({c, extra}) => (
		<div style={{position: 'absolute', inset: 0, ...extra}}>
			{shown.map((ch, i) => (
				<span
					key={i}
					style={{
						position: 'absolute',
						left: lay.x[i],
						width: lay.w[i],
						top: 0,
						textAlign: 'center',
						whiteSpace: 'pre',
						lineHeight: 1,
						fontFamily,
						fontWeight,
						fontSize: fs,
						color: c,
					}}
				>
					{ch}
				</span>
			))}
		</div>
	);

	// horizontal bands across the cap region, each displaced by its own hash
	const regionTop = capTop - 0.04 * fs;
	const regionH = lay.capHeight + 0.08 * fs;
	const bandCount = glitching ? Math.round(6 + 4 * rnd(key, 'n')) : 1;
	const weights = Array.from({length: bandCount}, (_, j) => 0.3 + rnd(key, 'bw', j));
	const wSum = weights.reduce((a, b) => a + b, 0);
	let acc = 0;
	const bands = weights.map((w, j) => {
		const y0 = acc;
		acc += w / wSum;
		const moves = glitching && rnd(key, 'bm', j) < 0.62;
		const dx = moves ? (rnd(key, 'bx', j) * 2 - 1) * (0.015 + 0.1 * rnd(key, 'bs', j)) * boxW * amp : 0;
		return {y0: regionTop + y0 * regionH, y1: regionTop + acc * regionH, dx};
	});

	// ghosts: quantised jitter, vertical = 35 % of horizontal
	const gd = (3 + 7 * rnd(key, 'gd')) * u * amp * Math.max(0.6, fs / (190 * u));
	const warm = {x: -gd * (0.6 + 0.8 * rnd(key, 'gw')), y: 0.35 * gd * (rnd(key, 'gwy') * 2 - 1)};
	const cool = {x: gd * (0.6 + 0.8 * rnd(key, 'gc')), y: 0.35 * gd * (rnd(key, 'gcy') * 2 - 1)};

	// thin tear bars across the word
	const tears = glitching
		? Array.from({length: Math.floor(rnd(key, 'tn') * 3 * amp) + (amp > 0.35 ? 1 : 0)}, (_, j) => ({
				y: regionTop + rnd(key, 'ty', j) * regionH,
				h: (2 + 4 * rnd(key, 'th', j)) * u,
				x: rnd(key, 'tx', j) * boxW * 0.55,
				w: (0.2 + 0.5 * rnd(key, 'tw', j)) * boxW,
				c: [ghostCool, ghostWarm, color][Math.floor(rnd(key, 'tc', j) * 3)],
			}))
		: [];

	return (
		<div
			style={{
				position: 'absolute',
				left,
				top,
				width: boxW,
				height: fs,
				opacity: dropout ? 0 : 1,
				transform: `scaleX(${stretchX}) translate(${glitching ? (rnd(key, 'jx') * 2 - 1) * 4 * u * amp : 0}px, ${glitching ? (rnd(key, 'jy') * 2 - 1) * 2 * u * amp : 0}px)`,
				transformOrigin: '50% 50%',
				...style,
			}}
		>
			{glitching ? (
				<>
					{bands.map((b, j) => (
						<div
							key={j}
							style={{
								position: 'absolute',
								inset: 0,
								isolation: 'isolate',
								clipPath: `inset(${b.y0}px -3000px ${fs - b.y1}px -3000px)`,
								transform: `translateX(${b.dx}px)`,
							}}
						>
							<Word c={ghostWarm} extra={{transform: `translate(${warm.x}px, ${warm.y}px)`, mixBlendMode: 'screen'}} />
							<Word c={ghostCool} extra={{transform: `translate(${cool.x}px, ${cool.y}px)`, mixBlendMode: 'screen'}} />
							<Word c={color} />
						</div>
					))}
					{tears.map((s, j) => (
						<div key={j} style={{position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.h, background: s.c}} />
					))}
					{scanlines ? (
						<div
							style={{
								position: 'absolute',
								left: -20 * u,
								right: -20 * u,
								top: regionTop,
								height: regionH,
								opacity: 0.12,
								backgroundImage: `repeating-linear-gradient(0deg, #000 0 ${Math.max(1, u)}px, transparent ${Math.max(1, u)}px ${3 * Math.max(1, u)}px)`,
							}}
						/>
					) : null}
				</>
			) : (
				<Word c={color} />
			)}
		</div>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		<GlitchText text="NO SIGNAL" bursts={[0, 26, 46]} burstFrames={12} />
	</Backdrop>
);

export const glitchTextEntry: LibraryEntry = {
	meta: {
		id: 'glitch-text',
		title: 'Glitch text',
		category: 'text',
		looks: 'The word stutters on held frames, jumps in horizontal slices with red / cyan ghosts and symbol flips, then locks clean; repeatable on beats.',
		use: 'Title cards that hit with a digital tear; emphasis hits on a beat; system-failure or corrupted-signal moments.',
		exportName: 'GlitchText',
		durationInFrames: 72,
		source: {
			kind: 'inspired',
			name: 'HeyGen HyperFrames chromatic-glitch',
			url: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/skills/hyperframes-animation/rules/chromatic-glitch.md',
		},
	},
	Demo,
};
