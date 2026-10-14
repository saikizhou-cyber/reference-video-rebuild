// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/light-play-moves/HalationBloom.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Modified. Changes: made it a wrapper for any element or scene, three stacked blur layers instead of one, optional flat-colour / halation tint, hit list, tunable pop / fall / settle, spring punch on the element, flicker, resolution-independent units. The punch and the layering are original.
import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {SPRINGS} from '../../core/easing';
import {Backdrop, BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp, FlatColorFilter, hash, useSafeId} from './_hits-utils';

export type GlowProps = {
	/** frames (inside the surrounding <Sequence>) where the glow blooms; a list for several hits. No hits = a steady glow */
	hits?: number | number[];
	/** flat glow colour (neon). null = the element's own colours, brightened (halation / bloom of real highlights) */
	color?: string | null;
	/** tint of the widest layer, e.g. a film-red halation around white highlights */
	halation?: string | null;
	/** blur of the main layer, px at 720p (the other two layers are 0.25x and 3x) */
	radius?: number;
	/** brightness applied to the glow copies when `color` is null */
	boost?: number;
	/** overall multiplier of the glow */
	intensity?: number;
	/** steady level after a hit / without hits (0..1+). default 0.25 with hits, 0.6 without */
	rest?: number;
	/** level before the first hit (default 0 with hits) */
	idle?: number;
	/** frames the bloom swells at full strength after a hit */
	pop?: number;
	/** how much the widest layer swells on a hit (1.3 = +30 %; the middle layer swells half as much) */
	popScale?: number;
	/** frames of the linear fall from the peak to 1.6x `rest` */
	fall?: number;
	/** frames of the soft settle down to `rest` */
	settle?: number;
	/** scale kick of the element itself on a hit (0.12 = +12 %, then a spring settle). 0 = none */
	punch?: number;
	/** 0..1: neon flicker (random dips, held for 2 frames) */
	flicker?: number;
	/** where the wide layers scale from, CSS transform-origin (set it to the element's centre when it is not centred) */
	origin?: string;
	seed?: number;
	style?: React.CSSProperties;
	children: React.ReactNode;
};

const LAYERS = [
	{r: 0.25, w: 1, swell: 0},
	{r: 1, w: 0.7, swell: 0.4},
	{r: 3, w: 0.9, swell: 0.8},
] as const;

/**
 * A glow / halation that lives on any element: blurred, brightened copies under it, screen-blended.
 * On a hit the wide layers swell, hold, fall and settle into a soft steady glow while the element punches.
 * Put it directly over the backdrop (no transform / opacity wrapper between) so the screen blend reaches it.
 */
export const Glow: React.FC<GlowProps> = ({
	hits,
	color = null,
	halation = null,
	radius = 18,
	boost = 1.6,
	intensity = 1,
	rest,
	idle,
	pop = 6,
	popScale = 1.25,
	fall = 20,
	settle = 15,
	punch = 0.12,
	flicker = 0,
	origin = '50% 50%',
	seed = 1,
	style,
	children,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const u = useUnit();
	const id = useSafeId('glow');
	const list = hits === undefined ? [] : Array.isArray(hits) ? hits : [hits];
	const restLevel = rest ?? (list.length > 0 ? 0.25 : 0.6);
	const idleLevel = idle ?? (list.length > 0 ? 0 : restLevel);

	const past = list.filter((h) => h <= frame);
	const since = past.length > 0 ? frame - Math.max(...past) : -1;

	// glow level: full for `pop` frames, linear fall to 1.6x rest, soft settle to rest
	const mid = restLevel * 1.6;
	let level: number;
	if (since < 0) {
		level = idleLevel;
	} else if (since < pop) {
		level = 1;
	} else if (since < pop + fall) {
		level = interpolate(since, [pop, pop + fall], [1, mid]);
	} else {
		level = interpolate(since, [pop + fall, pop + fall + settle], [mid, restLevel], {
			easing: Easing.out(Easing.quad),
			extrapolateRight: 'clamp',
		});
	}
	if (flicker > 0) {
		const f = hash(Math.floor(frame / 2) * 3.1 + seed * 17.3);
		level *= 1 - flicker * (f > 0.78 ? 0.25 + 0.75 * ((f - 0.78) / 0.22) : 0);
	}
	// the wide layers swell fast on the hit, then relax most of the way back while the level falls (spread and fade are decoupled)
	const swellUp = since >= 0 ? Easing.out(Easing.cubic)(clamp(since / Math.max(1, pop), 0, 1)) : 0;
	const relax = since > pop ? Easing.out(Easing.quad)(clamp((since - pop) / Math.max(1, fall + settle), 0, 1)) : 0;
	const swell = swellUp * (1 - 0.6 * relax);

	const kick =
		punch > 0 && since >= 0 ? spring({frame: since, fps, config: SPRINGS.punch, from: 1 + punch, to: 1}) : 1;

	const flat = color !== null;
	const filterFor = (r: number, wide: boolean): string => {
		const px = `${(r * radius * u).toFixed(1)}px`;
		if (wide && halation) {
			return `url(#${id}-h) blur(${px})`;
		}
		return flat ? `url(#${id}-c) blur(${px})` : `brightness(${boost}) contrast(1.35) saturate(1.25) blur(${px})`;
	};

	return (
		<AbsoluteFill style={style}>
			{flat ? <FlatColorFilter id={`${id}-c`} color={color as string} /> : null}
			{halation ? <FlatColorFilter id={`${id}-h`} color={halation} /> : null}
			{LAYERS.map((l, i) => (
				<AbsoluteFill
					key={i}
					style={{
						mixBlendMode: 'screen',
						opacity: clamp(level * l.w * intensity, 0, 1),
						filter: filterFor(l.r, i === LAYERS.length - 1),
						transform: `scale(${kick * (1 + (popScale - 1) * swell * l.swell)})`,
						transformOrigin: origin,
					}}
				>
					{children}
				</AbsoluteFill>
			))}
			<AbsoluteFill style={{transform: kick === 1 ? undefined : `scale(${kick})`, transformOrigin: origin}}>{children}</AbsoluteFill>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => {
	const u = useUnit();
	return (
		<Backdrop>
			<Glow hits={[14, 46]} halation="#ff3b2e" radius={18} punch={0.1}>
				<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
					<div style={{fontFamily: DISPLAY_FONT, fontSize: 250 * u, lineHeight: 0.95, color: '#fff3e0', letterSpacing: -4 * u, textAlign: 'center'}}>
						FULL
						<br />
						BURN
					</div>
				</AbsoluteFill>
			</Glow>
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					bottom: 54 * u,
					textAlign: 'center',
					fontFamily: BODY_FONT,
					fontWeight: 800,
					fontSize: 24 * u,
					letterSpacing: 12 * u,
					color: DEMO.cyan,
					opacity: 0.8,
				}}
			>
				HALATION ON IMPACT
			</div>
		</Backdrop>
	);
};

export const glowEntry: LibraryEntry = {
	meta: {
		id: 'glow',
		title: 'Glow / halation',
		category: 'fx',
		looks:
			'Three blurred, brightened copies sit under the element and screen onto the backdrop; on a hit the wide layers swell and flare at full strength, fall over 20 frames and settle into a soft steady glow while the element punches.',
		use: 'Neon text, logos and hero props; the bloom that follows a slam or a beat hit.',
		notes: 'Give its parent a real size (a full-frame container or a `<Place>` box): in an absolutely positioned div without width and height its root is 0 x 0 and the halo drifts off the element (measured +45 px / +12 px).',
		exportName: 'Glow',
		durationInFrames: 75,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (HalationBloom)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/light-play-moves/HalationBloom.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
