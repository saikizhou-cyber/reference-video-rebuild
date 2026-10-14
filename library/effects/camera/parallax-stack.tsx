import React from 'react';
import {AbsoluteFill, Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {noise2D} from '@remotion/noise';
import {DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {BleedSvg, Figure, Skyline, Stars, clamp01, lerp} from './_space-utils';

export type ParallaxLayer = {
	/** the layer's content. It is laid out like a full-frame child, so paint it past the edges (see BleedSvg in _space-utils) or the pan will show gaps */
	node: React.ReactNode;
	/** 0 = far background (barely moves), 1 = nearest plane that is still part of the scene; values above 1 are foreground that rushes past */
	depth: number;
	/** blur in px at 720p; leave out to derive it from the distance to `focusDepth` */
	blur?: number;
};

export type CameraPose = {
	/** frame the camera reaches this pose (a pose repeated at two frames is a hold) */
	at: number;
	/** -1..1 sideways and vertical camera position (1 moves the nearest layer by `reach` of the frame) */
	x?: number;
	y?: number;
	/** scale of the nearest layer: 1 = no push, 1.5 = the camera has dollied in until the nearest plane is 1.5x */
	zoom?: number;
	/** camera roll in degrees */
	roll?: number;
	/** easing of the move that ENDS at this pose (default in-out sine) */
	ease?: (t: number) => number;
};

export type ParallaxStackProps = {
	layers: readonly ParallaxLayer[];
	/** camera path; defaults to a slow drift from left to right while pushing in over the whole Sequence */
	moves?: readonly CameraPose[];
	/** how far the nearest layer travels at |x| = 1, as a share of the frame */
	reach?: number;
	/** depth that stays sharp, and the blur in px at 720p of a layer at the far end of the scale */
	focusDepth?: number;
	depthBlur?: number;
	/** handheld shake in px at 720p (0 = locked off); nearer layers shake more, which sells the depth */
	shake?: number;
	/** atmosphere colour laid between the layers (null = none) and how strongly it veils the far ones */
	haze?: string | null;
	hazeAmount?: number;
};

type Pose = Required<Omit<CameraPose, 'ease'>> & {ease: (t: number) => number};

const resolvePoses = (moves: readonly CameraPose[]): Pose[] => {
	const sorted = [...moves].sort((a, b) => a.at - b.at);
	const out: Pose[] = [];
	for (const m of sorted) {
		const prev = out[out.length - 1];
		out.push({
			at: m.at,
			x: m.x ?? prev?.x ?? 0,
			y: m.y ?? prev?.y ?? 0,
			zoom: m.zoom ?? prev?.zoom ?? 1,
			roll: m.roll ?? prev?.roll ?? 0,
			ease: m.ease ?? Easing.inOut(Easing.sin),
		});
	}
	return out;
};

/** Camera pose at `frame`: keys are carried forward, eased per segment, clamped before the first and after the last. */
export const poseAt = (frame: number, moves: readonly CameraPose[]): Omit<Pose, 'at' | 'ease'> => {
	const ps = resolvePoses(moves);
	if (ps.length === 0) {
		return {x: 0, y: 0, zoom: 1, roll: 0};
	}
	if (frame <= ps[0].at) {
		return ps[0];
	}
	for (let i = 1; i < ps.length; i++) {
		if (frame <= ps[i].at) {
			const a = ps[i - 1];
			const b = ps[i];
			const t = b.ease(clamp01((frame - a.at) / Math.max(1, b.at - a.at)));
			return {x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), zoom: lerp(a.zoom, b.zoom, t), roll: lerp(a.roll, b.roll, t)};
		}
	}
	return ps[ps.length - 1];
};

/**
 * Multi-plane 2.5D camera: every layer sits at its own depth and the camera pans / pushes / rolls through them with
 * a pinhole model, so near layers sweep and swell more than far ones. Optional depth-of-field blur, haze between
 * the layers and handheld shake. Plays over the whole <Sequence> (default path) or along `moves`.
 */
export const ParallaxStack: React.FC<ParallaxStackProps> = ({
	layers,
	moves,
	reach = 0.3,
	focusDepth = 0.6,
	depthBlur = 7,
	shake = 0,
	haze = null,
	hazeAmount = 0.35,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const {width, height, durationInFrames} = useVideoConfig();
	const path = moves ?? [
		{at: 0, x: -0.55, y: 0.08, zoom: 1},
		{at: Math.max(1, durationInFrames - 1), x: 0.55, y: -0.05, zoom: 1.45},
	];
	const pose = poseAt(frame, path);
	const c = 1 - 1 / Math.max(1, pose.zoom);
	const sorted = [...layers].sort((a, b) => a.depth - b.depth);
	const norm = Math.max(focusDepth, 1 - focusDepth, 0.01);
	const sx = shake * u * noise2D('par-x', frame * 0.09, 0);
	const sy = shake * u * noise2D('par-y', frame * 0.09, 7);
	const sr = shake * 0.02 * noise2D('par-r', frame * 0.07, 3);
	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			<AbsoluteFill style={{transform: `rotate(${pose.roll + sr}deg)`}}>
				{sorted.map((l, i) => {
					// k: how close the layer is, as a share of the nearest plane (never 0, so even the sky drifts a little)
					const k = 0.12 + 0.88 * l.depth;
					const den = Math.max(0.25, 1 - c * k);
					const tx = (-pose.x * reach * width * k) / den + sx * k;
					const ty = (-pose.y * reach * height * k) / den + sy * k;
					const blur = l.blur ?? depthBlur * u * Math.pow(Math.abs(l.depth - focusDepth) / norm, 1.3);
					const veil = haze ? hazeAmount * Math.pow(1 - clamp01(l.depth), 1.4) : 0;
					return (
						<React.Fragment key={i}>
							<AbsoluteFill
								style={{
									transform: `translate(${tx}px, ${ty}px) scale(${1 / den})`,
									filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
								}}
							>
								{l.node}
							</AbsoluteFill>
							{veil > 0.01 && i < sorted.length - 1 ? (
								<AbsoluteFill style={{background: `linear-gradient(0deg, ${haze} 0%, transparent 65%)`, opacity: veil}} />
							) : null}
						</React.Fragment>
					);
				})}
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

// ---- demo scenery ---------------------------------------------------------------------------------------

const Sky: React.FC = () => (
	<AbsoluteFill>
		<BleedSvg s={2.4}>
			<defs>
				<linearGradient id="ps-sky" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#0d0b1f" />
					<stop offset="0.42" stopColor="#3a1d6e" />
					<stop offset="0.7" stopColor="#e2475a" />
					<stop offset="0.86" stopColor="#ffb36b" />
				</linearGradient>
				<radialGradient id="ps-moon">
					<stop offset="0.55" stopColor="#fff4d6" />
					<stop offset="1" stopColor="#ffd08a" stopOpacity={0} />
				</radialGradient>
			</defs>
			<rect x={-1000} y={-600} width={3300} height={1500} fill="url(#ps-sky)" />
			<Stars seed={3} x0={-900} x1={2200} y0={-500} y1={330} count={160} />
			<circle cx={900} cy={190} r={150} fill="url(#ps-moon)" opacity={0.7} />
			<circle cx={900} cy={190} r={84} fill="#fff4d6" />
			<circle cx={928} cy={172} r={84} fill="#f2d9c0" opacity={0.55} />
		</BleedSvg>
	</AbsoluteFill>
);

const City: React.FC<{seed: number; base: number; minH: number; maxH: number; fill: string; lit: string; chance: number}> = ({seed, base, minH, maxH, fill, lit, chance}) => (
	<AbsoluteFill>
		<BleedSvg s={2.4}>
			<Skyline seed={seed} x0={-1000} x1={2300} base={base} bottom={1300} minH={minH} maxH={maxH} minW={56} maxW={130} fill={fill} lit={lit} litChance={chance} />
		</BleedSvg>
	</AbsoluteFill>
);

const Title: React.FC = () => (
	<AbsoluteFill>
		<BleedSvg s={2.4}>
			<g fontFamily={DISPLAY_FONT}>
				<text x={310} y={202} fontSize={140} textLength={680} lengthAdjust="spacingAndGlyphs" fill="none" stroke={DEMO.paper} strokeWidth={3}>
					AFTER DARK
				</text>
			</g>
		</BleedSvg>
	</AbsoluteFill>
);

const Hero: React.FC = () => (
	<AbsoluteFill>
		<BleedSvg s={2.4}>
			<rect x={-1000} y={618} width={3300} height={700} fill="#0b0720" />
			<rect x={-1000} y={618} width={3300} height={5} fill={DEMO.cyan} opacity={0.7} />
			<g transform="translate(470 626) scale(1.55)">
				<Figure />
			</g>
			<rect x={1010} y={480} width={8} height={140} fill="#0b0720" />
			<circle cx={1014} cy={478} r={8} fill={DEMO.red} />
		</BleedSvg>
	</AbsoluteFill>
);

const Fore: React.FC = () => (
	<AbsoluteFill>
		<BleedSvg s={2.4}>
			<path d="M-1000 700 L2300 700 L2300 1300 L-1000 1300 Z" fill="#04030a" />
			<rect x={-60} y={-500} width={22} height={1200} fill="#04030a" />
			<rect x={-100} y={60} width={100} height={12} fill="#04030a" />
			<circle cx={-49} cy={-30} r={12} fill={DEMO.red} />
			<path d="M-50 40 Q 500 -90 1000 30 T 2200 10" stroke="#04030a" strokeWidth={5} fill="none" />
			<rect x={1210} y={-500} width={30} height={1200} fill="#04030a" />
			<path d="M1225 70 Q 1700 -60 2200 80" stroke="#04030a" strokeWidth={4} fill="none" />
		</BleedSvg>
	</AbsoluteFill>
);

const Bokeh: React.FC = () => (
	<AbsoluteFill>
		<BleedSvg s={2.4}>
			{[
				[160, 560, 90, DEMO.yellow],
				[760, 640, 120, DEMO.red],
				[1130, 120, 70, DEMO.cyan],
				[420, 40, 60, DEMO.yellow],
				[1500, 500, 110, DEMO.red],
			].map(([x, y, r, col], i) => (
				<circle key={i} cx={x as number} cy={y as number} r={r as number} fill={col as string} opacity={0.28} />
			))}
		</BleedSvg>
	</AbsoluteFill>
);

const Demo: React.FC = () => (
	<ParallaxStack
		haze="#3a1d6e"
		shake={1.2}
		layers={[
			{node: <Sky />, depth: 0},
			{node: <City seed={3} base={505} minH={90} maxH={230} fill="#52277f" lit="#ffd08a" chance={0.07} />, depth: 0.18},
			{node: <City seed={7} base={592} minH={70} maxH={210} fill="#1d1040" lit="#29e0ff" chance={0.15} />, depth: 0.38},
			{node: <Title />, depth: 0.5},
			{node: <Hero />, depth: 0.62},
			{node: <Fore />, depth: 1},
			{node: <Bokeh />, depth: 1.5},
		]}
	/>
);

export const parallaxStackEntry: LibraryEntry = {
	meta: {
		id: 'parallax-stack',
		title: 'Parallax stack',
		category: 'camera',
		looks: 'Seven depth layers (sky to foreground) slide at different speeds as the camera pans right and pushes in 1.45x, with depth blur and haze.',
		use: 'Bringing a painted key art or a layered character shot to life; establishing shots and title backgrounds.',
		exportName: 'ParallaxStack',
		durationInFrames: 96,
		source: {
			kind: 'inspired',
			name: 'Remocn Stage',
			url: 'https://github.com/Remocn/remocn/blob/main/registry/remocn/stage/index.tsx',
		},
	},
	Demo,
};
