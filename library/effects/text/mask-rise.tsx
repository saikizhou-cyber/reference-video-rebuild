import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

export type MaskLine =
	| string
	| {
			text: string;
			/** px at 720p; falls back to the component's fontSize */
			fontSize?: number;
			color?: string;
			fontFamily?: string;
			/** em */
			letterSpacing?: number;
	  };

export type MaskRiseProps = {
	/** one entry per line; each line gets its own invisible mask edge */
	lines: string | readonly MaskLine[];
	/** frames each line takes to rise */
	inFrames?: number;
	/** frames between consecutive lines */
	stagger?: number;
	/** side the lines come from: 'bottom' rise up, 'top' drop down */
	from?: 'bottom' | 'top';
	/** every other line comes from the opposite side */
	alternate?: boolean;
	/** degrees a line is rotated by while it is behind the mask (swings flat as it rises) */
	tilt?: number;
	/** blur in px at 720p that clears as the line arrives */
	blur?: number;
	/** frame (of this Sequence) the exit starts; null = the lines stay */
	exitAt?: number | null;
	exitFrames?: number;
	exitStagger?: number;
	/** where lines leave to */
	exit?: 'up' | 'down';
	color?: string;
	fontSize?: number;
	fontFamily?: string;
	letterSpacing?: number;
	lineHeight?: number;
	align?: 'left' | 'center' | 'right';
	style?: React.CSSProperties;
};

const ALIGN = {left: 'flex-start', center: 'center', right: 'flex-end'} as const;
/** how far (in % of the line box) a line starts below / above its mask: enough to clear descenders and tilt */
const TRAVEL = 125;

/**
 * Lines rise from behind an invisible mask edge (each line is clipped by its own box), swing flat
 * and settle, staggered line by line; an optional exit slides them up and out through the same mask.
 */
export const MaskRise: React.FC<MaskRiseProps> = ({
	lines,
	inFrames = 18,
	stagger = 4,
	from = 'bottom',
	alternate = false,
	tilt = 4,
	blur = 5,
	exitAt = null,
	exitFrames = 11,
	exitStagger = 2,
	exit = 'up',
	color = DEMO.paper,
	fontSize = 110,
	fontFamily = DISPLAY_FONT,
	letterSpacing = 0,
	lineHeight = 1,
	align = 'center',
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const list: MaskLine[] = typeof lines === 'string' ? lines.split('\n') : [...lines];
	const exitSign = exit === 'up' ? -1 : 1;
	return (
		<div style={{display: 'flex', flexDirection: 'column', alignItems: ALIGN[align], ...style}}>
			{list.map((raw, i) => {
				const l = typeof raw === 'string' ? {text: raw} : raw;
				const size = (l.fontSize ?? fontSize) * u;
				const side = (from === 'bottom' ? 1 : -1) * (alternate && i % 2 ? -1 : 1);
				const p = progress(frame, i * stagger, inFrames, CURVES.quintOut);
				const q = exitAt === null ? 0 : progress(frame, exitAt + i * exitStagger, exitFrames, CURVES.expoIn);
				const y = side * TRAVEL * (1 - p) + exitSign * TRAVEL * q;
				const rot = side * tilt * (1 - p) + exitSign * tilt * 0.6 * q;
				const b = (1 - p) * blur + q * blur;
				return (
					<div
						key={i}
						style={{
							overflow: 'hidden',
							// the mask is a little taller / wider than the line box so ascenders and italics are not shaved
							padding: `${0.08 * size}px ${0.12 * size}px`,
							margin: `${-0.08 * size}px ${-0.12 * size}px`,
						}}
					>
						<div
							style={{
								fontFamily: l.fontFamily ?? fontFamily,
								fontSize: size,
								lineHeight,
								letterSpacing: `${l.letterSpacing ?? letterSpacing}em`,
								color: l.color ?? color,
								whiteSpace: 'pre',
								transformOrigin: '0% 100%',
								transform: `translateY(${y}%) rotate(${rot}deg)`,
								filter: b > 0.05 ? `blur(${b * u}px)` : undefined,
							}}
						>
							{l.text}
						</div>
					</div>
				);
			})}
		</div>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
			<Sequence from={0} durationInFrames={62} layout="none">
				<MaskRise
					lines={[
						{text: 'SEASON 02', fontSize: 30, letterSpacing: 0.5, color: DEMO.cyan},
						{text: 'THE LAST', fontSize: 190},
						{text: 'LIGHT', fontSize: 190, color: DEMO.yellow},
					]}
					exitAt={44}
					align="left"

				/>
			</Sequence>
		</AbsoluteFill>
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
			<Sequence from={62} layout="none">
				<MaskRise lines={['ONE MORE', 'TURN']} from="top" alternate fontSize={150} color={DEMO.red} stagger={5} />
			</Sequence>
		</AbsoluteFill>
	</Backdrop>
);

export const maskRiseEntry: LibraryEntry = {
	meta: {
		id: 'mask-rise',
		title: 'Mask rise',
		category: 'text',
		looks: 'Each line swings up from behind its own invisible mask edge with a slight tilt and blur, lines 4 frames apart; the exit slides them up and out through the same edge.',
		use: 'Multi-line titles, credits and taglines that need a clean architectural reveal rather than a fade.',
		exportName: 'MaskRise',
		durationInFrames: 96,
		source: {kind: 'original'},
	},
	Demo,
};
