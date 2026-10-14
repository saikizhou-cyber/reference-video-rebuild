import React from 'react';
import {AbsoluteFill, Sequence, interpolate, random, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

export type SlamTextProps = {
	text: string;
	/** frames from oversized to landed */
	inFrames?: number;
	/** scale the word starts at */
	fromScale?: number;
	/** degrees of rotation it lands out of */
	fromRotate?: number;
	color?: string;
	/** colour of the 2-frame flash card behind the word on impact (null = none) */
	flash?: string | null;
	/** peak camera-shake amplitude in px at 720p, decays over ~8 frames */
	shake?: number;
	fontSize?: number;
	fontFamily?: string;
	seed?: number;
	style?: React.CSSProperties;
};

/**
 * A word slams in from oversized and lands hard: snap scale-down, a slight rotation settle,
 * a 2-frame flash card on impact and a short decaying shake. Starts at frame 0 of its <Sequence>.
 */
export const SlamText: React.FC<SlamTextProps> = ({
	text,
	inFrames = 6,
	fromScale = 2.6,
	fromRotate = -8,
	color = DEMO.paper,
	flash = DEMO.yellow,
	shake = 14,
	fontSize = 200,
	fontFamily = DISPLAY_FONT,
	seed = 1,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const p = progress(frame, 0, inFrames, CURVES.snap);
	const scale = interpolate(p, [0, 1], [fromScale, 1]);
	const rotate = interpolate(p, [0, 1], [fromRotate, 0]);
	const opacity = interpolate(frame, [0, 1], [0, 1], {extrapolateRight: 'clamp'});
	// impact happens when the move lands; shake decays exponentially after it
	const since = frame - inFrames;
	const amp = since >= 0 ? shake * u * Math.exp(-since / 3) : 0;
	const dx = amp * (random(`${seed}-x-${frame}`) * 2 - 1);
	const dy = amp * (random(`${seed}-y-${frame}`) * 2 - 1);
	const flashOn = flash !== null && since >= 0 && since < 2;
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: `translate(${dx}px, ${dy}px)`}}>
			{flashOn ? <AbsoluteFill style={{background: flash ?? undefined}} /> : null}
			<div
				style={{
					fontFamily,
					fontSize: fontSize * u,
					lineHeight: 1,
					color: flashOn ? DEMO.ink : color,
					letterSpacing: -0.02 * fontSize * u,
					transform: `scale(${scale}) rotate(${rotate}deg)`,
					opacity,
					whiteSpace: 'nowrap',
					...style,
				}}
			>
				{text}
			</div>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		{['DRAW', 'YOUR', 'CARD'].map((w, i) => (
			<Sequence key={w} from={i * 15} durationInFrames={15}>
				<SlamText text={w} seed={i + 1} fromRotate={i % 2 ? 7 : -8} />
			</Sequence>
		))}
		<Sequence from={45}>
			<SlamText text="NOW." color={DEMO.red} flash={DEMO.paper} seed={9} fontSize={260} />
		</Sequence>
	</Backdrop>
);

export const slamText: LibraryEntry = {
	meta: {
		id: 'slam-text',
		title: 'Slam text',
		category: 'text',
		looks: 'A word drops from 2.6x to 1x in 6 frames with a rotation settle, a 2-frame flash card and a decaying shake.',
		use: 'One word per beat in a hype section; titles that must hit.',
		notes: 'The hit (a 2-frame flash card and the start of the shake) is on frame inFrames (default 6) of its `<Sequence>`, not on frame 0 (measured): start the Sequence inFrames before the beat.',
		exportName: 'SlamText',
		durationInFrames: 75,
		source: {kind: 'original'},
	},
	Demo,
};
