import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES} from '../../core/easing';
import {DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {Bust, Skyline, clamp01, lerp, rnd} from './_space-utils';

export type FocusKey = {
	/** frame this key is reached */
	at: number;
	/** 0 = the near layer is sharp, 1 = the far layer is sharp */
	focus: number;
	/** easing of the pull that ENDS at this key (default in-out cubic) */
	ease?: (t: number) => number;
};

export type BokehOptions = {
	/** number of point lights (about 60 % sit on the far layer, the rest on the near one) */
	count?: number;
	/** aperture blades: the discs are hard-edged n-gons */
	blades?: number;
	/** disc radius in px at 720p when fully out of focus */
	size?: number;
	colors?: readonly string[];
	seed?: number;
};

export type RackFocusProps = {
	/** foreground layer (transparent around its subject) */
	near: React.ReactNode;
	/** background layer (full frame) */
	far: React.ReactNode;
	/** focus pulls over time; defaults to one pull from near to far */
	keys?: readonly FocusKey[];
	/** blur in px at 720p of a layer that is completely out of focus */
	maxBlur?: number;
	/** how much the defocused layers drift in scale: the near one grows, the far one shrinks (0.03 = 3 %) */
	breathing?: number;
	/** how much a defocused layer darkens, 0..1 */
	dim?: number;
	/** how far the focus overshoots the target before settling, as a share of the pull (0 = none) */
	hunt?: number;
	/** hard-edged bokeh discs that swell on the defocused layer and shrink to pin points on the sharp one; false = none */
	bokeh?: BokehOptions | false;
};

const DEFAULT_KEYS: readonly FocusKey[] = [
	{at: 12, focus: 0},
	{at: 40, focus: 1},
];

/** Focus value (0 near .. 1 far) at `frame`: eased pulls between the keys, each settling with a small damped overshoot. */
export const focusAt = (frame: number, keys: readonly FocusKey[], hunt: number): number => {
	const ks = [...keys].sort((a, b) => a.at - b.at);
	if (ks.length === 0) {
		return 0;
	}
	// the wobble left by the move that ended at key i
	const settle = (i: number) => {
		const since = frame - ks[i].at;
		if (hunt <= 0 || i < 1 || since < 0 || since > 14) {
			return 0;
		}
		return hunt * (ks[i].focus - ks[i - 1].focus) * Math.exp(-since / 3) * Math.sin(since * 0.9);
	};
	if (frame <= ks[0].at) {
		return ks[0].focus;
	}
	for (let i = 1; i < ks.length; i++) {
		if (frame <= ks[i].at) {
			const a = ks[i - 1];
			const b = ks[i];
			const t = (frame - a.at) / Math.max(1, b.at - a.at);
			return lerp(a.focus, b.focus, (b.ease ?? CURVES.inOutCubic)(clamp01(t))) + settle(i - 1);
		}
	}
	return ks[ks.length - 1].focus + settle(ks.length - 1);
};

const Bokeh: React.FC<{opts: Required<BokehOptions>; f: number; plane: 'near' | 'far'}> = ({opts, f, plane}) => {
	const {count, blades, size, colors, seed} = opts;
	const nFar = Math.ceil(count * 0.62);
	const lights = Array.from({length: count}, (_, i) => i).filter((i) => (plane === 'far' ? i < nFar : i >= nFar));
	// how far this plane is from the focal plane
	const d = clamp01(plane === 'far' ? Math.abs(1 - f) : Math.abs(f));
	return (
		<svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'screen'}}>
			{lights.map((i) => {
				const x = 40 + rnd(seed, 'x', i) * 1200;
				const y = plane === 'far' ? 150 + rnd(seed, 'y', i) * 480 : 40 + rnd(seed, 'y', i) * 640;
				const k = 0.6 + rnd(seed, 'k', i) * 0.7;
				const r = (3 + (size - 3) * d) * k;
				const rot = rnd(seed, 'r', i) * 360;
				const pts = Array.from({length: blades}, (_, b) => {
					const a = ((b / blades) * 360 + rot) * (Math.PI / 180);
					return `${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`;
				}).join(' ');
				const col = colors[Math.floor(rnd(seed, 'c', i) * colors.length) % colors.length];
				const o = lerp(0.95, 0.4, d) * (0.65 + 0.35 * rnd(seed, 'o', i));
				return <polygon key={i} points={pts} fill={col} fillOpacity={o * 0.55} stroke={col} strokeOpacity={o} strokeWidth={lerp(0.5, 2.2, d)} />;
			})}
		</svg>
	);
};

/**
 * Focus pull between a near and a far layer: the layer that leaves focus blurs, dims and breathes in scale while the
 * other sharpens, and the focus settles with a tiny overshoot. Optional hard-edged bokeh discs ride the blur.
 * Starts at frame 0 of its <Sequence>.
 */
export const RackFocus: React.FC<RackFocusProps> = ({
	near,
	far,
	keys = DEFAULT_KEYS,
	maxBlur = 18,
	breathing = 0.03,
	dim = 0.28,
	hunt = 0.07,
	bokeh = {},
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const {width} = useVideoConfig();
	const f = focusAt(frame, keys, hunt);
	const defNear = clamp01(Math.abs(f));
	const defFar = clamp01(Math.abs(1 - f));
	const blurNear = maxBlur * u * Math.abs(f);
	const blurFar = maxBlur * u * Math.abs(1 - f);
	const filt = (b: number, d: number) => `${b > 0.05 ? `blur(${b}px) ` : ''}${d > 0.001 ? `brightness(${1 - dim * d})` : ''}`.trim() || undefined;
	const opts: Required<BokehOptions> | null =
		bokeh === false ? null : {count: 18, blades: 6, size: 46, colors: [DEMO.yellow, DEMO.cyan, DEMO.red, DEMO.paper], seed: 1, ...bokeh};
	// a blurred full-frame layer fades out at its edges: grow it by the blur radius so the frame stays covered
	const farScale = (1 - breathing * defFar) * (1 + (4 * blurFar) / width);
	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			<AbsoluteFill style={{transform: `scale(${farScale})`, filter: filt(blurFar, defFar)}}>{far}</AbsoluteFill>
			{opts ? <Bokeh opts={opts} f={f} plane="far" /> : null}
			<AbsoluteFill style={{transform: `scale(${1 + breathing * defNear})`, filter: filt(blurNear, defNear)}}>{near}</AbsoluteFill>
			{opts ? <Bokeh opts={opts} f={f} plane="near" /> : null}
		</AbsoluteFill>
	);
};

// ---- demo -----------------------------------------------------------------------------------------------

const FarCity: React.FC = () => (
	<AbsoluteFill style={{background: 'linear-gradient(180deg, #0a0e2e 0%, #2a1456 55%, #6a1f55 100%)'}}>
		<svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
			<defs>
				<filter id="rf-glow" x="-30%" y="-60%" width="160%" height="220%">
					<feGaussianBlur stdDeviation="9" />
				</filter>
			</defs>
			<Skyline seed={21} x0={-40} x1={1320} base={600} bottom={730} minH={120} maxH={330} minW={60} maxW={130} fill="#120a30" lit="#ffd08a" litChance={0.22} />
			<Skyline seed={5} x0={-40} x1={1320} base={660} bottom={730} minH={50} maxH={150} minW={80} maxW={170} fill="#07050f" lit="#29e0ff" litChance={0.12} />
			{/* the sign */}
			<rect x={700} y={110} width={500} height={300} fill="#150a2a" stroke={DEMO.red} strokeWidth={8} />
			<rect x={716} y={126} width={468} height={268} fill="none" stroke={DEMO.yellow} strokeWidth={3} />
			<g fontFamily={DISPLAY_FONT} textAnchor="middle">
				<text x={950} y={262} fontSize={150} textLength={400} lengthAdjust="spacingAndGlyphs" fill={DEMO.red} filter="url(#rf-glow)" opacity={0.9}>
					OPEN
				</text>
				<text x={950} y={262} fontSize={150} textLength={400} lengthAdjust="spacingAndGlyphs" fill="#ff6a5c" stroke="#fff4d6" strokeWidth={2.5}>
					OPEN
				</text>
				<text x={950} y={352} fontSize={60} textLength={400} lengthAdjust="spacingAndGlyphs" fill={DEMO.cyan} filter="url(#rf-glow)" opacity={0.9}>
					ALL NIGHT
				</text>
				<text x={950} y={352} fontSize={60} textLength={400} lengthAdjust="spacingAndGlyphs" fill="#b6f6ff" stroke="#ffffff" strokeWidth={1.5}>
					ALL NIGHT
				</text>
			</g>
			<rect x={940} y={410} width={20} height={190} fill="#07050f" />
		</svg>
	</AbsoluteFill>
);

const NearBust: React.FC = () => (
	<AbsoluteFill>
		<svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
			<g transform="translate(330 800) scale(1.12)">
				<Bust fill="#04030a" rim={DEMO.cyan} accent={DEMO.red} />
			</g>
		</svg>
	</AbsoluteFill>
);

const Demo: React.FC = () => (
	<RackFocus
		far={<FarCity />}
		near={<NearBust />}
		keys={[
			{at: 10, focus: 0},
			{at: 38, focus: 1},
			{at: 58, focus: 1},
			{at: 84, focus: 0},
		]}
	/>
);

export const rackFocusEntry: LibraryEntry = {
	meta: {
		id: 'rack-focus',
		title: 'Rack focus',
		category: 'camera',
		looks: 'The foreground bust goes soft as the neon sign behind it sharpens, hexagonal bokeh discs swelling and shrinking with the pull, then it racks back.',
		use: 'Moving attention inside one shot: from the character to what they are looking at, or back.',
		exportName: 'RackFocus',
		durationInFrames: 96,
		source: {
			kind: 'inspired',
			name: 'Remocn focus-pull',
			url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/focus-pull/index.tsx',
		},
	},
	Demo,
};
