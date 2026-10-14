// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/impact-feedback/HitCounter.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: the hard-wired frame remap becomes a wrapper that freezes any children on caller-given hit frames, plus a reusable hitStopTime() clock, per-hit stop/power, flash + shake + exp scale/brightness pump (beat-pulse idea), 720p-unit scaling; the demo's cards, damage numbers and combo counter are rebuilt. Modified.
import React from 'react';
import {AbsoluteFill, Easing, Freeze, interpolate, useCurrentFrame} from 'remotion';
import {BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {shakeOffset} from './_edits-utils';

/** A hit, in the CHILDREN's own time: a frame number, or the frame plus its own stop length and strength. */
export type HitSpec = number | {at: number; stop?: number; power?: number};

export type HitStopProps = {
	children?: React.ReactNode;
	/** the frames of the children's animation on which a hit lands (their own clock, before any freezing) */
	hits: HitSpec[];
	/** extra frames the picture holds on each hit frame (stop 0 = no freeze and no flash, just the pump and the shake) */
	stop?: number;
	/** colour of the flash on the first frames of the freeze (null = none; a hit with stop 0 never flashes) */
	flash?: string | null;
	/** peak opacity of that flash */
	flashPeak?: number;
	/** peak shake in px at 720p, starting on the hit and decaying over ~10 frames */
	shake?: number;
	/** scale pump (share) at the hit, decaying with the time constant `decay` */
	punch?: number;
	/** brightness pump (share) at the hit */
	glow?: number;
	/** frames: time constant of the pumps */
	decay?: number;
	seed?: number;
};

type Hit = {at: number; stop: number; power: number; real: number};

const normalise = (hits: readonly HitSpec[], stop: number): Hit[] => {
	const list = hits
		.map((h) => (typeof h === 'number' ? {at: h, stop, power: 1} : {at: h.at, stop: h.stop ?? stop, power: h.power ?? 1}))
		.sort((a, b) => a.at - b.at);
	let held = 0;
	return list.map((h) => {
		const out = {...h, real: h.at + held};
		held += h.stop;
		return out;
	});
};

/**
 * The hit-stop clock. Given the real frame it returns the children's animation time (frozen on each hit),
 * the index of the latest hit and the real frames since it landed. Drive any sibling layer from `time`
 * to keep it in step with the frozen picture.
 */
export const hitStopTime = (
	frame: number,
	hits: readonly HitSpec[],
	stop = 2,
): {time: number; index: number; since: number; frozen: boolean} => {
	const list = normalise(hits, stop);
	let time = frame;
	let index = -1;
	for (let i = 0; i < list.length; i++) {
		const h = list[i];
		time -= Math.min(Math.max(frame - h.real, 0), h.stop);
		if (frame >= h.real) {
			index = i;
		}
	}
	const since = index >= 0 ? frame - list[index].real : Infinity;
	return {time, index, since, frozen: index >= 0 && since >= 1 && since <= list[index].stop};
};

/**
 * Game-feel hit-stop: on every hit frame the whole picture holds for `stop` frames (every layer inside, because
 * the children's clock is remapped), with a flash on the freeze, a decaying shake and a scale/brightness pump
 * that carries on after it thaws. Don't stack with <SpeedRamp> on the same shot: both remap the clock.
 */
export const HitStop: React.FC<HitStopProps> = ({
	children,
	hits,
	stop = 2,
	flash = '#ffffff',
	flashPeak = 0.6,
	shake = 8,
	punch = 0.04,
	glow = 0.25,
	decay = 5,
	seed = 1,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const list = normalise(hits, stop);
	const {time, index, since} = hitStopTime(frame, hits, stop);
	const hit = index >= 0 ? list[index] : null;

	let white = 0;
	let dx = 0;
	let dy = 0;
	let scale = 1;
	let bright = 1;
	if (hit) {
		const p = hit.power;
		const pulse = Math.exp(-since / Math.max(0.1, decay));
		scale = 1 + punch * p * pulse;
		bright = 1 + glow * p * pulse;
		const amp = shake > 0 && since < 14 ? shake * p * u * Math.exp(-since / 3) : 0;
		({x: dx, y: dy} = shakeOffset(frame, amp, seed));
		const flashLen = hit.stop + 1;
		if (flash && hit.stop > 0 && since < flashLen) {
			white = flashPeak * p * (1 - since / flashLen);
		}
	}
	return (
		<AbsoluteFill style={{overflow: 'hidden'}}>
			<AbsoluteFill
				style={{
					transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
					transformOrigin: '50% 50%',
					filter: bright > 1.001 ? `brightness(${bright})` : undefined,
				}}
			>
				<Freeze frame={time}>{children}</Freeze>
			</AbsoluteFill>
			{white > 0 && flash ? <AbsoluteFill style={{background: flash, opacity: Math.min(1, white)}} /> : null}
		</AbsoluteFill>
	);
};

// ---- demo ----------------------------------------------------------------------------------------------------

const HITS = [24, 54, 85];
const CARDS = [
	{bg: DEMO.blue, fg: DEMO.paper, glyph: '1', dmg: '+120'},
	{bg: DEMO.red, fg: DEMO.paper, glyph: '2', dmg: '+240'},
	{bg: DEMO.cyan, fg: DEMO.ink, glyph: '3', dmg: '+480'},
];
const PEAKS = [1.3, 1.45, 1.6];
const TILTS = [-2, -4, -6];

/** Demo footage: three cards slam into three slots, 30 frames apart, damage numbers pop, a combo counter climbs. Knows nothing about the freeze. */
const Brawl: React.FC = () => {
	const t = useCurrentFrame();
	const u = useUnit();
	const slotW = 300;
	const slotH = 330;
	const slotY = 345;
	const xs = [190, 490, 790];
	const count = HITS.filter((h) => t >= h).length;
	const last = count > 0 ? t - HITS[count - 1] : 0;
	return (
		<AbsoluteFill style={{background: DEMO.ink, overflow: 'hidden'}}>
			<AbsoluteFill
				style={{opacity: 0.08, backgroundImage: `repeating-linear-gradient(-30deg, #ffffff 0 ${4 * u}px, transparent ${4 * u}px ${44 * u}px)`}}
			/>
			{xs.map((x) => (
				<div key={x} style={{position: 'absolute', left: x * u, top: slotY * u, width: slotW * u, height: slotH * u, border: `${4 * u}px dashed ${DEMO.grey}`, boxSizing: 'border-box'}} />
			))}
			{HITS.map((hit, i) => {
				if (t < hit - 10) {
					return null;
				}
				const y = interpolate(t, [hit - 10, hit], [-400, slotY], {easing: Easing.in(Easing.quad), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
				const squash = t >= hit ? 1 - 0.07 * Math.exp(-(t - hit) / 1.5) : 1;
				const c = CARDS[i];
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: xs[i] * u,
							top: y * u,
							width: slotW * u,
							height: slotH * u,
							background: c.bg,
							transform: `scaleY(${squash})`,
							transformOrigin: 'bottom center',
							overflow: 'hidden',
						}}
					>
						<div style={{position: 'absolute', left: 0, right: 0, top: 0, height: 14 * u, background: DEMO.ink, opacity: 0.35}} />
						<div style={{position: 'absolute', left: 0, right: 0, top: 70 * u, textAlign: 'center', fontFamily: DISPLAY_FONT, fontSize: 190 * u, lineHeight: 1, color: c.fg}}>{c.glyph}</div>
					</div>
				);
			})}
			{HITS.map((hit, i) => {
				const s = t - hit;
				if (s < 0 || s > 14) {
					return null;
				}
				const sc = interpolate(s, [0, 5], [1.4, 1], {easing: Easing.out(Easing.quad), extrapolateRight: 'clamp'});
				const rise = interpolate(s, [0, 12], [0, -64], {easing: Easing.out(Easing.quad), extrapolateRight: 'clamp'});
				const op = interpolate(s, [0, 4, 12], [1, 1, 0], {extrapolateRight: 'clamp'});
				return (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: (xs[i] + slotW / 2) * u,
							top: (slotY - 20 + rise) * u,
							transform: `translateX(-50%) scale(${sc})`,
							transformOrigin: 'center bottom',
							opacity: op,
							fontFamily: DISPLAY_FONT,
							fontSize: 84 * u,
							lineHeight: 1,
							color: DEMO.yellow,
							WebkitTextStroke: `${3 * u}px ${DEMO.ink}`,
							paintOrder: 'stroke fill',
						}}
					>
						{CARDS[i].dmg}
					</div>
				);
			})}
			<div
				style={{
					position: 'absolute',
					right: 72 * u,
					top: 56 * u,
					// pivot on the top-right corner: the pump and the tilt grow the box left and down, never off the frame
					transformOrigin: 'top right',
					transform: `scale(${count > 0 ? 1 + (PEAKS[count - 1] - 1) * Math.exp(-last / 2.4) : 1}) rotate(${count > 0 ? TILTS[count - 1] : 0}deg)`,
					background: DEMO.paper,
					color: DEMO.ink,
					padding: `${4 * u}px ${28 * u}px ${10 * u}px`,
					fontFamily: DISPLAY_FONT,
					fontSize: (84 + count * 6) * u,
					lineHeight: 1.05,
					opacity: count === 0 ? 0.25 : 1,
				}}
			>
				{`X${count}`}
			</div>
			<div style={{position: 'absolute', left: 56 * u, top: 56 * u, fontFamily: BODY_FONT, fontWeight: 800, fontSize: 24 * u, letterSpacing: 7 * u, color: DEMO.paper}}>
				COMBO RUN
			</div>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<HitStop hits={HITS}>
		<Brawl />
	</HitStop>
);

export const hitStopEntry: LibraryEntry = {
	meta: {
		id: 'hit-stop',
		title: 'Hit stop',
		category: 'timing',
		looks: 'On each hit the whole picture freezes for 2 frames under a white flash and a shake, then thaws with a decaying scale and brightness pump.',
		use: 'Impact beats: a card slamming in, a sword hit, a title stamp. Put your own hit frames in; hitStopTime() keeps outside layers in step.',
		exportName: 'HitStop',
		durationInFrames: 100,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (Hit Counter)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/impact-feedback/HitCounter.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
