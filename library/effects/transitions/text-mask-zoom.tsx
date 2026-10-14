// Ported from GTKottman/remotion-transitions (https://github.com/GTKottman/remotion-transitions), MIT, Copyright (c) 2026 GTKottman and contributors.
// Changes: ink-box measurement of the word and of the chosen letter (canvas metrics) so the zoom really heads into that letter and the word is centred optically;
// hard-cut slam-in, creep, exponential zoom with the focus point travelling to the frame centre, zoom depth measured from the glyph so the frame ends up exactly
// inside the letter (no cross-fade, no stray backdrop patch); two blend layers instead of a mask layer and will-change layers so every render rasterises identically;
// outline in screen-constant width; generic font props.
// The idea of scaling the mask while the picture stays put follows the "Text-as-Mask" demo of Vincentwei1021/video-shotcraft (Apache-2.0); no code taken from it.
import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, useVideoConfig} from 'remotion';
import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import {CURVES} from '../../core/easing';
import {DEMO, DISPLAY_FONT} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {TransitionDemo, demoFrames, mix, seg} from './_dom-utils';

export type TextMaskZoomProps = {
	/** the word the new scene shows through */
	text?: string;
	/** index of the letter the camera flies through (default: the middle one); pick a letter with a solid centre: N, E, X, T, S... */
	zoomLetter?: number;
	/** opaque colour around the word before it fills the frame */
	background?: string;
	/** outline around the letters, null = none */
	outline?: string | null;
	/** outline width, px at 720p */
	outlineWidth?: number;
	fontFamily?: string;
	fontWeight?: number;
	/** letter spacing in em */
	tracking?: number;
	/** font size in px at 720p; omitted = the word fits 86 % of the frame width */
	fontSize?: number;
	/** nudge of the zoom target from the letter centre, px at 720p */
	focus?: readonly [number, number];
	/** magnification at the end of the zoom; omitted = measured: the smallest scale at which the frame lies entirely inside the letter */
	maxScale?: number;
};

type WordLayout = {size: number; x0: number; yBase: number; fx: number; fy: number; solid: number};

const REF = 200;
const SOLID_CAP = 3000;
/** the slow push-in while the word holds */
const CREEP = 0.08;

/**
 * Smallest magnification at which a W x H frame centred on the letter's focus point lies entirely inside the glyph
 * (rasterised once at REF px and tested along the frame outline). Infinity when the focus point is not inside ink.
 */
const solidScale = (ch: string, family: string, weight: number, k: number, W: number, H: number, offX: number, offY: number): number => {
	const probe = document.createElement('canvas');
	const g = probe.getContext('2d', {willReadFrequently: true});
	if (!g) {
		return Infinity;
	}
	g.font = `${weight} ${REF}px ${family}`;
	const m = g.measureText(ch);
	const pad = 4;
	const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
	const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
	const cw = Math.max(1, Math.ceil(inkW) + 2 * pad);
	const ch2 = Math.max(1, Math.ceil(inkH) + 2 * pad);
	probe.width = cw;
	probe.height = ch2;
	g.font = `${weight} ${REF}px ${family}`;
	g.fillStyle = '#000';
	g.fillText(ch, pad + m.actualBoundingBoxLeft, pad + m.actualBoundingBoxAscent);
	const px = g.getImageData(0, 0, cw, ch2).data;
	const solid = (x: number, y: number): boolean => {
		const ix = Math.floor(x);
		const iy = Math.floor(y);
		return ix >= 0 && iy >= 0 && ix < cw && iy < ch2 && px[(iy * cw + ix) * 4 + 3] >= 250;
	};
	const cx = pad + inkW / 2 + offX / k;
	const cy = pad + inkH / 2 + offY / k;
	const fits = (S: number): boolean => {
		// 2 px of slack at REF size keeps the anti-aliased glyph edge out of the frame
		const hx = W / (2 * S * k) + 2;
		const hy = H / (2 * S * k) + 2;
		for (let x = -hx; x <= hx + 0.5; x += 1) {
			if (!solid(cx + Math.min(x, hx), cy - hy) || !solid(cx + Math.min(x, hx), cy + hy)) {
				return false;
			}
		}
		for (let y = -hy; y <= hy + 0.5; y += 1) {
			if (!solid(cx - hx, cy + Math.min(y, hy)) || !solid(cx + hx, cy + Math.min(y, hy))) {
				return false;
			}
		}
		return true;
	};
	if (!fits(SOLID_CAP)) {
		return Infinity;
	}
	let lo = 1;
	let hi = SOLID_CAP;
	for (let i = 0; i < 28; i++) {
		const mid = Math.sqrt(lo * hi);
		if (fits(mid)) {
			hi = mid;
		} else {
			lo = mid;
		}
	}
	return hi;
};

/** Ink-box layout of the word and of the zoom letter, measured with canvas text metrics at a reference size and scaled linearly. */
const useWordLayout = (
	text: string,
	letter: number,
	family: string,
	weight: number,
	tracking: number,
	fixedSize: number | undefined,
	focus: readonly [number, number],
	W: number,
	H: number,
	u: number,
): WordLayout =>
	useMemo(() => {
		const ctx = document.createElement('canvas').getContext('2d');
		if (!ctx) {
			return {size: H * 0.4, x0: W * 0.1, yBase: H * 0.6, fx: W / 2, fy: H / 2, solid: Infinity};
		}
		ctx.font = `${weight} ${REF}px ${family}`;
		(ctx as unknown as {letterSpacing: string}).letterSpacing = `${tracking * REF}px`;
		const whole = ctx.measureText(text);
		const inkW = Math.max(1, whole.actualBoundingBoxLeft + whole.actualBoundingBoxRight);
		const inkH = Math.max(1, whole.actualBoundingBoxAscent + whole.actualBoundingBoxDescent);
		const size = fixedSize ?? Math.min((W * 0.86) / inkW, (H * 0.5) / inkH) * REF;
		const k = size / REF;
		const x0 = W / 2 - ((whole.actualBoundingBoxRight - whole.actualBoundingBoxLeft) / 2) * k;
		const yBase = H / 2 + ((whole.actualBoundingBoxAscent - whole.actualBoundingBoxDescent) / 2) * k;
		const i = Math.min(Math.max(0, Math.round(letter)), text.length - 1);
		const prefix = ctx.measureText(text.slice(0, i)).width;
		const one = ctx.measureText(text[i] ?? ' ');
		const fx = x0 + (prefix + (one.actualBoundingBoxRight - one.actualBoundingBoxLeft) / 2) * k;
		const fy = yBase + ((one.actualBoundingBoxDescent - one.actualBoundingBoxAscent) / 2) * k;
		const solid = solidScale(text[i] ?? ' ', family, weight, k, W, H, focus[0] * u, focus[1] * u);
		return {size, x0, yBase, fx, fy, solid};
	}, [text, letter, family, weight, tracking, fixedSize, focus[0], focus[1], W, H, u]);

const TextMaskZoomPresentation: React.FC<TransitionPresentationComponentProps<TextMaskZoomProps>> = ({
	children,
	presentationDirection,
	presentationProgress,
	passedProps,
}) => {
	const {width: W, height: H} = useVideoConfig();
	const u = Math.min(W, H) / 720;
	const {
		text = 'NEXT',
		zoomLetter = Math.floor((passedProps.text ?? 'NEXT').length / 2),
		background = DEMO.ink,
		outline = DEMO.paper,
		outlineWidth = 3,
		fontFamily = DISPLAY_FONT,
		fontWeight = 400,
		tracking = 0.03,
		fontSize,
		focus = [0, 0],
		maxScale,
	} = passedProps;
	const L = useWordLayout(text, zoomLetter, fontFamily, fontWeight, tracking, fontSize === undefined ? undefined : fontSize * u, focus, W, H, u);

	if (presentationDirection === 'exiting') {
		return <AbsoluteFill>{children}</AbsoluteFill>;
	}
	// finish a frame or two early so the last frames are exactly the new scene
	const p = Math.min(1, presentationProgress / 0.96);
	// the zoom ends where the frame lies inside the letter (+5 %), or at the explicit maxScale
	const inside = L.solid * 1.05;
	const endScale = maxScale ?? (Number.isFinite(inside) ? inside : 60);
	const slam = CURVES.snap(seg(p, 0, 0.12));
	const creep = 1 + CREEP * seg(p, 0.12, 0.36);
	const zoom = Math.pow(endScale / (1 + CREEP), Easing.in(Easing.cubic)(seg(p, 0.36, 1)));
	const S = mix(1.4, 1, slam) * creep * zoom;
	// the frame is inside the letter: the letter IS the screen, so the new scene simply takes over (nothing visibly changes)
	if (p >= 1 || S >= inside) {
		return <AbsoluteFill>{children}</AbsoluteFill>;
	}
	// the zoom target slides to the centre of the frame while the scale grows, so the camera "falls" into the letter
	const g = CURVES.inOutCubic(seg(p, 0.36, 0.92));
	const fx = L.fx + focus[0] * u;
	const fy = L.fy + focus[1] * u;
	const px = mix(fx, W / 2, g);
	const py = mix(fy, H / 2, g);
	const transform = `translate(${px} ${py}) scale(${S}) translate(${-fx} ${-fy})`;
	const word = (props: React.SVGProps<SVGTextElement>) => (
		<text x={L.x0} y={L.yBase} fontSize={L.size} fontFamily={fontFamily} fontWeight={fontWeight} letterSpacing={tracking * L.size} {...props}>
			{text}
		</text>
	);
	const layer = (blend: React.CSSProperties['mixBlendMode'], base: string, ink: string): React.ReactElement => (
		<svg width={W} height={H} style={{position: 'absolute', inset: 0, mixBlendMode: blend, willChange: 'transform'}}>
			<rect width={W} height={H} fill={base} />
			<g transform={transform}>{word({fill: ink})}</g>
		</svg>
	);
	// no mask layer: the letters are cut with two blend layers on top of the new scene, multiply with white-on-black keeps the scene only inside
	// the letters, plus-lighter adds the backdrop colour everywhere else. Every layer carries will-change: transform: on its own compositor layer
	// the text edges are rasterised the same way in every render (otherwise LCD-AA glyph edges flip by +-1 level between two renders of one frame).
	return (
		<AbsoluteFill style={{isolation: 'isolate'}}>
			<AbsoluteFill style={{willChange: 'transform'}}>{children}</AbsoluteFill>
			{layer('multiply', '#000', '#fff')}
			{layer('plus-lighter', background, '#000')}
			{outline ? (
				<svg width={W} height={H} style={{position: 'absolute', inset: 0, willChange: 'transform'}}>
					<g transform={transform}>{word({fill: 'none', stroke: outline, strokeWidth: (outlineWidth * u) / S, strokeLinejoin: 'round'})}</g>
				</svg>
			) : null}
		</AbsoluteFill>
	);
};

/**
 * The new scene shows only through the letters of a heavy word on a solid backdrop (a hard cut, the word slams in), then the camera falls through one letter
 * until the frame lies entirely inside it and the new scene takes over. The word is centred and fitted automatically and the zoom depth is measured from the
 * glyph; pick `zoomLetter` with a solid centre. Use with linearTiming, 40-60 frames. Load a web font before the transition starts, the word is measured once.
 */
export const textMaskZoom = (props: TextMaskZoomProps = {}): TransitionPresentation<TextMaskZoomProps> => ({
	component: TextMaskZoomPresentation,
	props,
});

const T = 48;

const Demo: React.FC = () => <TransitionDemo presentation={textMaskZoom({background: DEMO.paper, outline: DEMO.ink, outlineWidth: 4})} transition={T} lead={6} />;

export const textMaskZoomEntry: LibraryEntry = {
	meta: {
		id: 'text-mask-zoom',
		title: 'Text mask zoom',
		category: 'transitions',
		looks: 'NEXT slams onto a paper backdrop with the next scene visible only inside its letters; the camera then falls through the X until the new scene fills the frame.',
		use: 'Chapter titles, mode reveals and logo-to-footage cuts: the word is the doorway into the next scene.',
		exportName: 'textMaskZoom',
		durationInFrames: demoFrames(T, 1, 6),
		source: {kind: 'ported', name: 'GTKottman/remotion-transitions (text-mask)', url: 'https://github.com/GTKottman/remotion-transitions/blob/main/transitions/03-wipe/shape-mask/text-mask/index.tsx', license: 'MIT'},
	},
	Demo,
};
