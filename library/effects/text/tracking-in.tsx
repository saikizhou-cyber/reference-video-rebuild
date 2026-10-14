import React from 'react';
import {AbsoluteFill, Easing, Sequence, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, SPRINGS, progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {kf, lin} from './_reveal-utils';

export type TrackingInProps = {
	/** a string ("\n" = new line) or one entry per line */
	text: string | readonly string[];
	/** what animates as one piece: whole lines, or every word on its own clock */
	unit?: 'line' | 'word';
	/** letter spacing in em at the start (wide) */
	from?: number;
	/** letter spacing in em at rest */
	to?: number;
	/** 'ease' collapses on a cubic-out curve; 'spring' overshoots below `to` (a squeeze) and settles */
	mode?: 'ease' | 'spring';
	/** frames for the collapse */
	inFrames?: number;
	/** frames between consecutive units */
	stagger?: number;
	/** blur in px at 720p that clears while the text tightens */
	blur?: number;
	/** px at 720p the text rises by while it tightens */
	rise?: number;
	/** frames (of this Sequence) at which the tracking pulses: squeeze, open up, settle */
	hits?: readonly number[];
	/** peak extra tracking of a pulse in em */
	pulse?: number;
	color?: string;
	fontSize?: number;
	fontFamily?: string;
	lineHeight?: number;
	align?: 'left' | 'center' | 'right';
	style?: React.CSSProperties;
};

const ALIGN = {left: 'flex-start', center: 'center', right: 'flex-end'} as const;

type UnitProps = Required<Pick<TrackingInProps, 'from' | 'to' | 'mode' | 'inFrames' | 'blur' | 'rise' | 'pulse'>> & {
	label: string;
	delay: number;
	hits: readonly number[];
	fontPx: number;
	u: number;
};

const Unit: React.FC<UnitProps> = ({label, delay, from, to, mode, inFrames, blur, rise, hits, pulse, fontPx, u}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const local = frame - delay;
	const e =
		mode === 'spring'
			? spring({frame: Math.max(0, local), fps, config: SPRINGS.punch, durationInFrames: Math.round(inFrames * 1.5)})
			: progress(frame, delay, inFrames, Easing.out(Easing.cubic));
	let ls = to + (from - to) * (1 - e);
	let blurPx = (1 - Math.min(1, e)) * blur;
	let scale = 1;
	for (const h of hits) {
		const s = frame - h;
		if (s >= 0 && s < 12) {
			ls += kf(s, [[0, 0], [1, -0.4 * pulse, CURVES.snap], [3, pulse, CURVES.snap], [11, 0, CURVES.inOutCubic]]);
			blurPx += kf(s, [[0, 0], [2, 2], [8, 0]]);
			scale *= kf(s, [[0, 1], [2, 1.03, CURVES.snap], [11, 1, CURVES.inOutCubic]]);
		}
	}
	const lsPx = ls * fontPx;
	return (
		<div
			style={{
				display: 'inline-block',
				whiteSpace: 'pre',
				letterSpacing: `${ls}em`,
				// letter-spacing trails the last glyph too: pull the box back so centred text does not drift sideways
				marginRight: -lsPx,
				opacity: lin(frame, delay, inFrames * 0.35),
				transform: `translateY(${(1 - Math.min(1, e)) * rise * u}px) scale(${scale})`,
				filter: blurPx > 0.05 ? `blur(${blurPx * u}px)` : undefined,
			}}
		>
			{label}
		</div>
	);
};

/**
 * Letter-spacing collapses from wide to tight while the text fades in, de-blurs and drops into place;
 * a spring mode overshoots into a squeeze, and `hits` pulse the tracking on the beat. Starts at frame 0 of its <Sequence>.
 */
export const TrackingIn: React.FC<TrackingInProps> = ({
	text,
	unit = 'line',
	from = 0.42,
	to = 0,
	mode = 'ease',
	inFrames = 26,
	stagger = 3,
	blur = 12,
	rise = 0,
	hits = [],
	pulse = 0.07,
	color = DEMO.paper,
	fontSize = 130,
	fontFamily = DISPLAY_FONT,
	lineHeight = 1.05,
	align = 'center',
	style,
}) => {
	const u = useUnit();
	const lines = typeof text === 'string' ? text.split('\n') : [...text];
	let n = 0;
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: ALIGN[align],
				fontFamily,
				fontSize: fontSize * u,
				lineHeight,
				color,
				...style,
			}}
		>
			{lines.map((line, li) => {
				const parts = unit === 'word' ? line.split(' ').filter(Boolean) : [line];
				return (
					<div key={li} style={{display: 'flex', gap: unit === 'word' ? '0.26em' : 0, justifyContent: ALIGN[align]}}>
						{parts.map((label, wi) => (
							<Unit
								key={wi}
								label={label}
								delay={n++ * stagger}
								from={from}
								to={to}
								mode={mode}
								inFrames={inFrames}
								blur={blur}
								rise={rise}
								pulse={pulse}
								hits={hits}
								fontPx={fontSize * u}
								u={u}
							/>
						))}
					</div>
				);
			})}
		</div>
	);
};

const Demo: React.FC = () => {
	const u = useUnit();
	return (
		<Backdrop>
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
				<Sequence from={0} durationInFrames={60} layout="none">
					<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 * u}}>
						<TrackingIn text="THE LONG NIGHT" fontSize={100} from={0.3} hits={[37, 51]} />
						<Sequence from={12} layout="none">
							<TrackingIn text="A CHAPTER IN SIX ACTS" mode="spring" fontSize={34} from={0.9} to={0.3} color={DEMO.yellow} />
						</Sequence>
					</div>
				</Sequence>
				<Sequence from={60} layout="none">
					<TrackingIn text={'NO ONE\nLEFT BEHIND'} unit="word" mode="spring" fontSize={116} stagger={5} inFrames={22} from={0.5} color={DEMO.red} />
				</Sequence>
			</AbsoluteFill>
		</Backdrop>
	);
};

export const trackingInEntry: LibraryEntry = {
	meta: {
		id: 'tracking-in',
		title: 'Tracking in',
		category: 'text',
		looks: 'Letter-spacing collapses from 0.42 em to tight while the text fades in and sharpens (eased or a springy squeeze); hits pulse the tracking open and shut on the beat.',
		use: 'Cinematic title and tagline reveals; a kerning pulse on a sting or logo hit.',
		exportName: 'TrackingIn',
		durationInFrames: 96,
		source: {kind: 'original'},
	},
	Demo,
};
