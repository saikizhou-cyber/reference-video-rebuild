import React, {useId} from 'react';
import {random} from 'remotion';
import {TransitionSeries, linearTiming, type TransitionPresentation} from '@remotion/transitions';
import {SceneA, SceneB} from '../../core/scene';

/** Shared helpers of the 'dom' transition group (transitions built from plain DOM / SVG, no WebGL). */

export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));

/** 0..1 position of p inside [a, b], clamped. */
export const seg = (p: number, a: number, b: number): number => clamp((p - a) / (b - a));

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Deterministic random in [0, 1) for a seed and any number of keys. */
export const rand = (seed: number, ...keys: (string | number)[]): number => random(`${seed}:${keys.join(':')}`);

/** An id that is safe inside `url(#...)` (React's useId contains characters that are not). */
export const useSvgId = (prefix: string): string => `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/** '#rgb' / '#rrggbb' + alpha -> 'rgba(...)'. Anything else is returned unchanged. */
export const rgba = (hex: string, a: number): string => {
	let h = hex.trim();
	if (!h.startsWith('#')) {
		return h;
	}
	h = h.slice(1);
	if (h.length === 3) {
		h = h
			.split('')
			.map((c) => c + c)
			.join('');
	}
	const n = parseInt(h.slice(0, 6), 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const f1 = (n: number) => n.toFixed(1);

/** SVG path of a circle (two arcs, so many circles in one path union under the non-zero rule). */
export const circlePath = (cx: number, cy: number, r: number): string =>
	r <= 0
		? ''
		: `M${f1(cx - r)} ${f1(cy)}A${f1(r)} ${f1(r)} 0 1 0 ${f1(cx + r)} ${f1(cy)}A${f1(r)} ${f1(r)} 0 1 0 ${f1(cx - r)} ${f1(cy)}Z`;

export type Pt = readonly [number, number];

/** SVG path of a closed polygon. */
export const polyPath = (pts: readonly Pt[]): string => (pts.length ? `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z` : '');

/** CSS clip-path polygon() of a point list in px. */
export const polyClip = (pts: readonly Pt[]): string => `polygon(${pts.map(([x, y]) => `${f1(x)}px ${f1(y)}px`).join(', ')})`;

/** Frames of the gallery demo of a transition: `repeats` transitions of `transition` frames, `lead` frames of the first / last scene and `hold` frames between two transitions. */
export const demoFrames = (transition: number, repeats = 1, lead = 8, hold = 6): number => repeats * transition + 2 * lead + (repeats - 1) * hold;

/** Gallery demo: SceneA -> SceneB (-> SceneA ...) with the given presentation (or a list, cycled) on a linear timing. */
export function TransitionDemo<P extends Record<string, unknown>>({
	presentation,
	transition,
	repeats = 1,
	lead = 8,
	hold = 6,
}: {
	presentation: TransitionPresentation<P> | readonly TransitionPresentation<P>[];
	transition: number;
	repeats?: number;
	lead?: number;
	hold?: number;
}): React.ReactElement {
	const list = Array.isArray(presentation) ? (presentation as readonly TransitionPresentation<P>[]) : [presentation as TransitionPresentation<P>];
	const items: React.ReactNode[] = [];
	for (let i = 0; i <= repeats; i++) {
		const edge = i === 0 || i === repeats;
		const Scene = i % 2 === 0 ? SceneA : SceneB;
		items.push(
			<TransitionSeries.Sequence key={`s${i}`} durationInFrames={edge ? transition + lead : 2 * transition + hold}>
				<Scene />
			</TransitionSeries.Sequence>,
		);
		if (i < repeats) {
			items.push(<TransitionSeries.Transition key={`t${i}`} presentation={list[i % list.length]} timing={linearTiming({durationInFrames: transition})} />);
		}
	}
	return <TransitionSeries>{items}</TransitionSeries>;
}

const clipHalf = (pts: readonly Pt[], inside: (p: Pt) => boolean, cut: (a: Pt, b: Pt) => Pt): Pt[] => {
	const out: Pt[] = [];
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		const ia = inside(a);
		const ib = inside(b);
		if (ia) {
			out.push(a);
		}
		if (ia !== ib) {
			out.push(cut(a, b));
		}
	}
	return out;
};

/** Sutherland-Hodgman clip of a (convex) polygon against the rectangle [x0, x1] x [y0, y1]. */
export const clipPolyToRect = (poly: readonly Pt[], x0: number, y0: number, x1: number, y1: number): Pt[] => {
	const atX = (x: number) => (a: Pt, b: Pt): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
	const atY = (y: number) => (a: Pt, b: Pt): Pt => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
	let p: Pt[] = clipHalf(poly, (q) => q[0] >= x0, atX(x0));
	p = clipHalf(p, (q) => q[0] <= x1, atX(x1));
	p = clipHalf(p, (q) => q[1] >= y0, atY(y0));
	p = clipHalf(p, (q) => q[1] <= y1, atY(y1));
	return p;
};
