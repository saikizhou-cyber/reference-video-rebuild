// Ported from Vincentwei1021/video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft), Apache-2.0, Copyright 2026 Wei Yihao. Modified.
// Changes: the fixed 1080p "ComicPanelSplit" is generalised to any frame size and 2-5 panels with weights, per-panel framing props (or one view per panel),
// panels are clipped to a page rectangle with real polygon clipping, ink outlines are drawn as strokes, an optional page margin, a vertical slap-in offset per panel,
// and any panel (not just the last one) can grow to eat the screen.
// Design choice: a component wrapping ONE picture (the panels are different camera angles of the same shot), not an A-to-B presentation; the expanded panel is the next shot.
import React from 'react';
import {AbsoluteFill, Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {progress} from '../../core/easing';
import {DEMO, Plate} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clipPolyToRect, mix, polyClip, rgba, seg, type Pt} from './_dom-utils';

export type ComicFraming = {
	/** magnification of the picture inside the panel */
	zoom?: number;
	/** focus point of the picture, 0..1 from the left; it is pulled to the middle of the panel (omit x and y to leave the picture where it is) */
	x?: number;
	/** focus point of the picture, 0..1 from the top */
	y?: number;
};

export type ComicPanelsProps = {
	/** the picture; every panel shows it from its own framing */
	children?: React.ReactNode;
	/** one full-frame node per panel instead of `children` (each is still framed by `framings`) */
	views?: readonly React.ReactNode[];
	/** framing of each panel, left to right; its length is the panel count (default 3) */
	framings?: readonly ComicFraming[];
	/** relative width of each panel (default equal) */
	widths?: readonly number[];
	/** frames of full-screen picture before the page is cut into panels */
	splitAt?: number;
	/** frames between two panels popping in */
	stagger?: number;
	/** frames of one panel's pop */
	pop?: number;
	/** panel that grows to eat the screen: index, or -1 for none (default: the last one) */
	expand?: number;
	/** frame the expansion starts on (default: 8 frames after the last panel has popped) */
	expandAt?: number;
	expandFrames?: number;
	/** seam slant in degrees from vertical */
	slant?: number;
	/** gutter between panels, px at 720p */
	gutter?: number;
	/** ink outline width, px at 720p */
	outline?: number;
	/** page margin around the panels, px at 720p */
	margin?: number;
	/** gutter / page colour */
	paper?: string;
	/** outline colour and the darken pulse of a popping panel */
	ink?: string;
	/** slow push-in on every panel (0.06 = 6 % over 60 frames) */
	creep?: number;
};

const DEFAULT_FRAMINGS: readonly ComicFraming[] = [{zoom: 1}, {zoom: 1.8, x: 0.32, y: 0.5}, {zoom: 2.6, x: 0.66, y: 0.36}];

const outCubic = Easing.out(Easing.cubic);
const inOutCubic = Easing.inOut(Easing.cubic);

/**
 * The picture is cut into slanted comic panels with paper gutters and ink outlines. Each panel slaps in 2 frames after the last
 * with a 6 % pop and a darken pulse, showing the same shot from another camera angle (wide / close / detail), creeping in slowly;
 * then one panel grows over the others and the page, until its framing is the whole screen: the next shot.
 * A component (not a presentation): put it in a <Sequence>; frame 0 = the full-screen picture.
 */
export const ComicPanels: React.FC<ComicPanelsProps> = ({
	children,
	views,
	framings = DEFAULT_FRAMINGS,
	widths,
	splitAt = 6,
	stagger = 2,
	pop = 3,
	expand,
	expandAt,
	expandFrames = 14,
	slant = 12,
	gutter = 14,
	outline = 4,
	margin = 12,
	paper = '#ffffff',
	ink = DEMO.ink,
	creep = 0.06,
}) => {
	const frame = useCurrentFrame();
	const {width: W, height: H} = useVideoConfig();
	const u = Math.min(W, H) / 720;
	const n = Math.max(1, views?.length ?? framings.length);
	const m0 = margin * u;
	const g2 = (gutter * u) / 2;
	const wts = Array.from({length: n}, (_, i) => Math.max(0.01, widths?.[i] ?? 1));
	const total = wts.reduce((a, b) => a + b, 0);
	const cum = [0];
	wts.forEach((w) => cum.push(cum[cum.length - 1] + w / total));
	const cw = W - 2 * m0;
	const ch = H - 2 * m0;
	const off = ch * Math.tan((slant * Math.PI) / 180);
	// seam k (between panel k-1 and k), a slanted line leaning right at the top, in frame px
	const lineX = (k: number, y: number) => m0 + cw * cum[k] + off * (0.5 - (y - m0) / ch);

	const lastPop = splitAt + (n - 1) * stagger + pop;
	const expandIdx = Math.min(expand ?? n - 1, n - 1);
	const eStart = expandAt ?? lastPop + 8;
	const ex = expandIdx >= 0 ? progress(frame, eStart, expandFrames, inOutCubic) : 0;
	const done = expandIdx >= 0 && frame >= eStart + expandFrames;
	const push = 1 + creep * seg(frame - lastPop, 0, 60);

	const viewOf = (i: number) => (views ? views[i] : children);

	/**
	 * The picture framed for panel i centred on (cx, cy): with a focus point (x / y) that point is pulled to the centre of the panel;
	 * without one the picture stays where it is on the page and is only scaled about the panel centre (a window onto the shot).
	 */
	const framed = (i: number, cx: number, cy: number) => {
		const f = framings[i] ?? {};
		const z = (f.zoom ?? 1) * push;
		const anchored = f.x === undefined && f.y === undefined;
		const tx = anchored ? cx * (1 - z) : cx - z * (f.x ?? 0.5) * W;
		const ty = anchored ? cy * (1 - z) : cy - z * (f.y ?? 0.5) * H;
		return (
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: W,
					height: H,
					transformOrigin: '0 0',
					transform: `translate(${tx}px, ${ty}px) scale(${z})`,
				}}
			>
				{viewOf(i)}
			</div>
		);
	};

	if (frame < splitAt) {
		return <AbsoluteFill style={{overflow: 'hidden'}}>{viewOf(0)}</AbsoluteFill>;
	}
	if (done) {
		return <AbsoluteFill style={{overflow: 'hidden'}}>{framed(expandIdx, W / 2, H / 2)}</AbsoluteFill>;
	}

	const panels = Array.from({length: n}, (_, i) => {
		const start = splitAt + i * stagger;
		if (frame < start) {
			return null;
		}
		const isE = i === expandIdx;
		const e = isE ? ex : 0;
		// an expanding panel pushes its two edges (still slanted) off the frame
		const slantedAt = (y: number, xMid: number) => xMid + off * (0.5 - (y - m0) / ch);
		const left = (y: number) => (i === 0 ? -W : mix(lineX(i, y) + g2, slantedAt(y, -40 * u - off / 2), e));
		const right = (y: number) => (i === n - 1 ? W * 2 : mix(lineX(i + 1, y) - g2, slantedAt(y, W + 40 * u + off / 2), e));
		const mrg = isE ? m0 * (1 - e) : m0;
		const poly = clipPolyToRect(
			[
				[left(-20), -20],
				[right(-20), -20],
				[right(H + 20), H + 20],
				[left(H + 20), H + 20],
			] as Pt[],
			mrg,
			mrg,
			W - mrg,
			H - mrg,
		);
		if (poly.length < 3) {
			return null;
		}
		// centre of the panel at mid-height before any expansion; it slides to the frame centre while the panel grows
		const base0 = Math.max(i === 0 ? -W : lineX(i, H / 2) + g2, m0);
		const base1 = Math.min(i === n - 1 ? W * 2 : lineX(i + 1, H / 2) - g2, W - m0);
		const cx = mix((base0 + base1) / 2, W / 2, e);
		const cy = H / 2;
		const pp = progress(frame, start, pop, outCubic);
		const slap = (i % 2 ? -1 : 1) * 16 * u * (1 - pp);
		const pulse = 0.3 * (1 - pp);
		return (
			<div
				key={i}
				style={{
					position: 'absolute',
					inset: 0,
					zIndex: isE ? 3 : 1,
					transform: `translateY(${slap}px) scale(${mix(1.06, 1, pp)})`,
					transformOrigin: `${cx}px ${cy}px`,
				}}
			>
				<div style={{position: 'absolute', inset: 0, clipPath: polyClip(poly), overflow: 'hidden', background: ink}}>
					{framed(i, cx, cy)}
					{pulse > 0.005 ? <AbsoluteFill style={{background: rgba(ink, pulse)}} /> : null}
				</div>
				<svg width={W} height={H} style={{position: 'absolute', inset: 0, opacity: isE ? 1 - seg(e, 0.3, 1) : 1}}>
					<polygon points={poly.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} fill="none" stroke={ink} strokeWidth={outline * u} strokeLinejoin="miter" />
				</svg>
			</div>
		);
	});

	return <AbsoluteFill style={{background: paper, overflow: 'hidden'}}>{panels}</AbsoluteFill>;
};

/** same component, named after the effect id */
export const comicPanels = ComicPanels;

const Demo: React.FC = () => (
	<ComicPanels
		framings={[{zoom: 1}, {zoom: 2.3, x: 0.3, y: 0.58}, {zoom: 2.2, x: 0.66, y: 0.56}]}
		widths={[1, 0.9, 0.9]}
		expand={1}
	>
		<Plate />
	</ComicPanels>
);

export const comicPanelsEntry: LibraryEntry = {
	meta: {
		id: 'comic-panels',
		title: 'Comic panels',
		category: 'transitions',
		looks: 'The shot is cut into three slanted comic panels with paper gutters and ink outlines that slap in two frames apart as wide, close-up and detail angles; the middle one then swells over the page into the next shot.',
		use: 'Character intros, roster cards and "one hero, three angles" beats; also a manga-style way to open a new scene. Component around one picture, not a presentation.',
		exportName: 'ComicPanels',
		durationInFrames: 48,
		source: {kind: 'ported', name: 'Vincentwei1021/video-shotcraft (ComicPanelSplit)', url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/panel-grid-moves/ComicPanelSplit.tsx', license: 'Apache-2.0'},
	},
	Demo,
};
