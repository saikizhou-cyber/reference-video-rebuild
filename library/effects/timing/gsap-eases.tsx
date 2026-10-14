import React, {useMemo} from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import gsap from 'gsap';
import {CustomEase} from 'gsap/CustomEase';
import {CustomBounce} from 'gsap/CustomBounce';
import {gsapEase} from '../../core/gsap';
import {Backdrop, DEMO, DISPLAY_FONT} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

gsap.registerPlugin(CustomEase, CustomBounce);

/** GSAP's whole ease set as plain (t) => value functions for remotion's interpolate(): re-exported so a project needs one import. */
export {gsapEase} from '../../core/gsap';

// two custom eases, registered once at module level; after that gsapEase('s17Bounce') works anywhere, like a built-in ease
/** a ball dropping onto the end value: bounces with decaying height, plus a matching squash curve (1 at every contact) */
export const BOUNCE_EASE = 's17Bounce';
export const BOUNCE_SQUASH_EASE = 's17Bounce-squash';
CustomBounce.create(BOUNCE_EASE, {strength: 0.6, squash: 2, squashID: BOUNCE_SQUASH_EASE});
/** a "hop": crouches back, leaps past the target, settles with a small dip - drawn as SVG path data (x = time, y = value) */
export const HOP_EASE = 's17Hop';
CustomEase.create(HOP_EASE, 'M0,0 C0.1,0 0.12,-0.2 0.23,-0.2 C0.35,-0.2 0.37,1.26 0.6,1.26 C0.76,1.26 0.78,0.94 0.87,0.94 C0.93,0.94 0.93,1 1,1');

export type EaseLane = {
	/** any GSAP ease string, built in or registered by CustomEase / CustomBounce / EasePack */
	ease: string;
	/** text shown for the lane (default: the ease string) */
	label?: string;
	/** a dim second line of text, e.g. what the custom ease is made of */
	note?: string;
	/** a squash ease (CustomBounce squashID): the dot is squashed on every contact */
	squash?: string;
};

export type EaseLanesProps = {
	/** ease strings or lane objects, one lane each (8 fit the frame best) */
	eases?: ReadonlyArray<string | EaseLane>;
	/** frames one run takes */
	duration?: number;
	/** frames before the dots set off */
	delay?: number;
	/** replay after a pause (frames) instead of resting at the end */
	loop?: boolean;
	pause?: number;
	/** dot colour per lane (cycled) */
	colors?: ReadonlyArray<string>;
	/** title shown top left (null = none) */
	title?: string | null;
};

const MONO = '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, "Courier New", monospace';

export const DEFAULT_EASE_LANES: ReadonlyArray<string | EaseLane> = [
	'power4.out',
	'expo.inOut',
	'back.out(2.4)',
	'elastic.out(1, 0.3)',
	'bounce.out',
	{ease: BOUNCE_EASE, label: 'CustomBounce', note: 'strength 0.6  squash 2', squash: BOUNCE_SQUASH_EASE},
	{ease: HOP_EASE, label: 'CustomEase "hop"', note: 'SVG path data'},
	'steps(6)',
];
const DEFAULT_COLORS: ReadonlyArray<string> = [DEMO.yellow, DEMO.cyan, DEMO.red, DEMO.paper];

// horizontal plan (1280 units): [index][label above the track][track: the whole undershoot..overshoot range of all lanes][value readout][curve thumbnail]
// the track is scaled so the highest overshoot of any lane (elastic reaches ~1.37) still ends left of the readout, and a dip below 0 stays right of LEFT_X
const LEFT_X = 150;
const RIGHT_X = 940;
const LABEL_X = 100;
const READOUT_X = 1040;
const THUMB_X = 1066;
const THUMB_W = 158;
const THUMB_H = 46;
const SAMPLES = 72;
const RANGE_SAMPLES = 360;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * A visual cheat sheet of GSAP eases and the bridge into plain Remotion code: every lane is a dot that moves with
 * interpolate(frame, ..., {easing: gsapEase(name)}) - no GSAP timeline - next to a thumbnail of the curve with a cursor on it.
 * Includes a CustomBounce with squash and a CustomEase drawn as SVG path data. Transparent over the frame: put it on a dark plate.
 */
export const EaseLanes: React.FC<EaseLanesProps> = ({eases = DEFAULT_EASE_LANES, duration = 72, delay = 6, loop = false, pause = 24, colors = DEFAULT_COLORS, title = 'EASE LANES'}) => {
	const frame = useCurrentFrame();
	const key = eases.map((e) => (typeof e === 'string' ? e : `${e.ease}|${e.squash ?? ''}`)).join(';');
	const lanes = useMemo(
		() =>
			eases.map((e) => {
				const lane: EaseLane = typeof e === 'string' ? {ease: e} : e;
				const fn = gsapEase(lane.ease);
				const squash = lane.squash ? gsapEase(lane.squash) : null;
				const curve = Array.from({length: SAMPLES + 1}, (_, i) => fn(i / SAMPLES));
				// a finer sweep for the extremes, so the track always has room for the real peak
				let lo = 0;
				let hi = 1;
				for (let i = 0; i <= RANGE_SAMPLES; i++) {
					const val = fn(i / RANGE_SAMPLES);
					lo = Math.min(lo, val);
					hi = Math.max(hi, val);
				}
				return {lane, fn, squash, curve, lo, hi};
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[key],
	);
	const n = lanes.length;
	// one shared scale: [lowest dip .. highest overshoot] of all lanes fills LEFT_X..RIGHT_X, so 0 and 1 land where they must
	const gLo = Math.min(0, ...lanes.map((l) => l.lo));
	const gHi = Math.max(1, ...lanes.map((l) => l.hi));
	const trackW = (RIGHT_X - LEFT_X) / (gHi - gLo);
	const trackX0 = LEFT_X - gLo * trackW;
	const trackX1 = trackX0 + trackW;
	const top = 130;
	const laneH = Math.min(80, (720 - top - 24) / Math.max(1, n));
	const local = loop ? ((frame - delay) % (duration + pause) + (duration + pause)) % (duration + pause) : frame - delay;
	const at = (f: number, fn: (t: number) => number) => interpolate(f, [0, duration], [0, 1], {easing: fn, extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const t = clamp01(local / duration);
	const done = local >= duration;

	return (
		<svg viewBox="0 0 1280 720" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0}}>
			{title ? (
				<g>
					<text x={48} y={66} fontFamily={DISPLAY_FONT} fontSize={46} letterSpacing={4} fill={DEMO.paper}>
						{title}
					</text>
					<rect x={48} y={78} width={56} height={5} fill={DEMO.yellow} />
					<text x={132} y={84} fontFamily={MONO} fontSize={18} letterSpacing={0.3} fill="#a3a8cc">
						interpolate(frame, [from, to], [0, 1], {'{'}easing: gsapEase(name){'}'})
					</text>
					<text x={1232} y={66} textAnchor="end" fontFamily={MONO} fontSize={20} fontWeight={700} letterSpacing={2} fill={done ? DEMO.yellow : '#a3a8cc'}>
						{`t ${t.toFixed(2)}`}
					</text>
				</g>
			) : null}
			{/* column heads: where the value is 0 and where it is 1 */}
			<text x={trackX0} y={top - 12} textAnchor="middle" fontFamily={MONO} fontSize={20} fontWeight={700} fill="#a3a8cc">
				0
			</text>
			<text x={trackX1} y={top - 12} textAnchor="middle" fontFamily={MONO} fontSize={20} fontWeight={700} fill={DEMO.yellow}>
				1
			</text>
			{lanes.map(({lane, fn, squash, curve, lo, hi}, i) => {
				const c = colors[i % colors.length];
				const yc = top + i * laneH + laneH / 2 + 4;
				const v = at(local, fn);
				const xOf = (val: number) => trackX0 + val * trackW;
				const labelText = lane.label ?? lane.ease;
				const x = xOf(v);
				const sq = squash ? Math.min(1.2, Math.max(-0.2, at(local, squash))) : 0;
				const sx = 1 - 0.42 * sq;
				const sy = 1 + 0.42 * sq;
				// the ghosts of the last frames show speed
				const ghosts = [1, 2, 3].map((k) => ({x: xOf(at(local - k, fn)), a: 0.3 / k}));
				// thumbnail: curve, the part travelled so far, and a cursor on it
				const bx = THUMB_X;
				const by = yc - THUMB_H / 2;
				const py = (val: number) => by + THUMB_H - ((val - lo) / (hi - lo)) * THUMB_H;
				const px = (u: number) => bx + u * THUMB_W;
				const pts = curve.map((val, k) => `${px(k / SAMPLES).toFixed(1)} ${py(val).toFixed(1)}`);
				const upto = Math.max(1, Math.round(t * SAMPLES));
				return (
					<g key={`${lane.ease}-${i}`}>
						<text x={48} y={yc + 8} fontFamily={DISPLAY_FONT} fontSize={27} letterSpacing={2} fill="#5a608c">
							{String(i + 1).padStart(2, '0')}
						</text>
						<text x={LABEL_X} y={yc - 24} fontFamily={MONO} fontSize={22} fontWeight={700} letterSpacing={0.3} fill={DEMO.paper}>
							{labelText}
						</text>
						{lane.note ? (
							<text x={LABEL_X + labelText.length * 13.2 + 30} y={yc - 24} fontFamily={MONO} fontSize={18} letterSpacing={0.3} fill="#a3a8cc">
								{lane.note}
							</text>
						) : null}
						{/* the lane, with a tick where 0 and where 1 is */}
						<path d={`M${LEFT_X - 28} ${yc} H${RIGHT_X + 28}`} stroke="#23263f" strokeWidth={2} />
						<path d={`M${trackX0} ${yc - 13} V${yc + 13}`} stroke="#5a608c" strokeWidth={2} />
						<path d={`M${trackX1} ${yc - 13} V${yc + 13}`} stroke={DEMO.yellow} strokeWidth={2} opacity={0.8} />
						<path d={`M${trackX0} ${yc} H${x}`} stroke={c} strokeWidth={3} opacity={0.55} />
						{ghosts.map((g, k) => (
							<circle key={k} cx={g.x} cy={yc} r={12} fill={c} opacity={g.a} />
						))}
						<g transform={`translate(${x} ${yc})`}>
							<circle r={24} fill={c} opacity={0.16} transform={`scale(${sx} ${sy})`} />
							<circle r={12.5} fill={c} transform={`scale(${sx} ${sy})`} />
						</g>
						<text x={READOUT_X} y={yc + 7} textAnchor="end" fontFamily={MONO} fontSize={20} fontWeight={700} fill={v > 1.001 || v < -0.001 ? DEMO.red : '#a3a8cc'}>
							{v.toFixed(2)}
						</text>
						{/* curve thumbnail, in its own column right of the track so no dot can ever slide under it */}
						<rect x={bx - 8} y={by - 7} width={THUMB_W + 16} height={THUMB_H + 14} fill="#0f1020" stroke="#2c3052" strokeWidth={1.4} />
						<path d={`M${bx} ${py(0)} H${bx + THUMB_W} M${bx} ${py(1)} H${bx + THUMB_W}`} stroke="#3a3f66" strokeWidth={1} strokeDasharray="3 5" />
						<path d={`M${pts.join(' L')}`} fill="none" stroke={c} strokeWidth={1.8} opacity={0.28} strokeLinejoin="round" />
						<path d={`M${pts.slice(0, upto + 1).join(' L')}`} fill="none" stroke={c} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />
						<circle cx={px(t)} cy={py(v)} r={4.5} fill={DEMO.paper} />
					</g>
				);
			})}
		</svg>
	);
};

const Demo: React.FC = () => (
	<Backdrop color="#0b0b10">
		<EaseLanes />
	</Backdrop>
);

export const gsapEasesEntry: LibraryEntry = {
	meta: {
		id: 'gsap-eases',
		title: 'GSAP ease lanes',
		category: 'timing',
		looks: 'Eight lanes race one dot each from 0 to 1 with a different GSAP ease (power4.out, expo.inOut, back, elastic, bounce, a squashing CustomBounce, a hand-drawn CustomEase, steps) beside a curve thumbnail with a cursor and a live value readout; driven by interpolate(), not a timeline.',
		use: 'Picking an ease by eye; using GSAP\'s richer ease set (CustomEase, CustomBounce, steps) inside plain Remotion code via gsapEase().',
		exportName: 'EaseLanes',
		durationInFrames: 96,
		deps: ['gsap'],
		source: {kind: 'original'},
	},
	Demo,
};
