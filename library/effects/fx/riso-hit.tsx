// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/riso-print-hits/RisoMisregistrationHit.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Modified. Changes: made it a wrapper for any element (plates are flat-colour copies of the children via an SVG filter), added hit list with escalating offset, offset angle, beat pump scale, overprint helper, resolution-independent units.
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {Backdrop, BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {FlatColorFilter, useSafeId} from './_hits-utils';

export type RisoHitProps = {
	/** frame(s) (inside the surrounding <Sequence>) where the plates fall out of register */
	hits?: number | number[];
	/** the two ink plates, multiplied together. Make the children's own colour the overprint of both (see `overprint`) */
	plates?: [string, string];
	/** first-swing offset of each plate, px at 720p (the plates move in opposite directions) */
	amplitude?: number;
	/** direction of the offset in degrees (0 = horizontal) */
	angle?: number;
	/** frames per oscillation */
	period?: number;
	/** time constant of the decay in frames (bigger = more visible shakes) */
	decay?: number;
	/** frames after a hit until the plates snap back into register */
	duration?: number;
	/** every further hit adds this share of the amplitude (0.4 = +40 % per hit) */
	escalate?: number;
	/** scale jump on each hit, decaying fast (exp(-t/3)) */
	pump?: number;
	/** scale pulse over 4 frames when the plates re-register */
	register?: number;
	children: React.ReactNode;
};

/** Multiply two #rrggbb colours: the colour two overprinted inks make. */
export const overprint = (a: string, b: string): string => {
	const ch = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
	const hex = (i: number) => Math.round((ch(a, i) * ch(b, i)) / 255).toString(16).padStart(2, '0');
	return `#${hex(0)}${hex(1)}${hex(2)}`;
};

const PINK = '#ff4f93';
const BLUE = '#2f55ff';

/**
 * On a hit the element splits into two single-colour plates that multiply together and swing in opposite directions
 * with a decaying offset, then re-register into the normal element with a small scale pulse. Works on elements with
 * transparent surroundings (text, logos, props).
 */
export const RisoHit: React.FC<RisoHitProps> = ({
	hits = 12,
	plates = [PINK, BLUE],
	amplitude = 16,
	angle = 20,
	period = 10,
	decay = 22,
	duration = 30,
	escalate = 0.4,
	pump = 0.05,
	register = 0.03,
	children,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const id = useSafeId('riso');
	const list = (Array.isArray(hits) ? [...hits] : [hits]).sort((a, b) => a - b);
	const past = list.filter((h) => h <= frame);
	const idx = past.length - 1;
	const t = idx >= 0 ? frame - past[idx] : -1;
	const splitting = t >= 0 && t < duration;

	if (!splitting) {
		const pulse =
			t >= duration && t < duration + 4 ? 1 + register * (1 - (t - duration) / 4) : 1;
		return <AbsoluteFill style={{transform: pulse === 1 ? undefined : `scale(${pulse})`}}>{children}</AbsoluteFill>;
	}

	const amp = amplitude * u * (1 + escalate * idx);
	const m = Math.cos((2 * Math.PI * t) / period) * Math.exp(-t / decay);
	const rad = (angle * Math.PI) / 180;
	const dx = amp * m * Math.cos(rad);
	const dy = amp * m * Math.sin(rad);
	const scale = 1 + pump * Math.exp(-t / 3);

	return (
		<AbsoluteFill style={{isolation: 'isolate', transform: `scale(${scale})`}}>
			<FlatColorFilter id={`${id}-a`} color={plates[0]} />
			<FlatColorFilter id={`${id}-b`} color={plates[1]} />
			<AbsoluteFill style={{filter: `url(#${id}-a)`, transform: `translate(${-dx}px, ${-dy}px)`}}>{children}</AbsoluteFill>
			<AbsoluteFill style={{filter: `url(#${id}-b)`, transform: `translate(${dx}px, ${dy}px)`, mixBlendMode: 'multiply'}}>
				{children}
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

const PAPER = '#f1ecdf';

const Title: React.FC<{u: number}> = ({u}) => (
	<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
		<div
			style={{
				fontFamily: DISPLAY_FONT,
				fontSize: 270 * u,
				lineHeight: 0.92,
				letterSpacing: -4 * u,
				color: overprint(PINK, BLUE),
				textAlign: 'center',
			}}
		>
			MIS
			<br />
			PRINT
		</div>
	</AbsoluteFill>
);

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const slide = interpolate(frame, [0, 10], [900, 0], {
		easing: Easing.in(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	return (
		<Backdrop color={PAPER}>
			<AbsoluteFill style={{transform: `translateX(${slide * u}px)`}}>
				<RisoHit hits={[10, 44]}>
					<Title u={u} />
				</RisoHit>
			</AbsoluteFill>
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					bottom: 52 * u,
					textAlign: 'center',
					fontFamily: BODY_FONT,
					fontWeight: 800,
					fontSize: 24 * u,
					letterSpacing: 10 * u,
					color: DEMO.ink,
					opacity: 0.75,
				}}
			>
				TWO INKS / ONE PASS
			</div>
		</Backdrop>
	);
};

export const risoHitEntry: LibraryEntry = {
	meta: {
		id: 'riso-hit',
		title: 'Riso hit',
		category: 'fx',
		looks:
			'On impact the element splits into a pink and a blue single-colour plate that multiply and swing in opposite directions with a decaying offset, then snap into register with a small scale pulse.',
		use: 'Print-flavoured titles and logo stings; a second, harder hit on the next beat.',
		exportName: 'RisoHit',
		durationInFrames: 75,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (RisoMisregistrationHit)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/riso-print-hits/RisoMisregistrationHit.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
