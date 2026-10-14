import React, {useId} from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import gsap from 'gsap';
import {MorphSVGPlugin} from 'gsap/MorphSVGPlugin';
import {useGsapTimeline} from '../../core/gsap';
import {Backdrop, DEMO, DISPLAY_FONT} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

gsap.registerPlugin(MorphSVGPlugin);

export type SvgMorphProps = {
	/** SVG path data, one per step, in a 1280x720 space (point counts may differ; single closed outlines morph cleanest) */
	shapes: ReadonlyArray<string>;
	/** frames every shape sits still (the first one counts from `delay`) */
	hold?: number;
	/** frames one morph takes */
	morph?: number;
	/** frames before the first shape appears */
	delay?: number;
	/** pivot of the punch and the echo, in the 1280x720 space (default: the middle) */
	center?: readonly [number, number];
	/** 'rotational' interpolates angle and length of the control handles, which avoids kinks on curved shapes */
	type?: 'linear' | 'rotational';
	/** GSAP ease of every morph */
	ease?: string;
	/** one fill per shape, tweened along with the morph (cycled if shorter) */
	fills?: ReadonlyArray<string>;
	/** scale punch on every arrival: 0.16 = 16 % bigger for a blink, then an elastic settle (0 = none) */
	punch?: number;
	/** a thin outline that lags one step behind: it shows the previous shape and expands out of the new one on every hit */
	echo?: boolean;
	/** inner contour (a smaller dark line inside the shape, like an emblem border) */
	inner?: boolean;
	/** soft glow behind the shape in its own colour */
	glow?: boolean;
	/** the first shape pops in with an overshoot */
	intro?: boolean;
};

const DEFAULT_FILLS: ReadonlyArray<string> = [DEMO.yellow, DEMO.cyan, DEMO.red, DEMO.paper, DEMO.blue];

/**
 * MorphSVG through a sequence of arbitrary SVG shapes with a fill that is tweened along, a scale punch on every arrival,
 * an optional inner contour and a thin outline echo that lags one step. Starts at frame `delay` of its <Sequence>.
 */
export const SvgMorph: React.FC<SvgMorphProps> = ({
	shapes,
	hold = 14,
	morph = 10,
	delay = 0,
	center = [640, 360],
	type = 'linear',
	ease = 'power3.inOut',
	fills = DEFAULT_FILLS,
	punch = 0.16,
	echo = true,
	inner = true,
	glow = true,
	intro = true,
}) => {
	const {fps} = useVideoConfig();
	const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
	const n = shapes.length;
	const [cx, cy] = center;
	const fillAt = (i: number) => fills[i % fills.length];

	const scope = useGsapTimeline(
		(tl, q) => {
			const H = hold / fps;
			const M = morph / fps;
			const T0 = delay / fps;
			const step = H + M;
			// every scaling tween carries the pivot itself (GSAP's default pivot for SVG elements is the corner of the box, and it moves when the shape morphs)
			const o = {svgOrigin: `${cx} ${cy}`};
			if (echo) {
				tl.set(q('.sm-echo'), {opacity: 0, scale: 1.14, ...o}, 0);
			}

			if (intro) {
				tl.fromTo(q('.sm-pivot.sm-body'), {scale: 0.15, opacity: 0, ...o}, {scale: 1, opacity: 1, ...o, duration: Math.min(0.36, H), ease: 'back.out(2.4)'}, T0);
			}

			for (let k = 0; k < n - 1; k++) {
				const tm = T0 + H + k * step;
				const arrive = tm + M;
				// the shape and its fill change together
				tl.to(q('.sm-m'), {morphSVG: {shape: shapes[k + 1], type}, duration: M, ease}, tm);
				tl.to(q('.sm-fill'), {fill: fillAt(k + 1), duration: M, ease: 'none'}, tm);

				if (punch > 0) {
					// blink bigger, elastic settle; the settle ends before the next morph starts
					tl.to(q('.sm-pivot.sm-body'), {scale: 1 + punch, ...o, duration: 0.06, ease: 'power3.out'}, arrive);
					tl.to(q('.sm-pivot.sm-body'), {scale: 1, ...o, duration: Math.min(0.5, Math.max(0.15, H - 0.06)), ease: 'elastic.out(1.2, 0.4)'}, arrive + 0.06);
				}

				if (echo) {
					// the echo is one step late: it morphs while the main shape morphs to the next one
					tl.to(q('.sm-e'), {morphSVG: {shape: shapes[k + 1], type}, duration: M, ease}, tm + step);
					tl.to(q('.sm-echo'), {stroke: fillAt(k + 1), duration: M, ease: 'none'}, tm + step);
					// on each hit it expands out from under the new shape, showing the one that was just left
					if (k === 0) {
						tl.set(q('.sm-echo'), {opacity: 0.8}, arrive);
					}
					tl.fromTo(q('.sm-echo'), {scale: 1, ...o}, {scale: 1.14, ...o, duration: 0.42, ease: 'expo.out', immediateRender: false}, arrive);
				}
			}
		},
		[shapes.join('|'), fills.join('|'), n, hold, morph, delay, type, ease, punch, echo, intro, cx, cy, fps],
	);

	const first = shapes[0] ?? '';
	return (
		<div ref={scope} style={{position: 'absolute', inset: 0}}>
			<svg viewBox="0 0 1280 720" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
				<defs>
					<filter id={`${uid}blur`} x="0" y="0" width="1280" height="720" filterUnits="userSpaceOnUse">
						<feGaussianBlur stdDeviation="24" />
					</filter>
				</defs>
				{echo ? (
					<path className="sm-pivot sm-echo sm-e" d={first} fill="none" stroke={fillAt(0)} strokeWidth={3.5} strokeLinejoin="round" opacity={0} />
				) : null}
				<g className="sm-pivot sm-body">
					{glow ? <path className="sm-m sm-fill" d={first} fill={fillAt(0)} opacity={0.42} filter={`url(#${uid}blur)`} /> : null}
					<path className="sm-m sm-fill" d={first} fill={fillAt(0)} />
					{inner ? (
						<path className="sm-m sm-inner" d={first} fill="none" stroke={DEMO.ink} strokeOpacity={0.5} strokeWidth={4} strokeLinejoin="round" transform={`translate(${cx * 0.2} ${cy * 0.2}) scale(0.8)`} />
					) : null}
				</g>
			</svg>
		</div>
	);
};

/* ------------------------------------------------------------------ demo ------------------------------------------------------------------ */

const starPath = (cx: number, cy: number, R: number, r: number, points = 5): string => {
	const pts: string[] = [];
	for (let i = 0; i < points * 2; i++) {
		const a = -Math.PI / 2 + (i * Math.PI) / points;
		const rad = i % 2 === 0 ? R : r;
		pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`);
	}
	return `M${pts.join(' L')} Z`;
};

const DEMO_SHAPES = [
	// circle
	'M640 192 C731.2 192 808 268.8 808 360 C808 451.2 731.2 528 640 528 C548.8 528 472 451.2 472 360 C472 268.8 548.8 192 640 192 Z',
	// shield
	'M640 184 C704 218 756 230 808 230 C808 352 776 452 640 536 C504 452 472 352 472 230 C524 230 576 218 640 184 Z',
	// star
	starPath(640, 372, 196, 84),
	// lightning bolt
	'M706 170 L546 388 L626 388 L580 552 L744 316 L660 316 Z',
	// crest
	'M498 206 L566 262 L640 188 L714 262 L782 206 L782 382 C782 456 724 506 640 544 C556 506 498 456 498 382 Z',
];
const NAMES = ['SOL', 'AEGIS', 'NOVA', 'VOLT', 'REGENT'];
const DEMO_HOLD = 14;
const DEMO_MORPH = 10;
const DEMO_DELAY = 6;

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const step = DEMO_HOLD + DEMO_MORPH;
	// frame of every arrival (the shape that just landed is index + 1)
	const arrivals = DEMO_SHAPES.slice(1).map((_, k) => DEMO_DELAY + DEMO_HOLD + k * step + DEMO_MORPH);
	const current = arrivals.filter((a) => frame >= a).length;
	const lastArrival = current > 0 ? arrivals[current - 1] : DEMO_DELAY;
	const since = frame - lastArrival;
	const colors = [DEMO.yellow, DEMO.cyan, DEMO.red, DEMO.paper, DEMO.blue];
	const ringT = interpolate(since, [0, 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const ringOn = current > 0 && since >= 0;
	const labelIn = interpolate(since, [0, 5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const name = NAMES[current];
	return (
		<Backdrop>
			<svg viewBox="0 0 1280 720" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0}}>
				<defs>
					<radialGradient id="s17-sm-bg" cx="50%" cy="48%" r="62%">
						<stop offset="0" stopColor="#1a1d33" />
						<stop offset="1" stopColor="#0b0b10" />
					</radialGradient>
				</defs>
				<rect width={1280} height={720} fill="url(#s17-sm-bg)" />
				<g transform="translate(640 360)" fill="none" stroke="#2a2d48" strokeWidth={1.6}>
					<circle r={250} />
					<circle r={330} strokeDasharray="4 12" />
					<circle r={430} strokeOpacity={0.5} />
					{Array.from({length: 24}, (_, i) => (
						<path key={i} d="M0 -250 L0 -262" transform={`rotate(${i * 15})`} stroke="#3a3f66" />
					))}
				</g>
				{ringOn ? <circle cx={640} cy={360} r={200 + ringT * 300} fill="none" stroke={colors[current]} strokeWidth={10 * (1 - ringT) + 1} opacity={1 - ringT} /> : null}
				{/* index pips under the emblem */}
				<g transform="translate(640 684)">
					{DEMO_SHAPES.map((_, i) => (
						<g key={i} transform={`translate(${(i - 2) * 46} 0)`}>
							<rect x={-15} y={-4} width={30} height={8} fill={i === current ? colors[i] : '#2c2f4a'} />
						</g>
					))}
				</g>
				<g transform="translate(640 650)" opacity={labelIn}>
					<text textAnchor="middle" y={-4 + (1 - labelIn) * 12} fontFamily={DISPLAY_FONT} fontSize={42} letterSpacing={10} fill={DEMO.paper}>
						{name}
					</text>
				</g>
				<text x={56} y={74} fontFamily={DISPLAY_FONT} fontSize={30} letterSpacing={6} fill="#8d92b8">
					FACTION SIGILS
				</text>
				<text x={1224} y={74} textAnchor="end" fontFamily={DISPLAY_FONT} fontSize={30} letterSpacing={6} fill="#8d92b8">
					{String(current + 1).padStart(2, '0')} / 05
				</text>
			</svg>
			<SvgMorph shapes={DEMO_SHAPES} hold={DEMO_HOLD} morph={DEMO_MORPH} delay={DEMO_DELAY} fills={colors} />
		</Backdrop>
	);
};

export const svgMorphEntry: LibraryEntry = {
	meta: {
		id: 'svg-morph',
		title: 'SVG morph',
		category: 'shapes',
		looks: 'One emblem morphs through circle, shield, star, lightning bolt and crest on an even beat: the fill is tweened along, every arrival punches the scale with an elastic settle and a thin outline of the previous shape expands out from under it.',
		use: 'Emblem and logo transformations on beats, power-up icons, faction and rank symbols, a class-select cycle.',
		exportName: 'SvgMorph',
		durationInFrames: 150,
		deps: ['gsap'],
		source: {kind: 'original'},
	},
	Demo,
};
