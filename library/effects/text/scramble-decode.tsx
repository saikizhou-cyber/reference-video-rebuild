import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {Backdrop, DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {MONO, glyphs, hash01} from './_reveal-utils';

export type ScrambleDecodeProps = {
	/** text to decode; "\n" starts a new line (characters resolve in reading order across lines) */
	text: string;
	/** glyphs the unresolved characters cycle through */
	charset?: string;
	/** frame the first character locks */
	lockStart?: number;
	/** frame the last character locks */
	lockEnd?: number;
	/** frames between re-rolls of an unresolved glyph */
	rerollEvery?: number;
	/** changes the glyph sequence; same seed, same frames */
	seed?: number;
	/** colour of the block that flashes behind a character as it locks (null = no flash) */
	accent?: string | null;
	/** colour of the character while the flash block is behind it */
	accentText?: string;
	flashFrames?: number;
	/** frame (of this Sequence) the text scrambles away again, last character first; null = it stays */
	exitAt?: number | null;
	exitFrames?: number;
	color?: string;
	/** colour of unresolved glyphs (default: the text colour at 40 %) */
	dimColor?: string | null;
	fontSize?: number;
	fontFamily?: string;
	/** em; every character sits in a cell this wide so nothing shifts while glyphs change */
	cellWidth?: number;
	letterSpacing?: number;
	lineHeight?: number;
	align?: 'left' | 'center' | 'right';
	style?: React.CSSProperties;
};

const DEFAULT_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+?<>';
const ALIGN = {left: 'flex-start', center: 'center', right: 'flex-end'} as const;
/** frames a character shows scrambled glyphs after it is released on exit, before it is gone */
const EXIT_NOISE = 5;

/**
 * Wrong glyphs from a charset resolve to the real text one character at a time, left to right; unresolved
 * glyphs re-roll every 2 frames, each lock flashes a block for 2 frames. A pure function of the frame.
 */
export const ScrambleDecode: React.FC<ScrambleDecodeProps> = ({
	text,
	charset = DEFAULT_CHARSET,
	lockStart = 6,
	lockEnd = 45,
	rerollEvery = 2,
	seed = 1,
	accent = DEMO.yellow,
	accentText = DEMO.ink,
	flashFrames = 2,
	exitAt = null,
	exitFrames = 18,
	color = DEMO.paper,
	dimColor = null,
	fontSize = 96,
	fontFamily = MONO,
	cellWidth = 0.62,
	letterSpacing = 0,
	lineHeight = 1.15,
	align = 'left',
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const pool = glyphs(charset);
	const lines = text.split('\n').map(glyphs);
	const total = lines.reduce((a, l) => a + l.length, 0);
	let rank = 0;
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
			{lines.map((line, li) => (
				<div key={li} style={{display: 'flex'}}>
					{line.map((target, ci) => {
						const r = rank++;
						const t = total > 1 ? r / (total - 1) : 0;
						const lock = Math.round(lockStart + t * (lockEnd - lockStart));
						const release = exitAt === null ? Infinity : exitAt + (1 - t) * exitFrames;
						const isSpace = target.trim() === '';
						// 'noise' = random glyph, 'flash' = just locked, 'set' = resolved, 'gone' = scrambled away
						let state: 'noise' | 'flash' | 'set' | 'gone' = 'set';
						if (frame >= release + EXIT_NOISE) {
							state = 'gone';
						} else if (frame >= release) {
							state = 'noise';
						} else if (frame < lock) {
							state = 'noise';
						} else if (accent !== null && frame < lock + flashFrames) {
							state = 'flash';
						}
						let ch = target;
						if (isSpace) {
							ch = ' ';
						} else if (state === 'gone') {
							ch = ' ';
						} else if (state === 'noise') {
							// each character re-rolls on its own phase, so the line never ticks all at once
							const phase = Math.floor(hash01(seed, r, 7) * rerollEvery);
							const tick = Math.floor((frame + phase) / rerollEvery);
							const choices = pool.filter((g) => g !== target);
							ch = choices[Math.floor(hash01(seed, r, tick) * choices.length)] ?? '?';
						}
						const flashing = state === 'flash';
						return (
							<span
								key={ci}
								style={{
									display: 'inline-block',
									width: `${cellWidth}em`,
									textAlign: 'center',
									background: flashing ? (accent ?? undefined) : undefined,
									color: flashing ? accentText : state === 'noise' && !isSpace ? (dimColor ?? undefined) : undefined,
									opacity: state === 'noise' && !isSpace && dimColor === null ? 0.42 : 1,
								}}
							>
								{ch}
							</span>
						);
					})}
				</div>
			))}
		</div>
	);
};

const CENTRED: React.CSSProperties = {alignItems: 'center', justifyContent: 'center'};

// each block sits in its own centred layer; the second starts only once the first has scrambled away (exitAt + exitFrames + 5)
const Demo: React.FC = () => (
	<Backdrop>
		<Sequence from={0} durationInFrames={62} layout="none">
			<AbsoluteFill style={CENTRED}>
				<ScrambleDecode text={'PROJECT\nNIGHTFALL'} fontSize={128} lockEnd={34} exitAt={44} exitFrames={12} />
			</AbsoluteFill>
		</Sequence>
		<Sequence from={62} layout="none">
			<AbsoluteFill style={CENTRED}>
				<ScrambleDecode text={'ACCESS GRANTED'} fontSize={76} lockStart={2} lockEnd={22} color={DEMO.cyan} accent={DEMO.paper} seed={5} />
			</AbsoluteFill>
		</Sequence>
	</Backdrop>
);

export const scrambleDecodeEntry: LibraryEntry = {
	meta: {
		id: 'scramble-decode',
		title: 'Scramble decode',
		category: 'text',
		looks: 'Wrong glyphs cycle through every character slot and resolve to the real text left to right, each lock flashing a block; the exit scrambles it away from the last character back.',
		use: 'Hacking, system and classified-file moments; codenames and location stamps.',
		exportName: 'ScrambleDecode',
		durationInFrames: 96,
		source: {kind: 'inspired', name: 'HyperFrames', url: 'https://github.com/heygen-com/hyperframes/blob/main/registry/components/scramble-reveal/scramble-reveal.html'},
	},
	Demo,
};
