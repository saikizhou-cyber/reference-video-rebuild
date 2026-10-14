// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/trailer-grammar-moves/TrailerBumper.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: generalised from a fixed 3-shot dashboard to N caller-supplied shots with per-shot framing, 720p-unit scaling, font-fitted title, optional cut kick and hand-off scene. Modified.
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES} from '../../core/easing';
import {DEMO, DISPLAY_FONT, SceneA, SceneB, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {Framed, fitFont, type Framing} from './_edits-utils';

export type TrailerHookProps = {
	/** the shots, hard-cut in order with no transition; each one gets its own slow push */
	shots: React.ReactNode[];
	/** frames each shot stays on screen: one number for all, or one per shot */
	shotFrames?: number | number[];
	/** crop of each shot. Default: every shot wide except the last, a 2.2x punch-in */
	framings?: Framing[];
	/** zoom reached at the end of every shot: the linear 1 -> drift push that keeps it from reading as a slideshow */
	drift?: number;
	/** frames of dead black after the last shot (nothing on screen) */
	black?: number;
	blackColor?: string;
	/** hand-off after the black: a string is set as a big title, a node is shown as is, nothing = the hook just ends on black */
	title?: React.ReactNode;
	/** frames the title takes to fade in */
	titleFrames?: number;
	/** px at 720p the title rises while it fades in */
	rise?: number;
	/** colour behind the title (null = transparent, so the scene under this <Sequence> shows through) */
	titleBackground?: string | null;
	titleColor?: string;
	/** px at 720p, shrunk automatically so a long title still fits */
	fontSize?: number;
	fontFamily?: string;
	/** opacity of a white flash on the first frame of every shot (0 = pure hard cut) */
	cutKick?: number;
};

const defaultFramings = (n: number): Framing[] =>
	Array.from({length: n}, (_, i) => (n > 1 && i === n - 1 ? {scale: 2.2, x: 0.58, y: 0.4} : {scale: 1}));

/**
 * The trailer cold open: a few shots of ~9 frames hard-cut one after another (wide, wide, tight punch-in),
 * a beat of dead black, then the title fades in and rises into place. Starts at frame 0 of its <Sequence>
 * and is completely still once the title has landed.
 */
export const TrailerHook: React.FC<TrailerHookProps> = ({
	shots,
	shotFrames = 9,
	framings,
	drift = 1.04,
	black = 6,
	blackColor = '#000000',
	title,
	titleFrames = 16,
	rise = 44,
	titleBackground = DEMO.ink,
	titleColor = DEMO.paper,
	fontSize = 168,
	fontFamily = DISPLAY_FONT,
	cutKick = 0,
}) => {
	const frame = useCurrentFrame();
	const {width} = useVideoConfig();
	const u = useUnit();
	const lens = shots.map((_, i) => Math.max(1, Math.round(Array.isArray(shotFrames) ? (shotFrames[i] ?? shotFrames[shotFrames.length - 1] ?? 9) : shotFrames)));
	const starts: number[] = [];
	let total = 0;
	for (const len of lens) {
		starts.push(total);
		total += len;
	}
	const frames = framings ?? defaultFramings(shots.length);

	// 1) the hard-cut shots: whichever range the frame falls in is the only thing mounted
	if (frame < total) {
		let i = 0;
		for (let k = 0; k < starts.length; k++) {
			if (frame >= starts[k]) {
				i = k;
			}
		}
		const local = frame - starts[i];
		const push = 1 + (drift - 1) * Math.min(1, local / lens[i]);
		return (
			<AbsoluteFill style={{background: blackColor}}>
				<Framed key={i} framing={frames[i] ?? {scale: 1}} extra={push}>
					{shots[i]}
				</Framed>
				{cutKick > 0 && local === 0 && i > 0 ? <AbsoluteFill style={{background: '#ffffff', opacity: cutKick}} /> : null}
			</AbsoluteFill>
		);
	}

	// 2) dead black: nothing at all on screen
	if (frame < total + black) {
		return <AbsoluteFill style={{background: blackColor}} />;
	}
	if (title === undefined || title === null) {
		return null;
	}

	// 3) hand-off: fade in + rise, then still
	const t = frame - (total + black);
	const opacity = interpolate(t, [0, Math.max(1, titleFrames)], [0, 1], {
		easing: Easing.out(Easing.quad),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const dy = interpolate(t, [0, Math.max(1, titleFrames)], [rise * u, 0], {
		easing: CURVES.quintOut,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const content =
		typeof title === 'string' ? (
			<div
				style={{
					fontFamily,
					fontSize: fitFont(title, width * 0.84, fontSize * u, fontFamily, '-0.01em'),
					lineHeight: 1,
					letterSpacing: '-0.01em',
					color: titleColor,
					whiteSpace: 'nowrap',
				}}
			>
				{title}
			</div>
		) : (
			title
		);
	return (
		<AbsoluteFill style={{background: titleBackground ?? undefined, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
			<div style={{opacity, transform: `translateY(${dy}px)`}}>{content}</div>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<TrailerHook
		shots={[<SceneA key="a" />, <SceneB key="b" />, <SceneA key="c" />]}
		framings={[{scale: 1}, {scale: 1}, {scale: 2, x: 0.236, y: 0.43}]}
		title="FIRST LIGHT"
	/>
);

export const trailerHookEntry: LibraryEntry = {
	meta: {
		id: 'trailer-hook',
		title: 'Trailer hook',
		category: 'timing',
		looks: 'Three 9-frame shots hard-cut (wide, wide, 2.2x punch-in), each creeping 1 -> 1.04, then 6 frames of dead black and the title rises in.',
		use: 'Cold open before the main title of a PV; the speed-cut that sells a trailer in its first second.',
		exportName: 'TrailerHook',
		durationInFrames: 60,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (Trailer Bumper)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/trailer-grammar-moves/TrailerBumper.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
