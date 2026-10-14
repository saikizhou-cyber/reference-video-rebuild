import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {WorldScene, Tag} from './_moves-utils';
import {CURVES, progress} from '../../core/easing';
import {DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

/** A one-frame glitch where the bar opens up and shows the picture that is normally hidden. */
export type LetterboxBreach = {
	/** first frame of the breach */
	at: number;
	/** how many frames it lasts (default 1) */
	frames?: number;
	/** how much of the bar opens, 0..1 (default 0.4 = the bar shrinks to 60 %) */
	open?: number;
	side?: 'top' | 'bottom' | 'both';
};

export type LetterboxProps = {
	/** optional picture drawn under the bars; leave out to use the component as an overlay on top of a scene */
	children?: React.ReactNode;
	/** aspect ratio of the visible picture (2.35 = scope). Frames that are already wider get no bars */
	ratio?: number;
	/** frame the bars slam in on, and the frame they slam out on (Infinity = they stay) */
	inAt?: number;
	outAt?: number;
	inFrames?: number;
	outFrames?: number;
	/** frames the bottom bar lags the top bar */
	stagger?: number;
	color?: string;
	/** colour of the 1-2 px halo line along the inner edge of each bar (null = none) */
	halo?: string | null;
	haloOpacity?: number;
	/** frame ranges [from, to) in which the halo is lit; default = always (when halo is set) */
	haloRanges?: [number, number][];
	breach?: LetterboxBreach[];
	style?: React.CSSProperties;
};

/**
 * Cinema bars that slam in and out on beats, with an optional hairline halo on the inner edges and one-frame
 * glitch breaches. Drop it over anything, or wrap a scene in it.
 */
export const Letterbox: React.FC<LetterboxProps> = ({
	children,
	ratio = 2.35,
	inAt = 0,
	outAt = Infinity,
	inFrames = 6,
	outFrames = 6,
	stagger = 1,
	color = '#000',
	halo = null,
	haloOpacity = 0.7,
	haloRanges,
	breach = [],
	style,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	const target = Math.max(0, (height - width / ratio) / 2);

	const amount = (f: number): number => {
		const pin = progress(f, inAt, inFrames, CURVES.snap);
		const pout = Number.isFinite(outAt) ? progress(f, outAt, outFrames, CURVES.snap) : 0;
		return pin * (1 - pout);
	};
	let top = target * amount(frame);
	let bottom = target * amount(frame - stagger);
	for (const b of breach) {
		const n = b.frames ?? 1;
		if (frame >= b.at && frame < b.at + n) {
			const keep = 1 - (b.open ?? 0.4);
			const side = b.side ?? 'top';
			if (side === 'top' || side === 'both') {
				top *= keep;
			}
			if (side === 'bottom' || side === 'both') {
				bottom *= keep;
			}
		}
	}
	const haloOn = halo !== null && (!haloRanges || haloRanges.some(([a, b]) => frame >= a && frame < b));
	const line = Math.max(1, 2 * u);
	const glow = 9 * u;

	return (
		<AbsoluteFill style={style}>
			{children}
			<AbsoluteFill style={{pointerEvents: 'none'}}>
				{/* +1 px so the bar never leaves a seam at fractional heights */}
				{top > 0.01 ? <div style={{position: 'absolute', left: 0, right: 0, top: 0, height: top + 1, background: color}} /> : null}
				{bottom > 0.01 ? <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: bottom + 1, background: color}} /> : null}
				{haloOn && top > 1 ? (
					<>
						<div style={{position: 'absolute', left: 0, right: 0, top: top, height: line, background: halo ?? undefined, opacity: haloOpacity}} />
						<div style={{position: 'absolute', left: 0, right: 0, top: top + line, height: glow, background: `linear-gradient(180deg, ${halo}, transparent)`, opacity: haloOpacity * 0.3}} />
					</>
				) : null}
				{haloOn && bottom > 1 ? (
					<>
						<div style={{position: 'absolute', left: 0, right: 0, bottom: bottom, height: line, background: halo ?? undefined, opacity: haloOpacity}} />
						<div style={{position: 'absolute', left: 0, right: 0, bottom: bottom + line, height: glow, background: `linear-gradient(0deg, ${halo}, transparent)`, opacity: haloOpacity * 0.3}} />
					</>
				) : null}
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

const BREACH_AT = 37;

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const u = useUnit();
	// the glitch frame also kicks the picture sideways, so the opened bar shows shifted content
	const glitch = frame === BREACH_AT;
	return (
		<>
			<AbsoluteFill style={{background: DEMO.ink, transform: `translate(${glitch ? -18 * u : 0}px, ${glitch ? 10 * u : 0}px)`, willChange: 'transform'}}>
				<WorldScene palette="dusk" />
			</AbsoluteFill>
			<Letterbox inAt={6} outAt={66} halo={DEMO.cyan} breach={[{at: BREACH_AT, frames: 1, open: 0.5, side: 'both'}]} />
			<Tag text="2.35 : 1 / BREACH + HALO" bottom={110} />
		</>
	);
};

export const letterboxEntry: LibraryEntry = {
	meta: {
		id: 'letterbox',
		title: 'Letterbox',
		category: 'camera',
		looks: '2.35:1 bars slam in from top and bottom with a hairline halo on their inner edges, flick open for one glitch frame, and slam away.',
		use: 'Switch a PV into "cinematic" for a hero beat or a trailer card, and back out for the gameplay montage.',
		exportName: 'Letterbox',
		durationInFrames: 90,
		source: {kind: 'original'},
	},
	Demo,
};
