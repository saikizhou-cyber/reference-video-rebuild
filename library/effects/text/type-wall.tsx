import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, progress, sinceBeat} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {measure} from './_display-utils';

export type TypeWallRow = {
	/** 'solid' = filled type, 'outline' = stroke only, 'accent' = a colour band with ink type on it */
	kind: 'solid' | 'outline' | 'accent';
	/** speed multiplier of this row (1 = base speed) */
	speed?: number;
	/** opacity of the row's type */
	dim?: number;
	/** horizontal squeeze of the row's type (0.8 = narrow face) */
	stretch?: number;
};

export type TypeWallProps = {
	/** the one word the wall is made of */
	text: string;
	/** top to bottom; directions alternate row by row */
	rows?: TypeWallRow[];
	/** row pitch, px at 720p; the type is sized from it */
	rowHeight?: number;
	/** base speed, px per frame at 720p */
	speed?: number;
	/** px at 720p between two repeats of the word */
	gap?: number;
	fontFamily?: string;
	fontWeight?: number | string;
	color?: string;
	/** band colour of accent rows */
	accent?: string;
	/** type colour on the accent band */
	accentInk?: string;
	/** stroke of outline rows, px at 720p */
	outlineWidth?: number;
	/** frames on which every row surges (speed x `surge`, skewed) and settles back */
	beats?: number[];
	/** speed multiplier at the peak of a beat */
	surge?: number;
	/** peak skew in degrees at a beat */
	skew?: number;
	/** the wall starts this much larger and settles to 1 (slow zoom-out) */
	zoomFrom?: number;
	/** frames of that zoom-out */
	zoomFrames?: number;
	/** blur in px at the start; it pulls into focus over `focusFrames` */
	blurFrom?: number;
	focusFrames?: number;
	/** frames each row takes to wipe in (rows start from the middle out, 2 frames apart) */
	enterFrames?: number;
	/** rotate the whole wall, degrees */
	tilt?: number;
	style?: React.CSSProperties;
};

const DEFAULT_ROWS: TypeWallRow[] = [
	{kind: 'outline', speed: 0.8, dim: 0.35, stretch: 0.9},
	{kind: 'solid', speed: 1.35, dim: 0.92},
	{kind: 'outline', speed: 1, stretch: 1.08},
	{kind: 'accent', speed: 1.8},
	{kind: 'outline', speed: 0.9, stretch: 0.9},
	{kind: 'solid', speed: 1.2, dim: 0.92},
	{kind: 'outline', speed: 1.1, dim: 0.35, stretch: 1.08},
];

const mod = (v: number, m: number) => ((v % m) + m) % m;

/**
 * Rows of one word fill the frame and scroll in alternating directions at different speeds, mixing solid,
 * outline and accent-band rows. Every row loops seamlessly (the offset is a modulo of the repeat width),
 * beats make the whole wall surge and skew, and a slow zoom-out with a rack focus settles it. Starts at
 * frame 0 of its <Sequence>.
 */
export const TypeWall: React.FC<TypeWallProps> = ({
	text,
	rows = DEFAULT_ROWS,
	rowHeight = 112,
	speed = 6,
	gap = 56,
	fontFamily = DISPLAY_FONT,
	fontWeight = 400,
	color = DEMO.paper,
	accent = DEMO.red,
	accentInk = DEMO.ink,
	outlineWidth = 2.5,
	beats = [],
	surge = 2.6,
	skew = 9,
	zoomFrom = 1.1,
	zoomFrames = 50,
	blurFrom = 9,
	focusFrames = 12,
	enterFrames = 14,
	tilt = 0,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const {width, height} = useVideoConfig();
	const pitch = rowHeight * u;
	const fs = pitch * 1.12;
	const m = measure(text, fontFamily, fs, fontWeight);
	const capMid = m.baseline - m.capHeight / 2;
	const unit = m.width + gap * u;
	const big = Math.hypot(width, height) * 1.12;
	const n = rows.length;

	// surge envelope: 1 on a beat, decaying; distance travelled integrates the surge frame by frame
	const pulse = (f: number) => {
		if (!beats.length) {
			return 0;
		}
		const s = sinceBeat(f, beats);
		return Number.isFinite(s) ? Math.exp(-s / 5) : 0;
	};
	let surgeSum = 0;
	for (let f = 0; f < frame; f++) {
		surgeSum += pulse(f);
	}
	const travelBase = speed * u * (frame + (surge - 1) * surgeSum);
	const skewNow = skew * pulse(frame);

	const zoom = zoomFrom + (1 - zoomFrom) * progress(frame, 0, zoomFrames, CURVES.quintOut);
	const blur = blurFrom * (1 - progress(frame, 0, focusFrames, CURVES.expoOut));

	return (
		<div style={{position: 'absolute', inset: 0, overflow: 'hidden', ...style}}>
			<div
				style={{
					position: 'absolute',
					left: (width - big) / 2,
					top: (height - big) / 2,
					width: big,
					height: big,
					transform: `rotate(${tilt}deg) scale(${zoom})`,
					filter: blur > 0.2 ? `blur(${blur}px)` : undefined,
				}}
			>
				{rows.map((row, i) => {
					const dir = i % 2 === 0 ? -1 : 1;
					const k = row.stretch ?? 1;
					const rowUnit = unit * k;
					const dist = mod(travelBase * (row.speed ?? 1), rowUnit);
					const x = dir < 0 ? -dist : dist - rowUnit;
					const copies = Math.ceil(big / rowUnit) + 2;
					const y = big / 2 + (i - (n - 1) / 2) * pitch - pitch / 2;
					const e = progress(frame, Math.abs(i - (n - 1) / 2) * 2, enterFrames, CURVES.expoOut);
					const outline = row.kind === 'outline';
					return (
						<div
							key={i}
							style={{
								position: 'absolute',
								left: 0,
								top: y,
								width: big,
								height: pitch,
								overflow: 'hidden',
								background: row.kind === 'accent' ? accent : undefined,
								clipPath: dir < 0 ? `inset(0 0 0 ${(1 - e) * 100}%)` : `inset(0 ${(1 - e) * 100}% 0 0)`,
							}}
						>
							<div
								style={{
									position: 'absolute',
									left: 0,
									top: pitch / 2 - capMid,
									display: 'flex',
									width: copies * rowUnit,
									transform: `translateX(${x}px) skewX(${-dir * skewNow}deg) scaleX(${k})`,
									transformOrigin: '0 50%',
									opacity: row.dim ?? 1,
									fontFamily,
									fontWeight,
									fontSize: fs,
									lineHeight: 1,
									whiteSpace: 'pre',
									color: outline ? 'transparent' : row.kind === 'accent' ? accentInk : color,
									WebkitTextStroke: outline ? `${outlineWidth * u}px ${color}` : undefined,
								}}
							>
								{Array.from({length: copies}, (_, c) => (
									<span key={c} style={{flex: `0 0 ${unit}px`, width: unit}}>
										{text}
									</span>
								))}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		<TypeWall text="OVERRUN" beats={[24, 48, 72]} />
	</Backdrop>
);

export const typeWallEntry: LibraryEntry = {
	meta: {
		id: 'type-wall',
		title: 'Type wall',
		category: 'text',
		looks: 'Rows of one word fill the frame and scroll in opposite directions at different speeds, solid, outline and a colour band, surging and skewing on the beat.',
		use: 'Hype backdrops, chapter breaks and beat-synced title walls; a sustained filler behind a hero shot.',
		exportName: 'TypeWall',
		durationInFrames: 90,
		source: {kind: 'original'},
	},
	Demo,
};
