import React from 'react';
import {AbsoluteFill, random, useVideoConfig} from 'remotion';
import {fitText} from '@remotion/layout-utils';
import {BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';

/**
 * Helpers shared by the timing/edits effects: a crop-style framing, a seeded shake and a small demo wall
 * (a roster of cards with one hero card) that the edit-recipe demos cut around.
 */

/** A crop of the shot: zoom `scale` about the point (x, y), given as shares of the frame. */
export type Framing = {
	/** zoom factor, 1 = the whole frame */
	scale: number;
	/** focus point (0..1 of the frame width) that ends up in the middle of the screen */
	x?: number;
	/** focus point (0..1 of the frame height) */
	y?: number;
	/** keep the crop window inside the frame so a zoom never shows the void beyond the content (default true) */
	keepInside?: boolean;
};

/** CSS transform (origin 50% 50%) that crops `f` out of a w x h frame; `extra` multiplies the zoom (drifts, pushes). */
export const framingTransform = (w: number, h: number, f: Framing, extra = 1): string => {
	const s = Math.max(1, f.scale * extra);
	let cx = f.x ?? 0.5;
	let cy = f.y ?? 0.5;
	if (f.keepInside !== false) {
		const lim = 0.5 / s;
		cx = Math.min(1 - lim, Math.max(lim, cx));
		cy = Math.min(1 - lim, Math.max(lim, cy));
	}
	return `translate(${-(cx - 0.5) * s * w}px, ${-(cy - 0.5) * s * h}px) scale(${s})`;
};

/** Renders its children cropped to a Framing. Anything inside is a hard-cut "camera position". */
export const Framed: React.FC<{
	framing: Framing;
	/** multiplies the zoom, e.g. 1 -> 1.04 drift inside a shot */
	extra?: number;
	/** extra offset in px at 720p (shake, settle drop) */
	dx?: number;
	dy?: number;
	children?: React.ReactNode;
}> = ({framing, extra = 1, dx = 0, dy = 0, children}) => {
	const {width, height} = useVideoConfig();
	const u = useUnit();
	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			<AbsoluteFill
				style={{
					transformOrigin: '50% 50%',
					transform: `translate(${dx * u}px, ${dy * u}px) ${framingTransform(width, height, framing, extra)}`,
				}}
			>
				{children}
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

/** Deterministic shake offset in px (already multiplied by `amp`): a pure function of the frame number. */
export const shakeOffset = (frame: number, amp: number, seed: number | string = 1): {x: number; y: number} => ({
	x: amp * (random(`${seed}-sx-${frame}`) * 2 - 1),
	y: amp * (random(`${seed}-sy-${frame}`) * 2 - 1),
});

/** Largest font size <= `size` for which `text` fits `maxWidth` px: keeps big words inside the frame whatever display font the machine has. */
export const fitFont = (text: string, maxWidth: number, size: number, fontFamily: string, letterSpacing?: string): number => {
	try {
		const {fontSize} = fitText({text, withinWidth: maxWidth, fontFamily, letterSpacing, validateFontIsLoaded: false});
		return Math.min(size, fontSize);
	} catch {
		return size;
	}
};

/** Where the hero card and its digits sit on <DemoWall/> (shares of the frame), for punch-ins in the demos. */
export const WALL_FOCUS = {
	card: {x: 0.5, y: 0.34},
	digits: {x: 0.5, y: 0.37},
} as const;

const WALL_VALUES = ['128', '9 421', '77', '512', '340', '64'];
const WALL_TAGS = ['UNIT 01', 'TOP SCORE', 'UNIT 03', 'UNIT 04', 'UNIT 05', 'UNIT 06'];
const WALL_HUES = [DEMO.blue, DEMO.ink, DEMO.red, DEMO.cyan, DEMO.blue, DEMO.red];

/**
 * Demo material for the edit recipes: a 3 x 2 wall of cards on ink with one yellow hero card
 * (top middle, big digits), so wide / card / digit crops all have something to land on.
 */
export const DemoWall: React.FC<{fontFamily?: string}> = ({fontFamily = DISPLAY_FONT}) => {
	const u = useUnit();
	const {width, height} = useVideoConfig();
	const m = 48 * u;
	const gap = 24 * u;
	const top = 110 * u;
	const cw = (width - 2 * m - 2 * gap) / 3;
	const ch = (height - top - m - gap) / 2;
	const digitSize = (text: string, hero: boolean) => fitFont(text, cw * 0.78, (hero ? 118 : 74) * u, fontFamily);
	return (
		<AbsoluteFill style={{background: DEMO.ink, overflow: 'hidden'}}>
			<AbsoluteFill
				style={{
					opacity: 0.09,
					backgroundImage: `repeating-linear-gradient(-30deg, #ffffff 0 ${4 * u}px, transparent ${4 * u}px ${40 * u}px)`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: m,
					top: 38 * u,
					fontFamily: BODY_FONT,
					fontWeight: 800,
					fontSize: 26 * u,
					letterSpacing: 8 * u,
					color: DEMO.paper,
				}}
			>
				ROSTER / WEEK 07
			</div>
			<div style={{position: 'absolute', right: m, top: 36 * u, display: 'flex', gap: 10 * u}}>
				{[DEMO.red, DEMO.yellow, DEMO.cyan].map((c) => (
					<div key={c} style={{width: 34 * u, height: 34 * u, background: c}} />
				))}
			</div>
			{WALL_VALUES.map((value, i) => {
				const hero = i === 1;
				const col = i % 3;
				const row = Math.floor(i / 3);
				const x = m + col * (cw + gap);
				const y = top + row * (ch + gap);
				const fg = hero ? DEMO.ink : DEMO.paper;
				return (
					<div
						key={value}
						style={{
							position: 'absolute',
							left: x,
							top: y,
							width: cw,
							height: ch,
							background: hero ? DEMO.yellow : DEMO.grey,
							overflow: 'hidden',
						}}
					>
						<div style={{position: 'absolute', left: 0, top: 0, right: 0, height: 10 * u, background: hero ? DEMO.ink : WALL_HUES[i]}} />
						<div
							style={{
								position: 'absolute',
								left: 22 * u,
								top: 28 * u,
								fontFamily: BODY_FONT,
								fontWeight: 800,
								fontSize: 17 * u,
								letterSpacing: 5 * u,
								color: fg,
								opacity: 0.8,
							}}
						>
							{WALL_TAGS[i]}
						</div>
						<div
							style={{
								position: 'absolute',
								left: 0,
								right: 0,
								top: hero ? 78 * u : 72 * u,
								textAlign: 'center',
								fontFamily,
								fontSize: digitSize(value, hero),
								lineHeight: 1,
								whiteSpace: 'nowrap',
								color: fg,
							}}
						>
							{value}
						</div>
						<div style={{position: 'absolute', left: 22 * u, right: 22 * u, bottom: 20 * u, height: 46 * u, display: 'flex', alignItems: 'flex-end', gap: 8 * u}}>
							{[0.35, 0.6, 0.45, 0.85, 0.55, 1, 0.7, 0.4].map((v, k) => (
								<div
									key={k}
									style={{flex: 1, height: `${(0.3 + 0.7 * ((v * (k + i + 2)) % 1)) * 100}%`, background: hero ? DEMO.ink : DEMO.paper, opacity: hero ? 1 : 0.55}}
								/>
							))}
						</div>
					</div>
				);
			})}
		</AbsoluteFill>
	);
};
