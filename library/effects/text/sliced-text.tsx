import React, {useId} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {fitSize, measure, rnd} from './_display-utils';

export type SlicedTextProps = {
	text: string;
	/** largest font size, px at 720p; the word is shrunk to fit `fitWidth` */
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number | string;
	color?: string;
	/** colour of every second strip (null = same as `color`) */
	altColor?: string | null;
	/** number of strips */
	slices?: number;
	/** 'horizontal': bands stacked top to bottom, sliding sideways. 'vertical': columns, sliding up and down */
	direction?: 'horizontal' | 'vertical';
	/** 'slide' travels in from alternating sides, 'scale' grows each strip from its side edge */
	mode?: 'slide' | 'scale';
	/** how far strips start from home in slide mode, px at 720p */
	travel?: number;
	/** frames each strip takes to land */
	inFrames?: number;
	/** frames between one strip's start and the next */
	stagger?: number;
	/** dark seam between strips while they rest, px at 720p; it closes into a solid word */
	gap?: number;
	/** frames the striped word rests before the seams close */
	holdFrames?: number;
	/** frames the seams take to close */
	settleFrames?: number;
	/** frame at which the strips leave through the opposite side (null = the word stays) */
	exitAt?: number | null;
	exitFrames?: number;
	/** the word is shrunk to fit this share of the frame width */
	fitWidth?: number;
	/** changes the strip proportions */
	seed?: number;
	style?: React.CSSProperties;
};

/**
 * A huge word cut into strips of uneven width that slide in from alternating sides (or grow from their
 * edge), land one after another and lock into the word; the seams close, and on `exitAt` the strips
 * leave out of the opposite side. Starts at frame 0 of its <Sequence>.
 */
export const SlicedText: React.FC<SlicedTextProps> = ({
	text,
	fontSize = 400,
	fontFamily = DISPLAY_FONT,
	fontWeight = 400,
	color = DEMO.paper,
	altColor = null,
	slices = 6,
	direction = 'horizontal',
	mode = 'slide',
	travel = 1000,
	inFrames = 16,
	stagger = 2,
	gap = 3.5,
	holdFrames = 8,
	settleFrames = 6,
	exitAt = null,
	exitFrames = 12,
	fitWidth = 0.86,
	seed = 3,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const {width, height} = useVideoConfig();
	const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
	const fs = fitSize(text, fontFamily, fontSize * u, fitWidth * width, fontWeight);
	const box = measure(text, fontFamily, fs, fontWeight);
	const horizontal = direction === 'horizontal';
	const base = height / 2 + box.capHeight / 2;
	const capTop = base - box.capHeight;
	const left = (width - box.width) / 2;
	const right = left + box.width;

	// strip proportions: uneven, from the seed
	const n = Math.max(2, Math.round(slices));
	const w = Array.from({length: n}, (_, i) => 0.65 + rnd('sliced', seed, i));
	const wSum = w.reduce((a, b) => a + b, 0);
	const edges = [0];
	w.forEach((v) => edges.push(edges[edges.length - 1] + v / wSum));
	const a0 = horizontal ? capTop - 0.02 * fs : left - 0.02 * fs;
	const a1 = horizontal ? base + 0.02 * fs : right + 0.02 * fs;

	const lockAt = (n - 1) * stagger + inFrames;
	const settle = progress(frame, lockAt + holdFrames, settleFrames, CURVES.inOutCubic);
	const seam = gap * u * (1 - settle);
	const overlap = seam < 0.5 ? 1 : 0;

	return (
		<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{position: 'absolute', inset: 0, ...style}}>
			<defs>
				{Array.from({length: n}, (_, i) => {
					const s0 = a0 + edges[i] * (a1 - a0) + seam / 2 - overlap;
					const s1 = a0 + edges[i + 1] * (a1 - a0) - seam / 2 + overlap;
					const big = Math.max(width, height) * 3;
					return (
						<clipPath key={i} id={`${uid}b${i}`}>
							{horizontal ? (
								<rect x={-big} y={s0} width={big * 3} height={Math.max(0, s1 - s0)} />
							) : (
								<rect x={s0} y={-big} width={Math.max(0, s1 - s0)} height={big * 3} />
							)}
						</clipPath>
					);
				})}
			</defs>
			{Array.from({length: n}, (_, i) => {
				// odd strips come from one side, even from the other
				const side = i % 2 === 0 ? 1 : -1;
				const e = progress(frame, i * stagger, inFrames, CURVES.snap);
				const out = exitAt === null ? 0 : progress(frame, exitAt + i * stagger * 0.6, exitFrames, CURVES.expoIn);
				let transform: string;
				if (mode === 'slide') {
					const d = (side * travel * u * (1 - e) - side * travel * u * out) * 1;
					transform = horizontal ? `translate(${d} 0)` : `translate(0 ${d})`;
				} else {
					// scale: grows from the edge it came from, leaves toward the opposite edge
					const s = Math.max(0, e - out);
					const fromEnd = out > 0 ? -side : side;
					if (horizontal) {
						const ox = fromEnd > 0 ? right : left;
						transform = `translate(${ox} 0) scale(${s} 1) translate(${-ox} 0)`;
					} else {
						const oy = fromEnd > 0 ? base : capTop;
						transform = `translate(0 ${oy}) scale(1 ${s}) translate(0 ${-oy})`;
					}
				}
				if (e <= 0 || (exitAt !== null && out >= 1)) {
					return null;
				}
				return (
					<g key={i} transform={transform}>
						<g clipPath={`url(#${uid}b${i})`}>
							<text
								x={width / 2}
								y={base}
								textAnchor="middle"
								fontFamily={fontFamily}
								fontSize={fs}
								fontWeight={fontWeight}
								fill={altColor && i % 2 === 1 ? altColor : color}
								textRendering="geometricPrecision"
							>
								{text}
							</text>
						</g>
					</g>
				);
			})}
		</svg>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		<SlicedText text="FRACTURE" exitAt={54} />
	</Backdrop>
);

export const slicedTextEntry: LibraryEntry = {
	meta: {
		id: 'sliced-text',
		title: 'Sliced text',
		category: 'text',
		looks: 'A huge word cut into uneven strips that slide in from alternating sides, land one after another, close their seams into a solid word and leave out of the opposite side.',
		use: 'Section titles and one-word statements that need weight; bold reveal with a clean lock-up.',
		exportName: 'SlicedText',
		durationInFrames: 78,
		source: {
			kind: 'inspired',
			name: 'Codrops SlicedTextEffect (js/index.js, MIT)',
			url: 'https://raw.githubusercontent.com/codrops/SlicedTextEffect/main/js/index.js',
		},
	},
	Demo,
};
