import React, {useId} from 'react';
import {Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {charLayout, fitSize, glyphContour} from './_display-utils';

export type OutlineDrawProps = {
	text: string;
	/** px at 720p */
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number | string;
	/** extra px between glyphs at 720p */
	letterSpacing?: number;
	/** fill colour that wipes in */
	color?: string;
	/** colour of the drawing stroke */
	strokeColor?: string;
	/** stroke width, px at 720p */
	strokeWidth?: number;
	/** frames one glyph takes to trace its outline */
	drawFrames?: number;
	/** frames between the start of one glyph and the next */
	stagger?: number;
	/** how far into a glyph's trace its fill starts (0..1) */
	fillAt?: number;
	/** frames the fill wipe takes */
	fillFrames?: number;
	/** 'up' wipes from the baseline up, 'right' left to right */
	fillDirection?: 'up' | 'right';
	/** stroke opacity once the fill has landed (0 = stroke disappears, 1 = stays) */
	strokeKeep?: number;
	/**
	 * pen length in em. 0 (default) = measured per glyph from its own longest contour, so every letter's trace
	 * ends exactly when its draw ends. A fixed value must exceed the longest contour (about 6.6 em for '@'),
	 * otherwise the end of the outline is never traced.
	 */
	dashEm?: number;
	/** colour of the diagonal sheen that crosses the finished word (null = none) */
	sheen?: string | null;
	sheenFrames?: number;
	/** never fill: leaves an outline-only title */
	outlineOnly?: boolean;
	/** the word is shrunk to fit this share of the frame width (0 = never shrink) */
	fitWidth?: number;
	/** vertical nudge, px at 720p */
	offsetY?: number;
	style?: React.CSSProperties;
};

/**
 * Glyph outlines trace themselves as a stroke, letter by letter (SVG text with a dash pen, no font
 * parsing), then a fill wipes up inside each letter while the stroke settles back, and one diagonal sheen
 * crosses the word. Starts at frame 0 of its <Sequence>; the last frame is the finished word.
 */
export const OutlineDraw: React.FC<OutlineDrawProps> = ({
	text,
	fontSize = 230,
	fontFamily = DISPLAY_FONT,
	fontWeight = 400,
	letterSpacing = 4,
	color = DEMO.yellow,
	strokeColor = DEMO.paper,
	strokeWidth = 3,
	drawFrames = 24,
	stagger = 2.5,
	fillAt = 0.7,
	fillFrames = 11,
	fillDirection = 'up',
	strokeKeep = 0.4,
	dashEm = 0,
	sheen = '#ffffff',
	sheenFrames = 12,
	outlineOnly = false,
	fitWidth = 0.88,
	offsetY = 0,
	style,
}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const u = useUnit();
	const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
	const fs = fitSize(text, fontFamily, fontSize * u, fitWidth * width, fontWeight, letterSpacing * u);
	const lay = charLayout(text, fontFamily, fs, fontWeight, letterSpacing * u * (fs / (fontSize * u)));
	const left = (width - lay.width) / 2;
	const base = height / 2 + lay.capHeight / 2 + offsetY * u;
	const top0 = base - lay.capHeight - 0.06 * fs;
	const bottom0 = base + 0.26 * fs;

	// one entry per visible glyph, numbered left to right so spaces do not delay the cascade
	let n = 0;
	const glyphs = lay.chars.map((ch, i) => {
		if (ch.trim() === '') {
			return null;
		}
		const idx = n++;
		const t0 = idx * stagger;
		const draw = progress(frame, t0, drawFrames, CURVES.inOutCubic);
		const fill = outlineOnly ? 0 : progress(frame, t0 + drawFrames * fillAt, fillFrames, CURVES.quintOut);
		// the pen is a dash as long as the glyph's longest contour (+10 % for the measuring error), so the trace always reaches its end
		const pen = (dashEm > 0 ? dashEm : glyphContour(ch, fontFamily, fontWeight).longest * 1.1) * fs;
		return {ch, i, x: left + lay.x[i], w: lay.w[i], draw, fill, pen};
	});
	const count = n;
	const lastFillEnd = (count - 1) * stagger + drawFrames * fillAt + fillFrames;
	const sheenP = sheen && !outlineOnly ? progress(frame, lastFillEnd - 3, sheenFrames, Easing.inOut(Easing.quad)) : 0;
	const sheenBand = lay.width * 0.16;
	const sheenX = left - sheenBand + sheenP * (lay.width + sheenBand * 2);
	const tilt = (-22 * Math.PI) / 180;
	const gx = (Math.cos(tilt) * sheenBand) / 2;
	const gy = (Math.sin(tilt) * sheenBand) / 2;
	const textProps = {
		fontFamily,
		fontSize: fs,
		fontWeight,
		textRendering: 'geometricPrecision' as const,
	};

	return (
		<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', inset: 0, ...style}}>
			<defs>
				{glyphs.map((g) => {
					if (!g) {
						return null;
					}
					const pad = 0.1 * fs;
					const gw = g.w + pad * 2;
					return (
						<clipPath key={g.i} id={`${uid}c${g.i}`}>
							{fillDirection === 'up' ? (
								<rect x={g.x - pad} y={bottom0 - (bottom0 - top0) * g.fill} width={gw} height={(bottom0 - top0) * g.fill + 0.5} />
							) : (
								<rect x={g.x - pad} y={top0} width={gw * g.fill} height={bottom0 - top0} />
							)}
						</clipPath>
					);
				})}
				<linearGradient id={`${uid}s`} gradientUnits="userSpaceOnUse" x1={sheenX - gx} y1={height / 2 - gy} x2={sheenX + gx} y2={height / 2 + gy}>
					<stop offset="0" stopColor={sheen ?? '#fff'} stopOpacity="0" />
					<stop offset="0.5" stopColor={sheen ?? '#fff'} stopOpacity="0.95" />
					<stop offset="1" stopColor={sheen ?? '#fff'} stopOpacity="0" />
				</linearGradient>
			</defs>
			{/* stroke pass: a dash pen of length `pen` slides along every contour */}
			{glyphs.map((g) => {
				if (!g || g.draw <= 0) {
					return null;
				}
				const done = g.draw >= 1;
				return (
					<text
						key={g.i}
						x={g.x}
						y={base}
						{...textProps}
						fill="none"
						stroke={strokeColor}
						strokeWidth={strokeWidth * u}
						strokeLinejoin="miter"
						strokeMiterlimit={4}
						strokeOpacity={1 - (1 - strokeKeep) * g.fill}
						strokeDasharray={done ? undefined : `${g.pen} ${g.pen * 4}`}
						strokeDashoffset={done ? undefined : g.pen * (1 - g.draw)}
					>
						{g.ch}
					</text>
				);
			})}
			{/* fill pass: clipped wipe */}
			{glyphs.map((g) =>
				g && g.fill > 0 ? (
					<text key={g.i} x={g.x} y={base} {...textProps} fill={color} clipPath={`url(#${uid}c${g.i})`}>
						{g.ch}
					</text>
				) : null,
			)}
			{/* sheen pass */}
			{sheenP > 0 && sheenP < 1
				? glyphs.map((g) =>
						g ? (
							<text key={g.i} x={g.x} y={base} {...textProps} fill={`url(#${uid}s)`}>
								{g.ch}
							</text>
						) : null,
					)
				: null}
		</svg>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		<OutlineDraw text="REBORN" drawFrames={26} stagger={4} />
	</Backdrop>
);

export const outlineDrawEntry: LibraryEntry = {
	meta: {
		id: 'outline-draw',
		title: 'Outline draw',
		category: 'text',
		looks: 'Glyph outlines trace themselves as a stroke letter by letter, then a fill wipes up inside each one and one diagonal sheen crosses the word.',
		use: 'Game title reveals and chapter cards that should feel hand-inked then lit; outline-only mode for ghost titles.',
		exportName: 'OutlineDraw',
		durationInFrames: 72,
		source: {kind: 'original'},
	},
	Demo,
};
