import React, {useMemo} from 'react';
import {AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop, DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {MONO, glyphs, hash01} from './_reveal-utils';

export type TypewriterProps = {
	/** the full text; "\n" breaks lines. Layout is computed for the full text, so nothing reflows while typing */
	text: string;
	/** characters per second (cps mode) */
	cps?: number;
	/** frames of this Sequence before the first character lands */
	start?: number;
	/** [[frame, charsTyped], ...] piecewise linear, frames counted from `start`; overrides cps (type a few, hold, then burst) */
	schedule?: readonly (readonly [number, number])[];
	/** time scale of a schedule around its first key: 2 = twice as fast */
	speed?: number;
	/** 0..1 irregularity of the rhythm in cps mode (deterministic per `seed`) */
	jitter?: number;
	/** extra frames of rest after , . ; : ! ? and line breaks in cps mode */
	pause?: number;
	seed?: number;
	cursor?: 'block' | 'bar' | 'underscore' | 'none';
	cursorColor?: string;
	/** frames per blink half-period while idle */
	blink?: number;
	/** what the cursor does once the whole text is typed */
	cursorAfter?: 'blink' | 'hide';
	/** colour of freshly typed characters (null = no flash) */
	flash?: string | null;
	/** frames a character stays in the flash colour */
	flashFrames?: number;
	color?: string;
	/** px at 720p */
	fontSize?: number;
	fontFamily?: string;
	/** em */
	letterSpacing?: number;
	lineHeight?: number;
	/** px at 720p; text wraps at this width (default: only at "\n") */
	maxWidth?: number;
	style?: React.CSSProperties;
};

const PUNCT = new Set(Array.from(',.;:!?\n'));
const CURSOR = {
	block: {width: 0.6, height: 1.02, bottom: -0.22},
	bar: {width: 0.09, height: 1.02, bottom: -0.22},
	underscore: {width: 0.6, height: 0.11, bottom: -0.2},
} as const;

/** chars typed at `local` frames after start on a piecewise-linear schedule */
const scheduled = (local: number, keys: readonly (readonly [number, number])[], speed: number): number => {
	if (keys.length === 0) {
		return 0;
	}
	const s0 = keys[0][0];
	const t = s0 + (local - s0) * speed;
	const xs = keys.map((k) => k[0]);
	const ys = keys.map((k) => k[1]);
	return Math.floor(interpolate(t, xs, ys, {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}) + 1e-6);
};

/**
 * Types its text left to right at a speed or on a schedule with a blinking cursor and an optional flash
 * on each new character. The untyped rest is laid out transparent, so the line never reflows.
 */
export const Typewriter: React.FC<TypewriterProps> = ({
	text,
	cps = 28,
	start = 0,
	schedule,
	speed = 1,
	jitter = 0.35,
	pause = 5,
	seed = 1,
	cursor = 'block',
	cursorColor = DEMO.yellow,
	blink = 8,
	cursorAfter = 'blink',
	flash = null,
	flashFrames = 2,
	color = DEMO.paper,
	fontSize = 44,
	fontFamily = MONO,
	letterSpacing = 0,
	lineHeight = 1.35,
	maxWidth,
	style,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const u = useUnit();
	const chars = useMemo(() => glyphs(text), [text]);
	const n = chars.length;
	// frame (relative to `start`) each character lands on, in cps mode
	const arrivals = useMemo(() => {
		const per = fps / Math.max(0.1, cps);
		const out: number[] = [];
		let t = 0;
		chars.forEach((ch, k) => {
			out.push(t);
			t += per * (1 + jitter * (hash01(seed, k) * 2 - 1) * 0.8) + (PUNCT.has(ch) ? pause : 0);
		});
		return out;
	}, [chars, cps, fps, jitter, pause, seed]);

	const countAt = (f: number): number => {
		const local = f - start;
		if (local < 0) {
			return 0;
		}
		if (schedule) {
			return Math.min(n, Math.max(0, scheduled(local, schedule, speed)));
		}
		let c = 0;
		while (c < n && arrivals[c] <= local) {
			c++;
		}
		return c;
	};

	const count = countAt(frame);
	const prev = flash !== null ? countAt(frame - flashFrames) : count;
	// how long the cursor has been waiting at its current spot
	let waitingSince: number;
	if (count === 0) {
		waitingSince = frame;
	} else if (!schedule) {
		waitingSince = frame - start - arrivals[count - 1];
	} else {
		let d = 0;
		while (frame - d - 1 >= start && countAt(frame - d - 1) === count) {
			d++;
		}
		waitingSince = d;
	}
	// solid for one half-period after the last keystroke, then off / on / off ...
	const blinkOff = waitingSince >= blink && Math.floor((waitingSince - blink) / blink) % 2 === 0;
	const done = count >= n;
	const hidden = cursor === 'none' || (done && cursorAfter === 'hide' && waitingSince >= blink * 3);
	const cursorOn = !hidden && !blinkOff;

	const settled = chars.slice(0, prev).join('');
	const fresh = chars.slice(prev, count).join('');
	const rest = chars.slice(count).join('');
	const c = cursor === 'none' ? CURSOR.block : CURSOR[cursor];
	return (
		<div
			style={{
				fontFamily,
				fontSize: fontSize * u,
				lineHeight,
				letterSpacing: `${letterSpacing}em`,
				color,
				whiteSpace: 'pre-wrap',
				maxWidth: maxWidth ? maxWidth * u : undefined,
				...style,
			}}
		>
			<span>{settled}</span>
			<span style={{color: flash ?? undefined}}>{fresh}</span>
			{/* zero-width anchor on the baseline: the cursor hangs off it without taking any room */}
			<span style={{position: 'relative', display: 'inline-block', width: 0, height: 0}}>
				{cursorOn ? (
					<span
						style={{
							position: 'absolute',
							left: 0,
							bottom: `${c.bottom}em`,
							width: `${c.width}em`,
							height: `${c.height}em`,
							background: cursorColor,
						}}
					/>
				) : null}
			</span>
			<span style={{opacity: 0}}>{rest}</span>
		</div>
	);
};

const Demo: React.FC = () => {
	const u = useUnit();
	return (
		<Backdrop>
			<AbsoluteFill style={{justifyContent: 'center', paddingLeft: 130 * u, gap: 12 * u}}>
				<div style={{height: 52 * u}}>
					<Typewriter text="> INCOMING TRANSMISSION" cps={34} fontSize={34} color={DEMO.cyan} cursorColor={DEMO.cyan} cursorAfter="hide" />
				</div>
				<div style={{height: 150 * u}}>
					<Sequence from={22} layout="none">
						<Typewriter
							text={'SIGNAL LOST AT 03:12\nTHEY ARE ALREADY INSIDE'}
							schedule={[[0, 0], [5, 6], [18, 6], [34, 44]]}
							flash={DEMO.yellow}
							fontSize={52}
							cursorAfter="hide"
						/>
					</Sequence>
				</div>
				<div style={{height: 190 * u}}>
					<Sequence from={62} layout="none">
						<Typewriter text="RUN." cps={6} jitter={0} fontSize={140} color={DEMO.red} cursorColor={DEMO.red} />
					</Sequence>
				</div>
			</AbsoluteFill>
		</Backdrop>
	);
};

export const typewriterEntry: LibraryEntry = {
	meta: {
		id: 'typewriter',
		title: 'Typewriter',
		category: 'text',
		looks: 'Text types in left to right at a speed or on a [frame, count] schedule (a few characters, a held beat, then a burst) with a solid-while-typing blinking block cursor and a flash on each new character.',
		use: 'Terminal and system messages, subtitles, dialog lines, any line that should arrive as if being written.',
		exportName: 'Typewriter',
		durationInFrames: 96,
		source: {kind: 'original'},
	},
	Demo,
};
