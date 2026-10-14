// Ported from HyperFrames telemetry-hud (https://github.com/heygen-com/hyperframes/blob/main/registry/components/telemetry-hud/telemetry-hud.html), Apache-2.0, Copyright (c) 2026 HeyGen, Inc.
// Changes: rewritten as a Remotion component driven by useCurrentFrame (GSAP timeline replaced by frame maths), props instead of composition variables, per-frame text tables kept
// (fixed-seed LCG, same-class stand-ins resolving left to right) but unresolved characters are drawn dim, accent marker on the emphasised row, children slot behind the HUD. Modified.
import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, useCurrentFrame} from 'remotion';
import {Backdrop, DEMO, Plate, useUnit} from '../../core/scene';
import {progress} from '../../core/easing';
import type {LibraryEntry} from '../../core/types';
import {MONO_FONT, clamp01, dashWindow} from './_hud-utils';

export type TelemetryItem = {label: string; value: string};

export type TelemetryReadoutProps = {
	/** "label:value" strings or objects, up to 8; they go round the corners TL, TR, BL, BR, TL ... */
	readouts?: ReadonlyArray<TelemetryItem | string>;
	/** index of the readout drawn in the accent colour (-1 = none) */
	emphasize?: number;
	/** frame at which each readout starts to tick (default: staggered, `firstCue` + 5 frames apart) */
	cues?: ReadonlyArray<number>;
	firstCue?: number;
	/** frames a value takes to resolve */
	tickFrames?: number;
	/** how many scramble steps a value goes through while resolving */
	steps?: number;
	/** seeds the scramble table (same seed = same frames, every render) */
	seed?: number;
	color?: string;
	muted?: string;
	accent?: string;
	/** colour of the corner brackets (default: the muted colour) */
	bracketColor?: string;
	brackets?: boolean;
	/** distance of the brackets from the frame edge, px at 720p */
	inset?: number;
	/** bracket size, px at 720p */
	bracketSize?: number;
	/** readout text size, px at 720p */
	fontSize?: number;
	fontFamily?: string;
	/** flat dark chip behind every line, for busy footage */
	chip?: boolean;
	/** the footage / scene the HUD frames; stays untouched */
	children?: React.ReactNode;
};

const DEFAULT_READOUTS: ReadonlyArray<string> = ['fps:59.94', 'latency:11.8 ms', 'gpu:38%', 'heap:1.2 GB'];

const parse = (r: TelemetryItem | string): TelemetryItem => {
	if (typeof r !== 'string') {
		return r;
	}
	const i = r.indexOf(':');
	return i < 0 ? {label: r.trim(), value: ''} : {label: r.slice(0, i).trim(), value: r.slice(i + 1).trim()};
};

type Row = {t: number; text: string; resolved: number};

const DIGITS = '0123456789';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';

/** One text-at-time table per readout, built from a fixed-seed LCG: a frame never depends on any earlier frame. */
const buildTables = (items: TelemetryItem[], cues: number[], tickFrames: number, steps: number, seed: number): Row[][] => {
	let state = (0x2c9277b5 + Math.imul(seed, 0x9e3779b1)) >>> 0;
	const rnd = () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 4294967296;
	};
	const standIn = (ch: string): string => {
		if (DIGITS.includes(ch)) {
			return DIGITS[Math.floor(rnd() * 10)];
		}
		if (UPPER.includes(ch)) {
			return UPPER[Math.floor(rnd() * 26)];
		}
		if (LOWER.includes(ch)) {
			return LOWER[Math.floor(rnd() * 26)];
		}
		return ch;
	};
	return items.map((it, idx) => {
		const chars = Array.from(it.value);
		const rows: Row[] = [{t: -Infinity, text: '--', resolved: 0}];
		for (let k = 1; k <= steps; k++) {
			const resolved = k === steps ? chars.length : Math.floor((chars.length * k) / steps);
			let text = '';
			for (let c = 0; c < chars.length; c++) {
				text += c < resolved ? chars[c] : standIn(chars[c]);
			}
			rows.push({t: cues[idx] + (tickFrames * k) / steps, text, resolved});
		}
		return rows;
	});
};

const rowAt = (rows: Row[], frame: number): Row => {
	for (let i = rows.length - 1; i >= 0; i--) {
		if (frame >= rows[i].t - 1e-6) {
			return rows[i];
		}
	}
	return rows[0];
};

const BRACKET = 'M 46 3 L 12 3 Q 3 3 3 12 L 3 46';
const MIRROR = ['none', 'scaleX(-1)', 'scaleY(-1)', 'scale(-1, -1)'] as const;

/**
 * Quiet HUD around any footage: four corner brackets draw on, "label: value" lines fade in staggered, and each value
 * ticks through same-type characters that resolve left to right before the hold goes dead still. Starts at frame 0 of its <Sequence>.
 */
export const TelemetryReadout: React.FC<TelemetryReadoutProps> = ({
	readouts = DEFAULT_READOUTS,
	emphasize = 0,
	cues,
	firstCue = 16,
	tickFrames = 15,
	steps = 8,
	seed = 1,
	color = DEMO.paper,
	muted = 'rgba(244,241,234,0.55)',
	accent = DEMO.yellow,
	bracketColor,
	brackets = true,
	inset = 40,
	bracketSize = 60,
	fontSize = 19,
	fontFamily = MONO_FONT,
	chip = false,
	children,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const items = useMemo(() => readouts.slice(0, 8).map(parse), [readouts]);
	const cueList = useMemo(() => items.map((_, i) => cues?.[i] ?? firstCue + i * 5), [items, cues, firstCue]);
	const tables = useMemo(() => buildTables(items, cueList, Math.max(1, tickFrames), Math.max(1, steps), seed), [items, cueList, tickFrames, steps, seed]);

	const stage = progress(frame, 0, 13, Easing.out(Easing.quad));
	const bSize = bracketSize * u;
	const gap = 7 * u;
	const edge = inset * u;
	const bColor = bracketColor ?? muted;

	const lines = items.map((it, i) => {
		const corner = i % 4;
		const fade = progress(frame, 13 + i * 2.1, 10, Easing.out(Easing.quad));
		const row = rowAt(tables[i], frame);
		const em = i === emphasize;
		const rowColor = em ? accent : color;
		const right = corner === 1 || corner === 3;
		const resolved = Array.from(row.text).slice(0, row.resolved).join('');
		const rest = Array.from(row.text).slice(row.resolved).join('');
		const placeholder = row.t === -Infinity;
		return {
			corner,
			node: (
				<div
					key={i}
					style={{
						display: 'flex',
						flexDirection: right ? 'row-reverse' : 'row',
						alignItems: 'baseline',
						gap: 10 * u,
						fontFamily,
						fontSize: fontSize * u,
						lineHeight: 1.35,
						whiteSpace: 'nowrap',
						opacity: fade,
						background: chip ? 'rgba(5,7,12,0.6)' : undefined,
						padding: chip ? `${2 * u}px ${8 * u}px` : undefined,
					}}
				>
					<span style={{color: em ? accent : muted, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase'}}>{it.label}</span>
					<span style={{color: rowColor, fontWeight: em ? 700 : 500, fontVariantNumeric: 'tabular-nums'}}>
						{placeholder ? <span style={{opacity: 0.5}}>--</span> : null}
						{!placeholder ? resolved : null}
						{!placeholder && rest ? <span style={{opacity: 0.45}}>{rest}</span> : null}
					</span>
				</div>
			),
		};
	});

	const cornerStyle = (c: number): React.CSSProperties => {
		const right = c === 1 || c === 3;
		const bottom = c >= 2;
		return {
			position: 'absolute',
			[right ? 'right' : 'left']: edge + bSize + gap,
			[bottom ? 'bottom' : 'top']: edge + 6 * u,
			display: 'flex',
			flexDirection: bottom ? 'column-reverse' : 'column',
			alignItems: right ? 'flex-end' : 'flex-start',
			gap: 5 * u,
		};
	};

	return (
		<AbsoluteFill>
			{children}
			<AbsoluteFill style={{opacity: stage}}>
				{brackets
					? [0, 1, 2, 3].map((c) => {
							const p = progress(frame, 4 + c * 2.4, 15, Easing.inOut(Easing.quad));
							const right = c === 1 || c === 3;
							const bottom = c >= 2;
							return (
								<svg
									key={c}
									width={bSize}
									height={bSize}
									viewBox="0 0 48 48"
									style={{position: 'absolute', [right ? 'right' : 'left']: edge, [bottom ? 'bottom' : 'top']: edge, overflow: 'visible', transform: MIRROR[c]}}
								>
									{p > 0 ? <path d={BRACKET} pathLength={1} fill="none" stroke={bColor} strokeWidth={(3.4 * u * 48) / bSize} strokeLinecap="butt" {...dashWindow(0, clamp01(p))} /> : null}
								</svg>
							);
						})
					: null}
				{[0, 1, 2, 3].map((c) => {
					const mine = lines.filter((l) => l.corner === c);
					return mine.length ? (
						<div key={c} style={cornerStyle(c)}>
							{mine.map((l) => l.node)}
						</div>
					) : null;
				})}
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<Backdrop color="#05070b">
		<TelemetryReadout
			readouts={['unit:RX-07', 'fps:59.94', 'alt:2,840 m', 'latency:11.8 ms', 'sector:K-114', 'gpu:38%', 'vel:412 km/h', 'heap:1.2 GB']}
			emphasize={1}
			fontFamily={MONO_FONT}
		>
			<AbsoluteFill style={{transform: 'scale(0.6)'}}>
				<Plate />
			</AbsoluteFill>
		</TelemetryReadout>
	</Backdrop>
);

export const telemetryReadoutEntry: LibraryEntry = {
	meta: {
		id: 'telemetry-readout',
		title: 'Telemetry readout',
		category: 'shapes',
		looks: 'Four corner brackets draw on, small mono label:value lines fade in around them, and every value scrambles through same-type characters that lock in left to right.',
		use: 'Debug-HUD dressing for tech / mecha / sci-fi shots; stat call-outs that must feel "live" but stay quiet.',
		notes: 'Defaults are small and dim (fontSize 19 = 12 px glyphs at 720p, muted 55 % white): raise them for a trailer. Each value stays scrambled until its cue + tickFrames (15): the 4 default readouts resolve on frames 31 / 36 / 41 / 46, so a 36-frame shot ends with 3 of 4 still scrambled. Pass cues / tickFrames that finish inside the shot.',
		exportName: 'TelemetryReadout',
		durationInFrames: 84,
		source: {
			kind: 'ported',
			name: 'HyperFrames telemetry-hud',
			url: 'https://github.com/heygen-com/hyperframes/blob/main/registry/components/telemetry-hud/telemetry-hud.html',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
