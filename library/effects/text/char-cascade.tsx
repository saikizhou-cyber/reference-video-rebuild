import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {glyphs, hash01, lin} from './_reveal-utils';

export type CharCascadeProps = {
	/** text to reveal; "\n" starts a new line */
	text: string;
	/** 'rise' = from below, 'drop' = from above, 'scale' = stamps down from oversize */
	mode?: 'rise' | 'drop' | 'scale';
	/** which end the cascade starts from; 'random' uses the seed */
	from?: 'start' | 'center' | 'end' | 'random';
	/** frames between neighbouring characters */
	stagger?: number;
	/** the stagger shrinks so one line never takes longer than this many frames to start (long strings stay snappy) */
	maxSpread?: number;
	/** frames each character takes from start pose to rest */
	inFrames?: number;
	/** frames between the start of consecutive lines */
	lineStagger?: number;
	/** rise / drop travel in em */
	distance?: number;
	/** start scale for mode 'scale' */
	scaleFrom?: number;
	/** blur radius in px at 720p that clears while the character settles */
	blur?: number;
	/** colour each character flashes for 2 frames as it lands (null = no flash) */
	flash?: string | null;
	color?: string;
	/** font size in px at 720p */
	fontSize?: number;
	fontFamily?: string;
	/** letter spacing in em */
	letterSpacing?: number;
	lineHeight?: number;
	align?: 'left' | 'center' | 'right';
	seed?: number;
	style?: React.CSSProperties;
};

const ALIGN = {left: 'flex-start', center: 'center', right: 'flex-end'} as const;

/** Start offset (in character ranks) of every character of one line, per ordering. */
const ranks = (n: number, from: NonNullable<CharCascadeProps['from']>, seed: number, line: number): number[] => {
	const idx = Array.from({length: n}, (_, i) => i);
	switch (from) {
		case 'center':
			return idx.map((i) => Math.abs(i - (n - 1) / 2));
		case 'end':
			return idx.map((i) => n - 1 - i);
		case 'random': {
			const order = [...idx].sort((a, b) => hash01(seed, line, a) - hash01(seed, line, b));
			const r = new Array<number>(n);
			order.forEach((charIndex, rank) => {
				r[charIndex] = rank;
			});
			return r;
		}
		default:
			return idx;
	}
};

/**
 * Per-character stagger: every character rises (or drops, or stamps down) while it fades in and
 * de-blurs on an expo-out curve, one character after the other. Starts at frame 0 of its <Sequence>.
 */
export const CharCascade: React.FC<CharCascadeProps> = ({
	text,
	mode = 'rise',
	from = 'start',
	stagger = 2,
	maxSpread = 18,
	inFrames = 14,
	lineStagger = 5,
	distance = 0.6,
	scaleFrom = 1.9,
	blur = 8,
	flash = null,
	color = DEMO.paper,
	fontSize = 120,
	fontFamily = DISPLAY_FONT,
	letterSpacing = 0,
	lineHeight = 1.05,
	align = 'center',
	seed = 1,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const lines = text.split('\n');
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: ALIGN[align],
				fontFamily,
				fontSize: fontSize * u,
				lineHeight,
				letterSpacing: `${letterSpacing}em`,
				color,
				whiteSpace: 'pre',
				...style,
			}}
		>
			{lines.map((line, li) => {
				const cs = glyphs(line);
				const rk = ranks(cs.length, from, seed, li);
				const maxRank = Math.max(1, ...rk);
				const each = Math.min(stagger, maxSpread / maxRank);
				return (
					<div key={li} style={{display: 'flex'}}>
						{cs.map((ch, i) => {
							const delay = li * lineStagger + rk[i] * each;
							const p = progress(frame, delay, inFrames, CURVES.expoOut);
							// opacity runs on its own, faster, linear clock so a character is readable early in its move
							const o = lin(frame, delay, inFrames * 0.3);
							const inv = 1 - p;
							let transform = '';
							if (mode === 'rise') {
								transform = `translateY(${inv * distance}em)`;
							} else if (mode === 'drop') {
								transform = `translateY(${-inv * distance}em)`;
							} else {
								transform = `scale(${1 + inv * (scaleFrom - 1)})`;
							}
							const landed = delay + inFrames * 0.3;
							const flashing = flash !== null && frame >= landed && frame < landed + 2;
							return (
								<span
									key={i}
									style={{
										display: 'inline-block',
										whiteSpace: 'pre',
										transform,
										transformOrigin: '50% 60%',
										opacity: o,
										filter: inv * blur > 0.05 ? `blur(${inv * blur * u}px)` : undefined,
										color: flashing ? (flash ?? color) : undefined,
									}}
								>
									{ch}
								</span>
							);
						})}
					</div>
				);
			})}
		</div>
	);
};

const Demo: React.FC = () => {
	const u = useUnit();
	// fixed-height cells keep the stack from re-centring each time a line mounts
	const cell = (h: number): React.CSSProperties => ({height: h * u, display: 'flex', alignItems: 'center', justifyContent: 'center'});
	return (
		<Backdrop>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
				<Sequence from={0} durationInFrames={54} layout="none">
					<div style={cell(190)}>
						<CharCascade text="THE CITY" fontSize={170} letterSpacing={0.01} />
					</div>
					<div style={cell(130)}>
						<Sequence from={10} layout="none">
							<CharCascade text="NEVER SLEEPS" mode="scale" from="center" fontSize={104} color={DEMO.red} flash={DEMO.yellow} />
						</Sequence>
					</div>
					<div style={cell(70)}>
						<Sequence from={22} layout="none">
							<CharCascade text="NOT TONIGHT" mode="drop" from="end" fontSize={44} letterSpacing={0.34} color={DEMO.cyan} stagger={1.5} />
						</Sequence>
					</div>
				</Sequence>
				<Sequence from={54} layout="none">
					<CharCascade text={['WAKE UP,', 'HUNTER'].join('\n')} from="random" seed={4} fontSize={150} lineHeight={0.95} flash={DEMO.yellow} stagger={1.5} />
				</Sequence>
			</AbsoluteFill>
		</Backdrop>
	);
};

export const charCascadeEntry: LibraryEntry = {
	meta: {
		id: 'char-cascade',
		title: 'Char cascade',
		category: 'text',
		looks: 'Each character rises 0.6 em while fading in and de-blurring on an expo-out curve, 2 frames apart; modes rise, drop and scale-stamp, ordered from the start, end, centre or at random.',
		use: 'Main title and sub-title reveals; any line that should arrive with weight but stay readable.',
		exportName: 'CharCascade',
		durationInFrames: 90,
		source: {kind: 'original'},
	},
	Demo,
};
