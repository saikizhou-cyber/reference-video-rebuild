import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

export type BarRevealProps = {
	/** one entry per line (or one string with "\n"); every line gets its own bar */
	text: string | readonly string[];
	/** accent bar colour; an array gives each line its own */
	barColor?: string | readonly string[];
	/** the way the bar travels: right / left wipe sideways (text slides along), up / down wipe vertically (text rises or drops in its wake) */
	direction?: 'right' | 'left' | 'up' | 'down';
	/** frames for the bar to cross a line, in and out */
	barFrames?: number;
	/** frames the text takes to slide into place */
	slideFrames?: number;
	/** frames the bar stays fully covering the line before it moves on */
	hold?: number;
	/** frames by which the retreat starts before the bar has fully arrived */
	overlap?: number;
	/** frames between consecutive lines */
	stagger?: number;
	/** how far the text slides, in text-box widths (right/left) or heights (up/down); default 0.3 / 0.7 */
	slide?: number;
	/** frame (of this Sequence) a second bar sweeps through and takes the text away; null = it stays */
	exitAt?: number | null;
	color?: string;
	fontSize?: number;
	fontFamily?: string;
	letterSpacing?: number;
	lineHeight?: number;
	/** bar padding around the text in em */
	padX?: number;
	padY?: number;
	/** gap between lines in em of the font size */
	gap?: number;
	align?: 'left' | 'center' | 'right';
	style?: React.CSSProperties;
};

const ALIGN = {left: 'flex-start', center: 'center', right: 'flex-end'} as const;

/** Slab [a, b] along the travel axis (0 = where the bar starts) as percentages of the line box. */
const slab = (dir: NonNullable<BarRevealProps['direction']>, a: number, b: number) => {
	switch (dir) {
		case 'right':
			return {left: a * 100, right: (1 - b) * 100, top: 0, bottom: 0};
		case 'left':
			return {left: (1 - b) * 100, right: a * 100, top: 0, bottom: 0};
		case 'down':
			return {top: a * 100, bottom: (1 - b) * 100, left: 0, right: 0};
		default:
			return {top: (1 - b) * 100, bottom: a * 100, left: 0, right: 0};
	}
};

/**
 * A solid bar wipes across each line at line height, then moves on and leaves the text sliding
 * into place in its wake: the classic trailer title. An optional exit sends a second bar through.
 */
export const BarReveal: React.FC<BarRevealProps> = ({
	text,
	barColor = DEMO.yellow,
	direction = 'right',
	barFrames = 8,
	slideFrames = 10,
	hold = 1,
	overlap = 3,
	stagger = 5,
	slide,
	exitAt = null,
	color = DEMO.paper,
	fontSize = 120,
	fontFamily = DISPLAY_FONT,
	letterSpacing = 0,
	lineHeight = 0.96,
	padX = 0.16,
	padY = 0.05,
	gap = 0.1,
	align = 'center',
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const lines = typeof text === 'string' ? text.split('\n') : [...text];
	const horizontal = direction === 'right' || direction === 'left';
	const slideBy = slide ?? (horizontal ? 0.3 : 0.7);
	// text travels with the bar: from behind it towards the way the bar goes
	const sign = direction === 'right' || direction === 'down' ? -1 : 1;
	const relay = Math.max(0, barFrames - overlap + hold);
	// expo-out has a long tail: snap the last sliver so no hairline of bar lingers at the end of a move
	const edge = (time: number, start: number): number => {
		const v = progress(time, start, barFrames, CURVES.expoOut);
		return v > 0.992 ? 1 : v;
	};
	return (
		<div style={{display: 'flex', flexDirection: 'column', alignItems: ALIGN[align], gap: `${gap}em`, fontSize: fontSize * u, ...style}}>
			{lines.map((line, i) => {
				const t = frame - i * stagger;
				const colour = typeof barColor === 'string' ? barColor : (barColor[i % barColor.length] ?? DEMO.yellow);
				// entering bar: its front edge R and back edge L, both in 0..1 along the travel axis
				const rIn = edge(t, 0);
				const lIn = edge(t, relay);
				const te = exitAt === null ? -1 : t - exitAt;
				const rOut = exitAt === null ? 0 : edge(te, 0);
				const lOut = exitAt === null ? 0 : edge(te, relay);
				const pText = progress(t, relay, slideFrames, CURVES.expoOut);
				const off = sign * slideBy * (1 - pText) * 100;
				const visible = slab(direction, rOut, Math.max(rOut, lIn));
				const clip = `inset(${visible.top}% ${visible.right}% ${visible.bottom}% ${visible.left}%)`;
				const slabs = [
					[lIn, rIn],
					[lOut, rOut],
				].filter(([a, b]) => b - a > 0.002);
				return (
					<div key={i} style={{position: 'relative', padding: `${padY}em ${padX}em`, lineHeight, flexShrink: 0}}>
						<div style={{clipPath: clip, position: 'relative'}}>
							<div
								style={{
									fontFamily,
									letterSpacing: `${letterSpacing}em`,
									color,
									whiteSpace: 'pre',
									transform: horizontal ? `translateX(${off}%)` : `translateY(${off}%)`,
								}}
							>
								{line}
							</div>
						</div>
						{slabs.map(([a, b], k) => {
							const s = slab(direction, a, b);
							return (
								<div
									key={k}
									style={{
										position: 'absolute',
										left: `${s.left}%`,
										right: `${s.right}%`,
										top: `${s.top}%`,
										bottom: `${s.bottom}%`,
										background: colour,
									}}
								/>
							);
						})}
					</div>
				);
			})}
		</div>
	);
};

const CENTRED: React.CSSProperties = {alignItems: 'center', justifyContent: 'center'};

// each title block sits in its own centred layer, so nothing stacks or shifts; the second starts as the first one's last bar leaves (f54)
const Demo: React.FC = () => (
	<Backdrop>
		<Sequence from={0} durationInFrames={56} layout="none">
			<AbsoluteFill style={CENTRED}>
				<BarReveal text={['MIDNIGHT', 'EDITION']} barColor={[DEMO.yellow, DEMO.red]} fontSize={150} exitAt={38} />
			</AbsoluteFill>
		</Sequence>
		<Sequence from={51} layout="none">
			<AbsoluteFill style={CENTRED}>
				<BarReveal text={['PRE-ORDER', 'OPENS SOON']} direction="up" barColor={DEMO.cyan} fontSize={96} stagger={11} />
			</AbsoluteFill>
		</Sequence>
	</Backdrop>
);

export const barRevealEntry: LibraryEntry = {
	meta: {
		id: 'bar-reveal',
		title: 'Bar reveal',
		category: 'text',
		looks: 'A solid accent bar wipes across each line at line height in 8 frames, then moves on and leaves the text sliding into place in its wake; a second bar takes it away on exit.',
		use: 'Trailer titles, character name plates and release dates; the vertical variant for stacked taglines.',
		exportName: 'BarReveal',
		durationInFrames: 96,
		source: {kind: 'original'},
	},
	Demo,
};
