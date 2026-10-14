import React, {useMemo} from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {getLength, getPointAtLength} from '@remotion/paths';
import gsap from 'gsap';
import {MotionPathPlugin} from 'gsap/MotionPathPlugin';
import {DrawSVGPlugin} from 'gsap/DrawSVGPlugin';
import {gsapEase, useGsapTimeline} from '../../core/gsap';
import {Backdrop, DEMO, DISPLAY_FONT} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

gsap.registerPlugin(MotionPathPlugin, DrawSVGPlugin);

const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, "Courier New", monospace';

export type MotionPathProps = {
	/** the route as SVG path data in a 1280x720 space (the drawing scales to the frame) */
	path: string;
	/** how many default plane glyphs fly, or your own SVG nodes (drawn pointing right, centred on 0,0 and symmetric about it) */
	followers?: number | ReadonlyArray<React.ReactNode>;
	/** frames one follower needs for the whole route */
	duration?: number;
	/** frames between two launches */
	stagger?: number;
	/** frames before the first launch (or before the route starts drawing) */
	delay?: number;
	/** any GSAP ease for the flight (clamped to 0..1, so overshoot eases park on the target) */
	ease?: string;
	/** the route draws itself just ahead of the lead follower (DrawSVG); false shows the whole route dimmed from the start */
	drawRoute?: boolean;
	/** a fading comet segment behind every follower (a DrawSVG "start end" window that rides the route) */
	trail?: boolean;
	/** length of the trail as a share of the route (0.05 - 0.5) */
	trailLength?: number;
	/** rings and a flash at the end point when a follower lands, and a lock punch on the marker when the last one does */
	arrive?: boolean;
	/** draw the destination marker */
	marker?: boolean;
	/** intermediate nodes along the route that light up when the lead passes */
	waypoints?: number;
	/** sideways spacing of a squad in px at 720p: followers fly in formation and converge on the target (0 = one lane) */
	spread?: number;
	/** scale of the default glyph */
	size?: number;
	/** one colour per follower (cycled) */
	colors?: ReadonlyArray<string>;
	routeColor?: string;
	routeWidth?: number;
	/** colour of the destination marker */
	markerColor?: string;
};

type Pt = {x: number; y: number};

const DEFAULT_COLORS: ReadonlyArray<string> = [DEMO.yellow, DEMO.cyan, DEMO.red];
/** comet layers: each starts later and is brighter and thicker, so the tail ramps up with no visible steps */
const COMET_LAYERS = 10;
const GEO_SAMPLES = 220;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const pointAt = (d: string, length: number): Pt => getPointAtLength(d, length) ?? {x: 0, y: 0};
const smooth01 = (v: number): number => {
	const t = clamp01(v);
	return t * t * (3 - 2 * t);
};

/** the ease as a function that never leaves 0..1, so a follower never runs past the ends of the path */
const clampedEase = (ease: string): ((t: number) => number) => {
	const f = gsapEase(ease);
	return (t: number) => clamp01(f(t));
};

/** first u in 0..1 where the ease reaches `p` (linear refine between samples), 1 if it never does */
const timeAt = (ease: (t: number) => number, p: number): number => {
	if (p <= 0) {
		return 0;
	}
	const N = 800;
	let prev = ease(0);
	for (let i = 1; i <= N; i++) {
		const v = ease(i / N);
		if (v >= p) {
			const f = (p - prev) / Math.max(1e-9, v - prev);
			return (i - 1 + f) / N;
		}
		prev = v;
	}
	return 1;
};

/** the path pushed sideways by `lateral` px, easing back to the centre line towards the end (Catmull-Rom smoothed, so autoRotate stays smooth) */
const offsetPath = (d: string, lateral: number): string => {
	const len = getLength(d);
	const pts: Pt[] = [];
	for (let i = 0; i <= GEO_SAMPLES; i++) {
		pts.push(pointAt(d, (len * i) / GEO_SAMPLES));
	}
	const shifted = pts.map((p, i) => {
		const a = pts[Math.max(0, i - 1)];
		const b = pts[Math.min(GEO_SAMPLES, i + 1)];
		const tx = b.x - a.x;
		const ty = b.y - a.y;
		const m = Math.hypot(tx, ty) || 1;
		const s = i / GEO_SAMPLES;
		const w = lateral * (1 - smooth01((s - 0.3) / 0.65));
		return {x: p.x + (-ty / m) * w, y: p.y + (tx / m) * w};
	});
	const f = (n: number) => n.toFixed(2);
	let out = `M${f(shifted[0].x)} ${f(shifted[0].y)}`;
	for (let i = 0; i < GEO_SAMPLES; i++) {
		const p0 = shifted[Math.max(0, i - 1)];
		const p1 = shifted[i];
		const p2 = shifted[i + 1];
		const p3 = shifted[Math.min(GEO_SAMPLES, i + 2)];
		out += ` C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
	}
	return out;
};

/** 0, +1, -1, +2, -2 ...: the lead flies the route itself, the others take the flanks */
const flankIndex = (i: number): number => (i === 0 ? 0 : i % 2 === 1 ? (i + 1) / 2 : -i / 2);

/** The default follower: a dart-shaped plane pointing right, bounding box symmetric about 0,0. */
export const PlaneGlyph: React.FC<{color?: string; size?: number}> = ({color = DEMO.yellow, size = 1}) => (
	<g transform={`scale(${size})`}>
		<rect x={-30} y={-18} width={60} height={36} fill="none" />
		<path d="M-10 0 L-30 -5 L-30 5 Z" fill={color} opacity={0.55} />
		<path d="M30 0 L-16 -18 L-8 0 L-16 18 Z" fill={color} opacity={0.22} transform="scale(1.32)" />
		<path d="M30 0 L-16 -18 L-8 0 L-16 18 Z" fill={color} />
		<path d="M30 0 L-8 0 L-16 -18 Z" fill="#ffffff" opacity={0.42} />
		<path d="M14 0 L-6 -4.5 L-6 4.5 Z" fill={DEMO.ink} opacity={0.5} />
	</g>
);

/**
 * Followers fly a curved route with autoRotate (MotionPathPlugin). The route can draw itself just ahead of the lead
 * (DrawSVG), every follower can drag a fading comet trail (a DrawSVG "start end" window), and landing at the end point
 * pops rings and punches the destination marker. Starts at frame `delay` of its <Sequence>. Transparent: put it over a map.
 */
export const MotionPath: React.FC<MotionPathProps> = ({
	path,
	followers = 3,
	duration = 60,
	stagger = 8,
	delay = 0,
	ease = 'power2.inOut',
	drawRoute = true,
	trail = true,
	trailLength = 0.2,
	arrive = true,
	marker = true,
	waypoints = 0,
	spread = 0,
	size = 1,
	colors = DEFAULT_COLORS,
	routeColor = DEMO.paper,
	routeWidth = 3,
	markerColor = DEMO.paper,
}) => {
	const {fps} = useVideoConfig();
	const n = typeof followers === 'number' ? Math.max(1, Math.round(followers)) : followers.length;
	const nodes = useMemo(
		() => (typeof followers === 'number' ? Array.from({length: n}, (_, i) => <PlaneGlyph key={i} color={colors[i % colors.length]} size={size} />) : [...followers]),
		[followers, n, colors, size],
	);
	const geo = useMemo(() => {
		const len = getLength(path);
		const start = pointAt(path, 0);
		const end = pointAt(path, len);
		const paths = Array.from({length: n}, (_, i) => (spread && i > 0 ? offsetPath(path, flankIndex(i) * spread) : path));
		const wps = Array.from({length: waypoints}, (_, k) => pointAt(path, (len * (k + 1)) / (waypoints + 1)));
		return {start, end, paths, wps};
	}, [path, n, spread, waypoints]);
	const L = Math.min(0.6, Math.max(0.03, trailLength));
	// comet layers (shortest = brightest): fraction of the trail length, stroke width, opacity
	const layers = useMemo(() => {
		const alpha = 1 - Math.pow(0.05, 1 / COMET_LAYERS);
		const list = Array.from({length: COMET_LAYERS}, (_, s) => ({
			frac: 1 - s / COMET_LAYERS,
			width: routeWidth * (1.1 + 2.4 * ((s + 1) / COMET_LAYERS)),
			opacity: alpha,
		}));
		// two wide, faint layers = the glow around the comet
		return [...list, {frac: 1, width: routeWidth * 7, opacity: 0.06}, {frac: 0.5, width: routeWidth * 7, opacity: 0.08}];
	}, [routeWidth]);

	const scope = useGsapTimeline(
		(tl, q) => {
			const E = clampedEase(ease);
			const D = duration / fps;
			const S = stagger / fps;
			const T0 = delay / fps;
			const lead = drawRoute ? 5 / fps : 0;
			const starts = Array.from({length: n}, (_, i) => T0 + lead + i * S);
			const uEnd = Math.max(0.02, timeAt(E, 0.9995));
			const arrivals = starts.map((t) => t + uEnd * D);
			const lastArrival = arrivals[n - 1];

			// GSAP's default pivot for SVG elements is not their centre: everything that scales / rotates is symmetric about its own 0,0
			tl.set(q('.mp-o'), {transformOrigin: '50% 50%'}, 0);

			// the route draws just ahead of the lead
			if (drawRoute) {
				const ahead = 0.1;
				const ramp = lead + 0.2;
				const total = lead + D;
				const routeAt = (time: number) => clamp01(E((time - T0 - lead) / D) + ahead * smooth01((time - T0) / ramp));
				tl.fromTo(q('.mp-route'), {drawSVG: '0% 0%'}, {drawSVG: '0% 100%', duration: total, ease: (v: number) => routeAt(T0 + v * total)}, T0);
			}

			// waypoints light up when the lead passes
			geo.wps.forEach((_, k) => {
				const frac = (k + 1) / (waypoints + 1);
				const t = starts[0] + timeAt(E, frac) * D;
				const wp = q(`.mp-wp-${k}`);
				const fill = colors[0 % colors.length];
				tl.to(wp, {fill, stroke: fill, duration: 0.08, ease: 'none'}, t);
				tl.fromTo(wp, {scale: 1}, {scale: 1.9, duration: 0.07, ease: 'power3.out', immediateRender: false}, t);
				tl.to(wp, {scale: 1, duration: 0.4, ease: 'elastic.out(1.1, 0.4)'}, t + 0.07);
				tl.fromTo(q(`.mp-wpring-${k}`), {opacity: 0.9, scale: 0.6}, {opacity: 0, scale: 2.6, duration: 0.5, ease: 'expo.out', immediateRender: false}, t);
			});
			if (waypoints > 0) {
				tl.set(q('.mp-wpring'), {opacity: 0}, 0);
			}

			for (let i = 0; i < n; i++) {
				const ti = starts[i];
				const c = colors[i % colors.length];
				const fol = q(`.mp-fol-${i}`);
				const geoEl = q(`.mp-geo-${i}`)[0] as SVGPathElement;
				// the follower exists from its launch on and flies the whole route
				tl.set(fol, {opacity: 0}, 0);
				tl.set(fol, {opacity: 1}, ti);
				tl.to(
					fol,
					{duration: D, ease: E, motionPath: {path: geoEl, align: geoEl, alignOrigin: [0.5, 0.5], autoRotate: true}},
					ti,
				);
				tl.fromTo(q(`.mp-in-${i}`), {scale: 0.2}, {scale: 1, duration: 0.24, ease: 'back.out(3)'}, ti);

				// launch pulse at the start point
				tl.set(q(`.mp-launch-${i}`), {opacity: 0}, 0);
				tl.fromTo(q(`.mp-launch-${i}`), {attr: {r: 8}, opacity: 0.8, strokeWidth: 4}, {attr: {r: 40}, opacity: 0, strokeWidth: 1, duration: 0.45, ease: 'expo.out', immediateRender: false}, ti);

				if (trail) {
					// every layer is a window [max(0, head - len), head] that rides the route with the follower's ease, so it is
					// built from three DrawSVG tweens: grow from the start, slide along with a fixed size, get eaten at the target
					layers.forEach((layer, s) => {
						const el = q(`.mp-tr-${i}-${s}`);
						const Ls = L * layer.frac;
						const u1 = Math.min(uEnd, Math.max(0.0005, timeAt(E, Ls)));
						const d1 = u1 * D;
						const d2 = Math.max(0.0005, (uEnd - u1) * D);
						tl.fromTo(
							el,
							{drawSVG: '0% 0%'},
							{drawSVG: `0% ${Ls * 100}%`, duration: d1, ease: (v: number) => E(v * u1) / Ls},
							ti,
						);
						tl.fromTo(
							el,
							{drawSVG: `0% ${Ls * 100}%`},
							{
								drawSVG: `${(1 - Ls) * 100}% 100%`,
								duration: d2,
								ease: (v: number) => clamp01((E(u1 + v * (uEnd - u1)) - Ls) / (1 - Ls)),
								immediateRender: false,
							},
							ti + d1,
						);
						tl.fromTo(
							el,
							{drawSVG: `${(1 - Ls) * 100}% 100%`},
							{drawSVG: '100% 100%', duration: 0.22, ease: 'power2.in', immediateRender: false},
							ti + uEnd * D,
						);
					});
				}

				if (arrive) {
					const ta = arrivals[i];
					tl.set(q(`.mp-pop-${i}, .mp-hit-${i}`), {opacity: 0}, 0);
					tl.fromTo(q(`.mp-pop-${i}`), {attr: {r: 16}, opacity: 0.95, strokeWidth: 7}, {attr: {r: 92}, opacity: 0, strokeWidth: 1, duration: 0.55, ease: 'expo.out', immediateRender: false}, ta);
					tl.fromTo(q(`.mp-hit-${i}`), {attr: {r: 5}, opacity: 0.9}, {attr: {r: 34}, opacity: 0, duration: 0.28, ease: 'power3.out', immediateRender: false}, ta);
					// the follower is absorbed by the target
					tl.to(q(`.mp-in-${i}`), {scale: 0, duration: 0.16, ease: 'power2.in'}, ta + 0.04);
				}
			}

			if (marker) {
				const dest = q('.mp-dest');
				tl.to(q('.mp-dest-spin'), {rotation: 120, duration: lastArrival + 0.5, ease: 'none'}, 0);
				if (arrive) {
					tl.fromTo(dest, {scale: 1}, {scale: 1.32, duration: 0.07, ease: 'power3.out', immediateRender: false}, lastArrival);
					tl.to(dest, {scale: 1, duration: 0.5, ease: 'elastic.out(1.1, 0.35)'}, lastArrival + 0.07);
					tl.fromTo(q('.mp-core'), {fill: markerColor}, {fill: colors[(n - 1) % colors.length], duration: 0.1, ease: 'none', immediateRender: false}, lastArrival);
					tl.to(q('.mp-core'), {fill: markerColor, duration: 0.6, ease: 'power2.out'}, lastArrival + 0.2);
				}
			}
		},
		[path, n, spread, waypoints, duration, stagger, delay, ease, drawRoute, trail, L, arrive, marker, routeWidth, fps, colors, markerColor],
	);

	const {start, end, paths, wps} = geo;
	const routeStatic = !drawRoute;
	return (
		<div ref={scope} style={{position: 'absolute', inset: 0}}>
			<svg viewBox="0 0 1280 720" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
				{/* the route: a faint wide underlay and the line itself (both drawn by the same DrawSVG tween) */}
				<path className="mp-route" d={path} fill="none" stroke={routeColor} strokeWidth={routeWidth * 4.5} strokeOpacity={routeStatic ? 0.05 : 0.09} strokeLinecap="butt" strokeLinejoin="round" />
				<path className="mp-route" d={path} fill="none" stroke={routeColor} strokeWidth={routeWidth} strokeOpacity={routeStatic ? 0.3 : 0.62} strokeLinecap="butt" strokeLinejoin="round" />
				{/* start point and one launch pulse per follower */}
				<g transform={`translate(${start.x} ${start.y})`}>
					<circle r={9} fill="none" stroke={routeColor} strokeWidth={2.5} opacity={0.7} />
					<circle r={3.5} fill={routeColor} opacity={0.9} />
					{nodes.map((_, i) => (
						<circle key={i} className={`mp-launch-${i}`} r={8} fill="none" stroke={colors[i % colors.length]} opacity={0} />
					))}
				</g>
				{wps.map((p, k) => (
					<g key={k} transform={`translate(${p.x} ${p.y})`}>
						<circle className={`mp-o mp-wpring mp-wpring-${k}`} r={12} fill="none" stroke={colors[0 % colors.length]} strokeWidth={2.5} opacity={0} />
						<path className={`mp-o mp-wp-${k}`} d="M0 -9 L9 0 L0 9 L-9 0 Z" fill={DEMO.ink} stroke={routeColor} strokeWidth={2.5} strokeOpacity={0.8} strokeLinejoin="round" />
					</g>
				))}
				{/* the comets */}
				{trail
					? nodes.map((_, i) =>
							layers.map((layer, s) => (
								<path
									key={`${i}-${s}`}
									className={`mp-tr-${i}-${s}`}
									d={paths[i]}
									fill="none"
									stroke={colors[i % colors.length]}
									strokeWidth={layer.width}
									strokeOpacity={layer.opacity}
									strokeLinecap="butt"
									strokeLinejoin="round"
								/>
							)),
						)
					: null}
				{/* destination marker and the landing effects */}
				<g transform={`translate(${end.x} ${end.y})`}>
					{marker ? (
						<g className="mp-o mp-dest">
							<g className="mp-o mp-dest-spin">
								<circle r={38} fill="none" stroke={markerColor} strokeWidth={2.5} strokeDasharray="7 11" opacity={0.7} />
							</g>
							<circle r={22} fill="none" stroke={markerColor} strokeWidth={3} opacity={0.9} />
							{[0, 90, 180, 270].map((a) => (
								<path key={a} d="M0 -30 L0 -50" stroke={markerColor} strokeWidth={3.5} strokeLinecap="butt" opacity={0.95} transform={`rotate(${a})`} />
							))}
							<circle className="mp-core" r={6.5} fill={markerColor} />
						</g>
					) : null}
					{arrive
						? nodes.map((_, i) => (
								<g key={i}>
									<circle className={`mp-hit-${i}`} r={5} fill={colors[i % colors.length]} opacity={0} />
									<circle className={`mp-pop-${i}`} r={16} fill="none" stroke={colors[i % colors.length]} strokeWidth={7} opacity={0} />
								</g>
							))
						: null}
				</g>
				{/* flight lines (geometry only: the followers align to these) */}
				{paths.map((d, i) => (
					<path key={i} className={`mp-geo-${i}`} d={d} fill="none" stroke="none" />
				))}
				{/* the followers */}
				{nodes.map((node, i) => (
					<g key={i} className={`mp-fol-${i}`}>
						<g className={`mp-o mp-in-${i}`}>{node}</g>
					</g>
				))}
			</svg>
		</div>
	);
};

/* ------------------------------------------------------------------ demo ------------------------------------------------------------------ */

const ROUTE = 'M118 592 C 300 592, 316 392, 500 352 S 700 506, 836 410 S 948 188, 1166 156';

const MapBackdrop: React.FC = () => {
	const frame = useCurrentFrame();
	const blink = Math.floor(frame / 8) % 2 === 0 ? 0.85 : 0.25;
	const major = Array.from({length: 7}, (_, i) => 160 + i * 160);
	return (
		<svg viewBox="0 0 1280 720" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0}}>
			<defs>
				<pattern id="s17-mp-minor" width={32} height={32} patternUnits="userSpaceOnUse">
					<path d="M32 0 H0 V32" fill="none" stroke="#1a2036" strokeWidth={1} />
				</pattern>
				<pattern id="s17-mp-major" width={160} height={160} patternUnits="userSpaceOnUse">
					<path d="M160 0 H0 V160" fill="none" stroke="#2a3354" strokeWidth={1.4} />
				</pattern>
				<radialGradient id="s17-mp-glow" cx="50%" cy="46%" r="70%">
					<stop offset="0" stopColor="#1b2444" />
					<stop offset="1" stopColor="#090b14" />
				</radialGradient>
				<radialGradient id="s17-mp-vig" cx="50%" cy="50%" r="75%">
					<stop offset="0.55" stopColor="#000" stopOpacity={0} />
					<stop offset="1" stopColor="#000" stopOpacity={0.7} />
				</radialGradient>
			</defs>
			<rect width={1280} height={720} fill="url(#s17-mp-glow)" />
			{/* districts, a river and a ridge line: abstract terrain so the route has something to cross */}
			<path d="M-20 300 C 190 330, 330 150, 600 236 S 980 360, 1300 320" fill="none" stroke="#0c2036" strokeWidth={46} />
			<path d="M-20 300 C 190 330, 330 150, 600 236 S 980 360, 1300 320" fill="none" stroke="#1d4a73" strokeWidth={2} strokeOpacity={0.5} transform="translate(0 -24)" />
			<path d="M-20 300 C 190 330, 330 150, 600 236 S 980 360, 1300 320" fill="none" stroke="#1d4a73" strokeWidth={2} strokeOpacity={0.5} transform="translate(0 24)" />
			<g fill="#10162b" stroke="#232c4e" strokeWidth={1.6}>
				<path d="M60 440 L196 420 L238 500 L172 556 L74 520 Z" />
				<path d="M340 560 L470 540 L520 612 L430 668 L330 640 Z" />
				<path d="M590 430 L706 396 L760 452 L722 540 L618 532 Z" />
				<path d="M860 560 L1008 540 L1060 610 L980 668 L880 640 Z" />
				<path d="M980 440 L1110 420 L1156 480 L1090 526 L1004 506 Z" />
				<path d="M120 100 L270 76 L330 150 L250 206 L140 184 Z" />
				<path d="M770 90 L900 70 L956 130 L890 190 L790 170 Z" />
			</g>
			<rect width={1280} height={720} fill="url(#s17-mp-minor)" />
			<rect width={1280} height={720} fill="url(#s17-mp-major)" />
			{/* coordinate ticks */}
			<g fontFamily={MONO} fontSize={12} fill="#7e8bb5" opacity={0.7} letterSpacing={2}>
				{major.map((x, i) => (
					<text key={x} x={x + 6} y={22}>
						{String.fromCharCode(65 + i)}
					</text>
				))}
				{[160, 320, 480, 640].map((y, i) => (
					<text key={y} x={10} y={y - 8}>
						{String(i + 1).padStart(2, '0')}
					</text>
				))}
			</g>
			{major.flatMap((x) => [160, 320, 480, 640].map((y) => <path key={`${x}-${y}`} d={`M${x - 7} ${y} H${x + 7} M${x} ${y - 7} V${y + 7}`} stroke="#5b6a9a" strokeWidth={1.5} opacity={0.55} />))}
			{/* destination contour rings */}
			<g transform="translate(1166 156)" fill="none" stroke="#2a3a66" strokeWidth={1.4}>
				<circle r={96} strokeDasharray="3 7" />
				<circle r={160} />
				<circle r={240} strokeDasharray="3 9" />
			</g>
			<rect width={1280} height={720} fill="url(#s17-mp-vig)" />
			{/* HUD labels */}
			<text x={56} y={90} fontFamily={DISPLAY_FONT} fontSize={54} fill={DEMO.paper} letterSpacing={2}>
				ROUTE / ALPHA-7
			</text>
			<rect x={56} y={104} width={64} height={5} fill={DEMO.yellow} />
			<text x={56} y={134} fontFamily={MONO} fontSize={13} fill="#8d99c2" letterSpacing={4}>
				SECTOR 07 - GRID C4
			</text>
			<g transform="translate(1040 666)" fontFamily={MONO} fontSize={12} fill="#8d99c2" letterSpacing={3}>
				<path d="M0 -6 V0 H160 V-6" fill="none" stroke="#8d99c2" strokeWidth={1.6} />
				<text x={0} y={22}>
					0
				</text>
				<text x={118} y={22}>
					5 KM
				</text>
			</g>
			<circle cx={1226} cy={52} r={5} fill={DEMO.red} opacity={blink} />
			<text x={1204} y={57} textAnchor="end" fontFamily={MONO} fontSize={13} fill="#8d99c2" letterSpacing={4}>
				LIVE
			</text>
		</svg>
	);
};

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const delay = 8;
	const stagger = 8;
	const duration = 62;
	const arrived = [0, 1, 2].filter((i) => frame >= delay + 5 + i * stagger + duration).length;
	const done = interpolate(frame, [delay + 5 + 2 * stagger + duration, delay + 5 + 2 * stagger + duration + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	return (
		<Backdrop color="#090b14">
			<MapBackdrop />
			<MotionPath path={ROUTE} followers={3} size={1.2} duration={duration} stagger={stagger} delay={delay} spread={34} waypoints={2} trailLength={0.24} />
			<svg viewBox="0 0 1280 720" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0}}>
				<g transform="translate(56 196)" fontFamily={MONO} letterSpacing={4}>
					<text fontSize={13} fill="#8d99c2">
						ON TARGET
					</text>
					<text y={46} fontFamily={DISPLAY_FONT} fontSize={44} letterSpacing={2} fill={arrived === 3 ? DEMO.yellow : DEMO.paper}>
						{String(arrived).padStart(2, '0')} / 03
					</text>
					<rect x={0} y={62} width={170 * done} height={5} fill={DEMO.yellow} />
				</g>
			</svg>
		</Backdrop>
	);
};

export const motionPathEntry: LibraryEntry = {
	meta: {
		id: 'motion-path',
		title: 'Motion path',
		category: 'shapes',
		looks: 'Three plane glyphs fly an S-curved route in formation with autoRotate, the route drawing itself just ahead of the lead, a tapered comet behind each plane, nodes lighting as the lead passes, and rings and a lock punch on the destination marker when they land.',
		use: 'Map routes, a squad moving to a target, missiles, paper planes, a card thrown across the frame.',
		exportName: 'MotionPath',
		durationInFrames: 112,
		deps: ['gsap'],
		source: {kind: 'original'},
	},
	Demo,
};
