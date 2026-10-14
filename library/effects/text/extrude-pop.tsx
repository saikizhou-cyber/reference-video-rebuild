import React from 'react';
import {spring, useCurrentFrame, useVideoConfig, type SpringConfig} from 'remotion';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {fitSize, measure, mixHex} from './_display-utils';

/** ~0.47 damping ratio: clear overshoot, settles in about a second */
const STAMP: Partial<SpringConfig> = {stiffness: 220, damping: 14, mass: 1};

export type ExtrudePopProps = {
	text: string;
	/** px at 720p */
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number | string;
	/** colour of the lifted face */
	face?: string;
	/** body colour next to the face */
	bodyNear?: string;
	/** body colour at the foot of the extrusion */
	bodyDeep?: string;
	/** colour of the thin edge line between face and body (null = none) */
	edge?: string | null;
	/** hard cast shadow beyond the body, a solid colour (null = none) */
	shadow?: string | null;
	/** extrusion length at rest, px at 720p */
	depth?: number;
	/** direction the body runs from the face, degrees clockwise from +x on screen (125 = down and to the left) */
	angle?: number;
	/** frames (relative to the Sequence) at which the word is stamped flat and pops again; flat on the page before the first */
	pops?: number[];
	/** spring of the pop; the default overshoots like a stamp */
	springConfig?: Partial<SpringConfig>;
	/** how much the extrusion keeps breathing after it lands, as a share of depth (0 = rests still) */
	idle?: number;
	/** the word is shrunk to fit this share of the frame width (0 = never shrink) */
	fitWidth?: number;
	style?: React.CSSProperties;
};

/**
 * A flat heavy word pops off the page on a solid, stepped extrusion: the foot of the body stays on the
 * plane while the face rises along a fixed screen direction with a stamp overshoot, every step a hard-edged
 * copy (no blur, no 3D transform, identical at any size). Starts at frame 0 of its <Sequence>.
 */
export const ExtrudePop: React.FC<ExtrudePopProps> = ({
	text,
	fontSize = 250,
	fontFamily = DISPLAY_FONT,
	fontWeight = 400,
	face = DEMO.yellow,
	bodyNear = DEMO.red,
	bodyDeep = '#4a0824',
	edge = DEMO.ink,
	shadow = null,
	depth = 44,
	angle = 125,
	pops = [4],
	springConfig = STAMP,
	idle = 0.04,
	fitWidth = 0.78,
	style,
}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const u = useUnit();
	const fs = fitSize(text, fontFamily, fontSize * u, fitWidth * width, fontWeight, -0.01 * fontSize * u);
	const box = measure(text, fontFamily, fs, fontWeight, -0.01 * fs);
	const capMid = box.baseline - box.capHeight / 2;

	const lastPop = pops.reduce((best, p) => (p <= frame && p > best ? p : best), -Infinity);
	const local = frame - lastPop;
	const pop = local < 0 || !Number.isFinite(local) ? 0 : spring({frame: local, fps, config: springConfig});
	const breathe = local > 20 ? idle * Math.sin((local - 20) * 0.16) * Math.min(1, (local - 20) / 20) : 0;
	const e = pop * (1 + breathe);
	const rad = (angle * Math.PI) / 180;
	const dir = {x: Math.cos(rad), y: Math.sin(rad)};
	const len = depth * u * e;
	// the foot of the body stays on the page; the word is centred at rest (face and foot balanced about the middle)
	const foot = {x: width / 2 + dir.x * depth * u * 0.5, y: height / 2 + dir.y * depth * u * 0.5};
	const faceAt = {x: foot.x - dir.x * len, y: foot.y - dir.y * len};

	const n = Math.min(90, Math.max(6, Math.ceil(Math.abs(len) / 1.4)));
	const edgeW = edge ? 2.2 * u : 0;
	const shadows: string[] = [];
	for (let j = 1; j <= n; j++) {
		const d = (len * j) / n;
		const c = edge && Math.abs(d) <= edgeW ? edge : mixHex(bodyNear, bodyDeep, j / n);
		shadows.push(`${(dir.x * d).toFixed(2)}px ${(dir.y * d).toFixed(2)}px 0 ${c}`);
	}
	if (shadow && len > 0.5) {
		const m = Math.min(60, Math.max(4, Math.ceil(len / 1.6)));
		for (let j = 1; j <= m; j++) {
			const d = len * (1 + (0.85 * j) / m);
			shadows.push(`${(dir.x * d).toFixed(2)}px ${(dir.y * d).toFixed(2)}px 0 ${shadow}`);
		}
	}

	return (
		<div
			style={{
				position: 'absolute',
				left: faceAt.x - box.width / 2,
				top: faceAt.y - capMid,
				width: box.width,
				height: fs,
				lineHeight: 1,
				whiteSpace: 'pre',
				textAlign: 'center',
				fontFamily,
				fontWeight,
				fontSize: fs,
				letterSpacing: -0.01 * fs,
				color: face,
				textShadow: shadows.join(', '),
				...style,
			}}
		>
			{text}
		</div>
	);
};

const Demo: React.FC = () => (
	<Backdrop color={DEMO.blue}>
		<ExtrudePop text="OVERDRIVE" shadow="#0a2fb3" pops={[4, 40]} />
	</Backdrop>
);

export const extrudePopEntry: LibraryEntry = {
	meta: {
		id: 'extrude-pop',
		title: 'Extrude pop',
		category: 'text',
		looks: 'A flat heavy word lifts off the page on a solid stepped extrusion with a stamp overshoot, then keeps breathing slightly.',
		use: 'Title and call-out words that should feel like a heavy block: stamps, logo-style lockups, big stats.',
		exportName: 'ExtrudePop',
		durationInFrames: 61,
		source: {kind: 'original'},
	},
	Demo,
};
