// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/beat-cut-moves/PaparazziFlash.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: children instead of a fixed dashboard, flash frames / crops / settle / shutter shake as props, crop-style framing, remotion random() for the shake, 720p-unit scaling. Modified.
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {progress} from '../../core/easing';
import type {LibraryEntry} from '../../core/types';
import {DemoWall, Framed, WALL_FOCUS, shakeOffset, type Framing} from './_edits-utils';

export type FlashFreezeProps = {
	/** the material that every flash cuts around. Rendered once, cropped differently after each flash */
	children?: React.ReactNode;
	/** frames at which the camera flashes; the picture hard-cuts to the next crop on each */
	flashes?: number[];
	/** crop landed on by flash 1, 2, 3... Default: wide, card 2.3x, digit 4x (aimed with `focus` points of your material) */
	views?: Framing[];
	/** the live slow push before the first flash, as zoom from -> to */
	leadScale?: [number, number];
	/** where that lead push is aimed (shares of the frame) */
	leadFocus?: {x: number; y: number};
	/** frames each cut takes to settle (1.03 -> 1 plus a small drop) like shutter afterglow */
	settleFrames?: number;
	settleZoom?: number;
	/** px at 720p the picture sits too high at the cut and drops from */
	settleDrop?: number;
	/** frames the white decays over */
	decay?: number;
	/** opacity of the white on the flash frame */
	peak?: number;
	flashColor?: string;
	/** px at 720p of shutter shake while the white is up */
	shutterShake?: number;
	seed?: number;
};

const DEFAULT_VIEWS: Framing[] = [{scale: 1}, {scale: 2.3, ...WALL_FOCUS.card}, {scale: 4, ...WALL_FOCUS.digits}];

/**
 * Paparazzi: a live, slowly pushing shot, then white camera flashes that each hard-cut to a tighter crop of the
 * same material. Every cut lands with a tiny drop-and-settle and a few frames of shutter shake; the last crop holds.
 */
export const FlashFreeze: React.FC<FlashFreezeProps> = ({
	children,
	flashes = [30, 52, 70],
	views = DEFAULT_VIEWS,
	leadScale = [1.4, 1.48],
	leadFocus = {x: 0.3, y: 0.66},
	settleFrames = 6,
	settleZoom = 0.03,
	settleDrop = 10,
	decay = 4,
	peak = 0.95,
	flashColor = '#ffffff',
	shutterShake = 2.5,
	seed = 3,
}) => {
	const frame = useCurrentFrame();
	let seg = -1;
	for (let i = 0; i < flashes.length; i++) {
		if (frame >= flashes[i]) {
			seg = i;
		}
	}

	let framing: Framing;
	let zoom = 1;
	let drop = 0;
	if (seg < 0) {
		const first = flashes[0] ?? 1;
		framing = {
			scale: interpolate(frame, [0, Math.max(1, first)], leadScale, {
				easing: Easing.inOut(Easing.quad),
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			}),
			...leadFocus,
		};
	} else {
		framing = views[Math.min(seg, views.length - 1)] ?? {scale: 1};
		const s = 1 - progress(frame, flashes[seg], settleFrames, Easing.out(Easing.cubic));
		zoom = 1 + settleZoom * s;
		drop = -settleDrop * s;
	}

	let white = 0;
	let shaking = false;
	for (const f of flashes) {
		if (frame >= f && frame < f + decay) {
			shaking = true;
			white = Math.max(white, peak * (1 - (frame - f) / decay) ** 2);
		}
	}
	const sh = shaking ? shakeOffset(frame, shutterShake, seed) : {x: 0, y: 0};
	return (
		<AbsoluteFill style={{background: '#000', overflow: 'hidden'}}>
			<Framed framing={framing} extra={zoom} dx={sh.x} dy={drop + sh.y}>
				{children}
			</Framed>
			{white > 0 ? <AbsoluteFill style={{background: flashColor, opacity: white}} /> : null}
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<FlashFreeze flashes={[17, 37, 55]}>
		<DemoWall />
	</FlashFreeze>
);

export const flashFreezeEntry: LibraryEntry = {
	meta: {
		id: 'flash-freeze',
		title: 'Flash freeze',
		category: 'timing',
		looks: 'A slowly pushing shot, then three white camera flashes, each hard-cutting to a tighter crop (wide, card 2.3x, digit 4x) that drops and settles like shutter afterglow.',
		use: 'Spotlight moment: a score, a rank, a pull result or a character reveal presented as press photos.',
		exportName: 'FlashFreeze',
		durationInFrames: 75,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (Paparazzi Flash Freeze)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/beat-cut-moves/PaparazziFlash.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
