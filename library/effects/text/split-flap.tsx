import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {Backdrop, BODY_FONT, DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp01, glyphs, hash01} from './_reveal-utils';

export type SplitFlapProps = {
	/** target text; "\n" starts a new row. Every character gets its own cell */
	text: string;
	/** text the board shows before it flips. Rows may differ in length: the board keeps the larger shape and spare cells flip to / from blank. null = each cell starts a few drum steps before its target */
	from?: string | null;
	/** the character drum every cell steps along, in order. Characters of `text` missing from it are appended */
	drum?: string;
	/** frames per flap (one step of the drum) */
	flapFrames?: number;
	/** [min, max] flaps per cell when `from` is null */
	flaps?: readonly [number, number];
	/** with `from`: longest a cell flips for, in frames (long drum distances speed up instead of dragging on) */
	maxFrames?: number;
	/** frames between neighbouring cells starting to flip, left to right */
	cellStagger?: number;
	/** frames between rows */
	rowStagger?: number;
	seed?: number;
	/** colour a cell's character shows for 3 frames after it lands (null = none) */
	landColor?: string | null;
	color?: string;
	/** colours of the upper and lower card halves */
	topColor?: string;
	bottomColor?: string;
	/** px at 720p: the character size; cells are sized from it */
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number;
	/** cell width / height in em, and the gap between cells */
	cellWidth?: number;
	cellHeight?: number;
	gap?: number;
	style?: React.CSSProperties;
};

const DEFAULT_DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-:/';
/** characters wider than the cell get squeezed so they never get clipped */
const WIDE: Record<string, number> = {M: 0.88, W: 0.84, '/': 0.9};

type CellProps = {
	cur: string;
	/** incoming character while a flap is in the air */
	next: string | null;
	/** flap angle in degrees, 0..180 */
	theta: number;
	w: number;
	h: number;
	fontPx: number;
	fontFamily: string;
	fontWeight: number;
	color: string;
	topColor: string;
	bottomColor: string;
};

const Half: React.FC<{ch: string; top: boolean} & Pick<CellProps, 'w' | 'h' | 'fontPx' | 'fontFamily' | 'fontWeight' | 'color'>> = ({
	ch,
	top,
	w,
	h,
	fontPx,
	fontFamily,
	fontWeight,
	color,
}) => (
	<div
		style={{
			position: 'absolute',
			left: 0,
			top: top ? 0 : -h / 2,
			width: w,
			height: h,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			fontFamily,
			fontWeight,
			fontSize: fontPx,
			lineHeight: 1,
			color,
		}}
	>
		<span style={{display: 'inline-block', transform: `scaleX(${WIDE[ch] ?? 1})`, whiteSpace: 'pre'}}>{ch}</span>
	</div>
);

const Cell: React.FC<CellProps> = (p) => {
	const {cur, next, theta, w, h, topColor, bottomColor} = p;
	const flipping = next !== null;
	const half = h / 2;
	const common = {w, h, fontPx: p.fontPx, fontFamily: p.fontFamily, fontWeight: p.fontWeight, color: p.color};
	const leaf = (isTop: boolean): React.CSSProperties => ({
		position: 'absolute',
		left: 0,
		top: isTop ? 0 : half,
		width: w,
		height: half,
		overflow: 'hidden',
		background: isTop ? topColor : bottomColor,
		borderRadius: isTop ? `${w * 0.09}px ${w * 0.09}px 0 0` : `0 0 ${w * 0.09}px ${w * 0.09}px`,
		backfaceVisibility: 'hidden',
	});
	const sin = Math.sin((theta * Math.PI) / 180);
	// the falling leaf shades the card it falls onto
	const shadeBottom = flipping && theta < 90 ? 0.55 * sin : 0;
	const shadeTop = flipping && theta >= 90 ? 0.55 * sin : 0;
	return (
		<div style={{position: 'relative', width: w, height: h, perspective: h * 4}}>
			<div style={leaf(true)}>
				<Half ch={flipping ? (next ?? cur) : cur} top {...common} />
				{shadeTop > 0 ? <div style={{position: 'absolute', inset: 0, background: `rgba(0,0,0,${shadeTop})`}} /> : null}
			</div>
			<div style={leaf(false)}>
				<Half ch={cur} top={false} {...common} />
				{shadeBottom > 0 ? <div style={{position: 'absolute', inset: 0, background: `rgba(0,0,0,${shadeBottom})`}} /> : null}
			</div>
			{flipping && theta < 90 ? (
				<div style={{...leaf(true), transformOrigin: '50% 100%', transform: `rotateX(${-theta}deg)`, filter: `brightness(${1 - 0.5 * sin})`}}>
					<Half ch={cur} top {...common} />
				</div>
			) : null}
			{flipping && theta >= 90 ? (
				<div style={{...leaf(false), transformOrigin: '50% 0%', transform: `rotateX(${180 - theta}deg)`, filter: `brightness(${1 - 0.5 * sin})`}}>
					<Half ch={next ?? cur} top={false} {...common} />
				</div>
			) : null}
			{/* hinge slit and its two pins */}
			<div style={{position: 'absolute', left: 0, right: 0, top: half - Math.max(1, w * 0.012), height: Math.max(2, w * 0.024), background: DEMO.ink}} />
			<div style={{position: 'absolute', left: -w * 0.012, top: half - w * 0.035, width: w * 0.05, height: w * 0.07, background: DEMO.ink, borderRadius: w * 0.02}} />
			<div style={{position: 'absolute', right: -w * 0.012, top: half - w * 0.035, width: w * 0.05, height: w * 0.07, background: DEMO.ink, borderRadius: w * 0.02}} />
		</div>
	);
};

/**
 * Airport split-flap board: every character is a card that steps along a drum alphabet, flap by flap,
 * the upper leaf falling and the lower leaf landing with shading at the hinge, cells settling left to right.
 */
export const SplitFlap: React.FC<SplitFlapProps> = ({
	text,
	from = null,
	drum = DEFAULT_DRUM,
	flapFrames = 3,
	flaps = [5, 9],
	maxFrames = 26,
	cellStagger = 1.5,
	rowStagger = 6,
	seed = 1,
	landColor = null,
	color = DEMO.paper,
	topColor = '#1e1e27',
	bottomColor = '#15151c',
	fontSize = 96,
	fontFamily = BODY_FONT,
	fontWeight = 800,
	cellWidth = 0.84,
	cellHeight = 1.3,
	gap = 0.08,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const textRows = text.split('\n').map((r) => glyphs(r.toUpperCase()));
	const fromRows = from === null ? null : from.split('\n').map((r) => glyphs(r.toUpperCase()));
	// the board keeps its shape: both texts are padded with blank cells to the larger row count and row length,
	// so cells that have no character in one of the messages flip to / from blank instead of appearing or vanishing
	const rowCount = Math.max(textRows.length, fromRows?.length ?? 0);
	const pad = (rows: string[][], ri: number): string[] => {
		const cols = Math.max(textRows[ri]?.length ?? 0, fromRows?.[ri]?.length ?? 0);
		const row = rows[ri] ?? [];
		return [...row, ...Array.from({length: cols - row.length}, () => ' ')];
	};
	const rowsTo = Array.from({length: rowCount}, (_, ri) => pad(textRows, ri));
	const rowsFrom = fromRows === null ? null : Array.from({length: rowCount}, (_, ri) => pad(fromRows, ri));
	// the drum, extended by whatever the texts need that it does not have
	const extra = [...rowsTo.flat(), ...(rowsFrom?.flat() ?? [])].filter((c, i, a) => !drum.includes(c) && a.indexOf(c) === i);
	const wheel = [...glyphs(drum), ...extra];
	const L = wheel.length;
	const px = fontSize * u;
	const w = cellWidth * px;
	const h = cellHeight * px;
	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: gap * px, ...style}}>
			{rowsTo.map((row, ri) => (
				<div key={ri} style={{display: 'flex', gap: gap * px}}>
					{row.map((target, ci) => {
						const t = Math.max(0, wheel.indexOf(target));
						let s: number;
						let n: number;
						let flapDur: number;
						if (rowsFrom === null) {
							n = flaps[0] + Math.floor(hash01(seed, ri, ci) * (flaps[1] - flaps[0] + 1));
							s = (((t - n) % L) + L) % L;
							flapDur = flapFrames;
						} else {
							s = Math.max(0, wheel.indexOf(rowsFrom[ri]?.[ci] ?? ' '));
							n = (((t - s) % L) + L) % L;
							flapDur = n === 0 ? 1 : Math.min(flapFrames, maxFrames / n);
						}
						const t0 = ri * rowStagger + ci * cellStagger;
						const e = frame - t0;
						const total = n * flapDur;
						const common = {w, h, fontPx: px, fontFamily, fontWeight, topColor, bottomColor};
						if (e < 0 || n === 0) {
							return <Cell key={ci} cur={wheel[s]} next={null} theta={0} color={color} {...common} />;
						}
						if (e >= total) {
							const landing = landColor !== null && e - total < 3;
							return <Cell key={ci} cur={wheel[t]} next={null} theta={0} color={landing ? (landColor ?? color) : color} {...common} />;
						}
						const k = Math.floor(e / flapDur);
						// sampled mid-frame so a 3-frame flap shows three different angles
						const p = clamp01((e - k * flapDur + 0.5) / flapDur);
						const theta = 180 * p * p;
						return <Cell key={ci} cur={wheel[(s + k) % L]} next={wheel[(s + k + 1) % L]} theta={theta} color={color} {...common} />;
					})}
				</div>
			))}
		</div>
	);
};

const A = 'NOW BOARDING\nGATE 07 OPEN';
const CENTRED: React.CSSProperties = {alignItems: 'center', justifyContent: 'center'};

// the first message finishes flipping around f44 and is held until the second starts at f62, so it reads as a complete board
const Demo: React.FC = () => (
	<Backdrop>
		<Sequence from={0} durationInFrames={62} layout="none">
			<AbsoluteFill style={CENTRED}>
				<SplitFlap text={A} flaps={[4, 7]} landColor={DEMO.yellow} fontSize={100} />
			</AbsoluteFill>
		</Sequence>
		<Sequence from={62} layout="none">
			<AbsoluteFill style={CENTRED}>
				<SplitFlap text={'LAST CALL\nGATE 07 SHUT'} from={A} maxFrames={16} cellStagger={1} rowStagger={5} landColor={DEMO.yellow} fontSize={100} />
			</AbsoluteFill>
		</Sequence>
	</Backdrop>
);

export const splitFlapEntry: LibraryEntry = {
	meta: {
		id: 'split-flap',
		title: 'Split flap',
		category: 'text',
		looks: 'An airport board: each character is a two-leaf card stepping along a drum alphabet, the upper leaf falling and the lower leaf landing with hinge shading, cells settling left to right.',
		use: 'Destination and time boards, scoreboards, countdown-to-location cuts; any line that should arrive mechanically.',
		exportName: 'SplitFlap',
		durationInFrames: 120,
		source: {kind: 'inspired', name: 'HyperFrames', url: 'https://github.com/heygen-com/hyperframes/blob/main/registry/blocks/split-flap-board/split-flap-board.html'},
	},
	Demo,
};
