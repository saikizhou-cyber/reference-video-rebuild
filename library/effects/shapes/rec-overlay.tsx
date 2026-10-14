// Ported from HyperFrames camcorder-hud (https://github.com/heygen-com/hyperframes/blob/main/registry/blocks/camcorder-hud/camcorder-hud.html), Apache-2.0, Copyright (c) 2026 HeyGen, Inc.
// Changes: Remotion component driven by useCurrentFrame (GSAP counter tween replaced by frame maths), props for label / date / mode / start time / battery level, segmented battery,
// optional frame field in the counter, viewfinder corner marks and crosshair, power-on flicker, vmin sizes kept (via the composition's smaller side). Modified.
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {Plate} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {MONO_FONT, flickerAt, withAlpha} from './_hud-utils';

export type RecOverlayProps = {
	label?: string;
	/** first line of the stamp bottom left */
	date?: string;
	/** second line of the stamp bottom left */
	time?: string;
	/** small text above the counter, bottom right */
	mode?: string;
	/** where the counter starts, in seconds */
	startSeconds?: number;
	/** show a :FF frame field after the seconds */
	showFrames?: boolean;
	/** battery level 0..1 (4 segments; the last one blinks when almost empty) */
	battery?: number;
	/** seconds per blink half-cycle of the REC dot */
	blinkSeconds?: number;
	color?: string;
	accent?: string;
	/** gap to the frame edge, in % of the smaller side */
	inset?: number;
	/** text size in % of the smaller side */
	fontSize?: number;
	/** viewfinder corner marks */
	marks?: boolean;
	/** small centre crosshair */
	crosshair?: boolean;
	/** frames of power-on flicker at the start (0 = none) */
	introFrames?: number;
	fontFamily?: string;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** HH:MM:SS from a whole number of seconds */
const clock = (total: number): string => {
	const s = Math.max(0, Math.floor(total));
	return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
};

/**
 * Camcorder viewfinder: blinking REC dot, battery, date stamp, running HH:MM:SS counter and corner marks, in chunky mono
 * with a dark outline so it reads on any footage. Starts counting at frame 0 of its <Sequence>.
 */
export const RecOverlay: React.FC<RecOverlayProps> = ({
	label = 'REC',
	date = 'MAR 14 2031',
	time = '11:42 PM',
	mode = 'SP · 16:9',
	startSeconds = 0,
	showFrames = false,
	battery = 0.75,
	blinkSeconds = 0.55,
	color = '#ffffff',
	accent = '#f12c2c',
	inset = 5,
	fontSize = 3.7,
	marks = true,
	crosshair = false,
	introFrames = 6,
	fontFamily = MONO_FONT,
}) => {
	const frame = useCurrentFrame();
	const {width, height, fps} = useVideoConfig();
	const v = Math.min(width, height) / 100;
	const sec = frame / fps;
	const on = Math.floor(sec / blinkSeconds) % 2 === 0;
	const counter = clock(startSeconds + sec) + (showFrames ? `:${pad2(frame % fps)}` : '');
	const power = introFrames > 0 && frame < introFrames ? flickerAt(frame / introFrames) : 1;
	const segs = Math.max(1, Math.ceil(Math.min(1, Math.max(0, battery)) * 4));
	const lowBlink = segs === 1 && !on;
	const edge = inset * v;
	const stroke = 0.12 * v;

	const text: React.CSSProperties = {
		position: 'absolute',
		color,
		fontFamily,
		fontSize: fontSize * v,
		fontWeight: 700,
		lineHeight: 1.25,
		WebkitTextStroke: `${stroke}px rgba(0,0,0,0.92)`,
		paintOrder: 'stroke fill',
		textShadow: `0 ${0.2 * v}px ${0.6 * v}px rgba(0,0,0,0.9)`,
		whiteSpace: 'nowrap',
	};
	const markEdge = Math.max(1.6 * v, edge * 0.42);
	const markLen = 4.2 * v;
	const markW = Math.max(1.5, 0.35 * v);
	const markShadow = `drop-shadow(0 0 ${0.15 * v}px rgba(0,0,0,0.9))`;

	return (
		<AbsoluteFill style={{opacity: power, pointerEvents: 'none'}}>
			{marks ? (
				<svg width={width} height={height} style={{position: 'absolute', inset: 0, filter: markShadow}}>
					{[
						[markEdge, markEdge, 1, 1],
						[width - markEdge, markEdge, -1, 1],
						[markEdge, height - markEdge, 1, -1],
						[width - markEdge, height - markEdge, -1, -1],
					].map(([x, y, sx, sy], i) => (
						<path key={i} d={`M${x + sx * markLen} ${y} L${x} ${y} L${x} ${y + sy * markLen}`} fill="none" stroke={color} strokeWidth={markW} />
					))}
					{crosshair ? <path d={`M${width / 2 - 2.2 * v} ${height / 2} H${width / 2 + 2.2 * v} M${width / 2} ${height / 2 - 2.2 * v} V${height / 2 + 2.2 * v}`} stroke={color} strokeWidth={markW} /> : null}
				</svg>
			) : null}
			<div style={{...text, top: edge, left: edge, display: 'flex', alignItems: 'center', gap: 1.8 * v}}>
				<span
					style={{
						width: 2.2 * v,
						height: 2.2 * v,
						borderRadius: '50%',
						background: accent,
						opacity: on ? 1 : 0.25,
						boxShadow: `0 0 ${0.9 * v}px ${withAlpha(accent, 0.55)}`,
					}}
				/>
				<span>{label}</span>
			</div>
			<div style={{position: 'absolute', top: edge, right: edge, width: 7 * v, height: 3.5 * v, border: `${0.35 * v}px solid ${color}`, filter: markShadow}}>
				{Array.from({length: 4}, (_, i) => (
					<div
						key={i}
						style={{
							position: 'absolute',
							top: 0.5 * v,
							bottom: 0.5 * v,
							left: 0.5 * v + i * 1.5 * v,
							width: 1.1 * v,
							background: color,
							opacity: i < segs ? (i === 0 && lowBlink ? 0 : 1) : 0.16,
						}}
					/>
				))}
				<div style={{position: 'absolute', top: 0.7 * v, right: -1.05 * v, width: 0.7 * v, height: 1.4 * v, background: color}} />
			</div>
			<div style={{...text, bottom: edge, left: edge}}>
				{date}
				<br />
				{time}
			</div>
			<div style={{...text, bottom: edge, right: edge, textAlign: 'right'}}>
				<span style={{display: 'block', marginBottom: 0.7 * v, fontSize: 2.6 * v}}>{mode}</span>
				<span style={{fontVariantNumeric: 'tabular-nums'}}>{counter}</span>
			</div>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<>
		<div style={{position: 'absolute', inset: 0, filter: 'saturate(0.8) contrast(1.06)'}}>
			<Plate />
		</div>
		<AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(0,0,0,0.5) 100%)'}} />
		<RecOverlay startSeconds={754} />
	</>
);

export const recOverlayEntry: LibraryEntry = {
	meta: {
		id: 'rec-overlay',
		title: 'REC overlay',
		category: 'shapes',
		looks: 'White mono camcorder text with a dark outline: red REC dot blinking about every half second, battery, date stamp, running HH:MM:SS counter and viewfinder corner marks.',
		use: 'Found-footage, security-cam and "recorded" beats; framing a flashback or a recon clip.',
		exportName: 'RecOverlay',
		durationInFrames: 90,
		source: {
			kind: 'ported',
			name: 'HyperFrames camcorder-hud',
			url: 'https://github.com/heygen-com/hyperframes/blob/main/registry/blocks/camcorder-hud/camcorder-hud.html',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
