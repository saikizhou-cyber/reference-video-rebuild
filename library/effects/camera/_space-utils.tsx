import React from 'react';
import {random} from 'remotion';
import {fitText} from '@remotion/layout-utils';
import {DEMO, DISPLAY_FONT} from '../../core/scene';

/** Shared helpers and demo scenery for the camera/space group (not part of any effect's public API). */

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** Deterministic 0..1 from any mix of keys (remotion random under the hood). */
export const rnd = (...parts: (string | number)[]): number => random(parts.join('-'));

/**
 * A full-frame SVG that extends `s` times past the frame on every side, drawn in 1280x720 user units
 * with the frame centre at (640, 360): paint layers that will be panned / scaled with it.
 */
export const BleedSvg: React.FC<{s?: number; children: React.ReactNode}> = ({s = 2, children}) => (
	<div
		style={{
			position: 'absolute',
			left: `${-(s - 1) * 50}%`,
			top: `${-(s - 1) * 50}%`,
			width: `${s * 100}%`,
			height: `${s * 100}%`,
		}}
	>
		<svg
			viewBox={`${640 - 640 * s} ${360 - 360 * s} ${1280 * s} ${720 * s}`}
			preserveAspectRatio="xMidYMid slice"
			style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
		>
			{children}
		</svg>
	</div>
);

/** A row of buildings (SVG <g>) with optional lit windows. Everything is seeded: same props, same city. */
export const Skyline: React.FC<{
	seed: number;
	x0: number;
	x1: number;
	base: number;
	bottom: number;
	minH: number;
	maxH: number;
	minW: number;
	maxW: number;
	fill: string;
	lit?: string;
	litChance?: number;
}> = ({seed, x0, x1, base, bottom, minH, maxH, minW, maxW, fill, lit, litChance = 0.2}) => {
	const els: React.ReactNode[] = [];
	let x = x0;
	let i = 0;
	while (x < x1 && i < 120) {
		const w = minW + rnd(seed, 'w', i) * (maxW - minW);
		const h = minH + rnd(seed, 'h', i) * (maxH - minH);
		els.push(<rect key={`b${i}`} x={x} y={base - h} width={w + 1} height={h + bottom - base} fill={fill} />);
		if (rnd(seed, 's', i) > 0.78) {
			els.push(<rect key={`a${i}`} x={x + w / 2 - 2} y={base - h - 46} width={4} height={46} fill={fill} />);
		}
		if (lit) {
			const cols = Math.floor((w - 12) / 13);
			const rows = Math.floor((h - 18) / 17);
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					if (rnd(seed, 'l', i, r, c) < litChance) {
						els.push(<rect key={`w${i}-${r}-${c}`} x={x + 8 + c * 13} y={base - h + 12 + r * 17} width={6} height={9} fill={lit} />);
					}
				}
			}
		}
		x += w;
		i++;
	}
	return <g>{els}</g>;
};

/** Seeded star dots (SVG <g>). */
export const Stars: React.FC<{seed: number; x0: number; x1: number; y0: number; y1: number; count: number; color?: string}> = ({seed, x0, x1, y0, y1, count, color = '#ffffff'}) => (
	<g fill={color}>
		{Array.from({length: count}, (_, i) => (
			<circle key={i} cx={x0 + rnd(seed, 'x', i) * (x1 - x0)} cy={y0 + rnd(seed, 'y', i) * (y1 - y0)} r={0.8 + rnd(seed, 'r', i) * 1.6} opacity={0.35 + rnd(seed, 'o', i) * 0.65} />
		))}
	</g>
);

/**
 * Head-and-shoulders silhouette (SVG <g>), feet-line at y=0 and about 560 units tall, with a rim light on the
 * right and a visor slit. `fill` is the body, `rim` the edge light, `accent` the scarf.
 */
export const Bust: React.FC<{fill?: string; rim?: string; accent?: string; outline?: string | null}> = ({
	fill = '#08070f',
	rim = DEMO.cyan,
	accent = DEMO.red,
	outline = null,
}) => (
	<g strokeLinejoin="round" strokeLinecap="round">
		<g fill={fill} stroke={outline ?? 'none'} strokeWidth={outline ? 12 : 0} paintOrder="stroke">
			<path d="M-330 0 L-312 -120 Q-292 -196 -176 -226 L-44 -262 L44 -262 L176 -226 Q292 -196 312 -120 L330 0 Z" />
			<path d="M-46 -250 L-40 -312 L40 -312 L46 -250 Z" />
			<path d="M-92 -400 C-100 -330 -60 -296 0 -296 C60 -296 100 -330 92 -400 C100 -470 50 -520 0 -520 C-50 -520 -100 -470 -92 -400 Z" />
			<path d="M-110 -408 C-124 -506 -60 -566 12 -562 C92 -558 132 -494 114 -406 C98 -472 42 -500 -8 -496 C-60 -492 -98 -462 -110 -408 Z" />
		</g>
		<path d="M-72 -292 L72 -292 L96 -246 L-96 -246 Z" fill={accent} />
		<path d="M-30 -250 L120 -214 L196 -226 L60 -256 Z" fill={accent} opacity={0.9} />
		<rect x={-56} y={-418} width={112} height={8} fill={rim} />
		<g fill="none" stroke={rim} strokeWidth={6}>
			<path d="M92 -400 C100 -470 50 -520 6 -520" />
			<path d="M114 -406 C132 -494 92 -558 12 -562" />
			<path d="M176 -226 Q292 -196 312 -120 L330 0" />
		</g>
	</g>
);

/** Standing figure (SVG <g>), feet at y=0, about 270 units tall: long coat, scarf streamer, rim light. */
export const Figure: React.FC<{fill?: string; rim?: string; accent?: string}> = ({fill = '#05040b', rim = DEMO.cyan, accent = DEMO.red}) => (
	<g strokeLinejoin="round" strokeLinecap="round">
		<circle cx={0} cy={-246} r={17} fill={fill} />
		<path d="M-23 -226 L23 -226 L34 -150 L40 -66 L24 -66 L23 0 L5 0 L3 -62 L-3 -62 L-5 0 L-23 0 L-24 -66 L-40 -66 L-34 -150 Z" fill={fill} />
		<path d="M-34 -222 L-48 -150 L-44 -110 L-34 -150 Z" fill={fill} />
		<path d="M10 -226 Q66 -240 124 -206 Q84 -216 42 -198 Z" fill={accent} />
		<g fill="none" stroke={rim} strokeWidth={3}>
			<path d="M16 -252 Q23 -242 17 -232" />
			<path d="M23 -226 L34 -150 L40 -66" />
			<path d="M23 -66 L23 0" />
		</g>
	</g>
);

/** A flat title card used by the demos: solid plate, diagonal hatch, a word fitted to the plate, small tag. */
export const TitleCard: React.FC<{
	word: string;
	tag: string;
	bg: string;
	fg: string;
	accent: string;
	w?: number;
	h?: number;
}> = ({word, tag, bg, fg, accent, w = 520, h = 280}) => {
	const fontSize = Math.min(fitText({text: word, withinWidth: w - 84, fontFamily: DISPLAY_FONT}).fontSize, (h - 78) * 1.05);
	return (
		<div style={{position: 'relative', width: w, height: h, background: bg, overflow: 'hidden'}}>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					opacity: 0.16,
					backgroundImage: `repeating-linear-gradient(-30deg, ${fg} 0 5px, transparent 5px 34px)`,
				}}
			/>
			<div style={{position: 'absolute', left: 0, top: 0, width: 18, height: '100%', background: accent}} />
			<div
				style={{
					position: 'absolute',
					left: 44,
					top: 18,
					fontFamily: DISPLAY_FONT,
					fontSize,
					lineHeight: 1,
					color: fg,
					whiteSpace: 'nowrap',
				}}
			>
				{word}
			</div>
			<div
				style={{
					position: 'absolute',
					left: 48,
					bottom: 20,
					padding: '5px 14px',
					background: fg,
					color: bg,
					fontFamily: DISPLAY_FONT,
					fontSize: 24,
					letterSpacing: 5,
				}}
			>
				{tag}
			</div>
			<div style={{position: 'absolute', right: 0, bottom: 0, width: 0, height: 0, borderLeft: '56px solid transparent', borderBottom: `56px solid ${accent}`}} />
		</div>
	);
};
