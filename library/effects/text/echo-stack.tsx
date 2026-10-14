import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {fitSize, measure} from './_display-utils';

export type EchoStackProps = {
	text: string;
	/** px at 720p */
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number | string;
	/** colour of the one clear line */
	color?: string;
	/** colour of the outline copies */
	outlineColor?: string;
	/** stroke of the outline copies, px at 720p */
	outlineWidth?: number;
	/** outline copies above and below the clear line */
	copies?: number;
	/** how far the last copy reaches from the centre, px at 720p */
	reach?: number;
	/** how far round the drum the copies fan out, degrees */
	fan?: number;
	/** drift speed: copy slots per frame (negative drifts the other way) */
	drift?: number;
	/** frames the clear line takes to come into focus and the copies to unfold */
	unfoldFrames?: number;
	/** blur of the farthest copy, px at 720p */
	blur?: number;
	/** the word is shrunk to fit this share of the frame width (0 = never shrink) */
	fitWidth?: number;
	style?: React.CSSProperties;
};

const smooth = (a: number, b: number, v: number) => {
	const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/**
 * One clear line focuses in at the centre while outline copies unfold above and below it and keep
 * drifting round, foreshortened and fading like the far side of a spinning drum. Starts at frame 0 of
 * its <Sequence>, then runs continuously.
 */
export const EchoStack: React.FC<EchoStackProps> = ({
	text,
	fontSize = 190,
	fontFamily = DISPLAY_FONT,
	fontWeight = 400,
	color = DEMO.paper,
	outlineColor = DEMO.cyan,
	outlineWidth = 2.5,
	copies = 3,
	reach = 330,
	fan = 78,
	drift = 0.03,
	unfoldFrames = 26,
	blur = 3.5,
	fitWidth = 0.84,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const {width, height} = useVideoConfig();
	const fs = fitSize(text, fontFamily, fontSize * u, fitWidth * width, fontWeight);
	const m = measure(text, fontFamily, fs, fontWeight);
	const capMid = m.baseline - m.capHeight / 2;
	const unfold = progress(frame, 3, unfoldFrames, CURVES.quintOut);
	const fanRad = (fan * Math.PI) / 180;
	const radius = (reach * u) / Math.sin(fanRad);

	const line = (key: React.Key, css: React.CSSProperties, y: number, sy: number) => (
		<div
			key={key}
			style={{
				position: 'absolute',
				left: 0,
				right: 0,
				top: height / 2 - capMid,
				height: fs,
				textAlign: 'center',
				whiteSpace: 'pre',
				lineHeight: 1,
				fontFamily,
				fontWeight,
				fontSize: fs,
				transformOrigin: `50% ${capMid}px`,
				transform: `translateY(${y}px) scaleY(${sy})`,
				...css,
			}}
		>
			{text}
		</div>
	);

	const echoes: {t: number; node: React.ReactNode}[] = [];
	for (const side of [-1, 1]) {
		for (let k = 0; k < copies; k++) {
			const slot = (k + (side > 0 ? 0 : 0.5) + frame * drift) / copies;
			const t = slot - Math.floor(slot);
			const theta = t * fanRad * unfold;
			const y = side * radius * Math.sin(theta);
			const sy = Math.max(0.04, Math.cos(theta));
			const alpha = Math.min(1, smooth(0, 0.16, t) * Math.pow(1 - t, 0.8) * 1.3);
			if (alpha < 0.01) {
				continue;
			}
			echoes.push({
				t,
				node: line(
					`${side}-${k}`,
					{
						color: 'transparent',
						WebkitTextStroke: `${outlineWidth * u}px ${outlineColor}`,
						opacity: alpha * Math.min(1, unfold * 3),
						filter: t * blur > 0.3 ? `blur(${t * blur * u}px)` : undefined,
					},
					y,
					sy,
				),
			});
		}
	}
	echoes.sort((a, b) => b.t - a.t);

	const focus = progress(frame, 0, unfoldFrames, CURVES.expoOut);
	const heroBlur = 24 * u * (1 - focus);
	const heroScale = 1.16 - 0.16 * focus;
	const heroAlpha = Math.min(1, frame / 5);

	return (
		<div style={{position: 'absolute', inset: 0, overflow: 'hidden', ...style}}>
			{echoes.map((e) => e.node)}
			{line(
				'hero',
				{
					color,
					opacity: heroAlpha,
					filter: heroBlur > 0.3 ? `blur(${heroBlur}px)` : undefined,
				},
				0,
				heroScale,
			)}
		</div>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		<EchoStack text="NO RETURN" />
	</Backdrop>
);

export const echoStackEntry: LibraryEntry = {
	meta: {
		id: 'echo-stack',
		title: 'Echo stack',
		category: 'text',
		looks: 'One crisp line focuses in at the centre while cyan outline copies unfold above and below, squash toward the edge, fade and keep drifting like a drum.',
		use: 'A held title or tagline that needs life over a long shot; calm counterpart to the slam and glitch hits.',
		exportName: 'EchoStack',
		durationInFrames: 84,
		source: {kind: 'inspired', name: 'Remocn echo-stack', url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/echo-stack/index.tsx'},
	},
	Demo,
};
