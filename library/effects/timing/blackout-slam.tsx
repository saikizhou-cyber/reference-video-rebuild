// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/montage-rhythm-moves/DropBlackoutSlam.tsx and .../trailer-grammar-moves/SmashCut.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Changes: lead-in footage and slam scene are caller-supplied, timings and strengths are props, the smash-cut surge (accelerating push + roll into the cut) is a lead mode, font-fitted slam word, 720p-unit scaling. Modified.
import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {BODY_FONT, DEMO, DISPLAY_FONT, SceneA, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {fitFont, shakeOffset} from './_edits-utils';

export type BlackoutSlamProps = {
	/** the footage that plays normally before the black */
	children?: React.ReactNode;
	/** the scene that lands after the black. Default: `word` in big type on `slamBackground` */
	slam?: React.ReactNode;
	word?: string;
	/** frame at which playback cuts to black */
	at?: number;
	/** frames of dead black (silence). 0 = a straight smash cut with no black */
	black?: number;
	blackColor?: string;
	/**
	 * What the lead-in footage does until the cut:
	 * 'breathe' = a slow +-1 % scale pulse, 'surge' = an ever-accelerating push and roll (the smash cut: never decelerate into it), 'none'
	 */
	lead?: 'breathe' | 'surge' | 'none';
	/** zoom the surge reaches at the cut */
	surge?: number;
	/** degrees of roll the surge reaches at the cut */
	surgeRoll?: number;
	/** the slam scene starts this much zoomed in and snaps to 1 (1 = no punch) */
	punch?: number;
	/** frames the punch takes */
	punchFrames?: number;
	/** peak shake of the slam, px at 720p, decaying over ~12 frames (0 = none) */
	shake?: number;
	/** expanding ring that blooms from the centre of the slam */
	ring?: boolean;
	ringColor?: string;
	/** opacity of the white flash on the first frame of the slam (0 = none) */
	flash?: number;
	slamBackground?: string;
	color?: string;
	/** px at 720p, shrunk automatically so the word fits */
	fontSize?: number;
	fontFamily?: string;
	seed?: number;
};

/**
 * The other classic, the smash cut from roar to stillness: no black, the lead-in surges (an ever-accelerating push
 * and roll, never decelerating into the cut) and the next frame is a calm, static `slam` scene with no punch, shake,
 * ring or flash. Spread it over the props: `<BlackoutSlam {...SMASH_CUT} slam={<CalmWide />}>{roar}</BlackoutSlam>`.
 */
export const SMASH_CUT = {black: 0, lead: 'surge', punch: 1, shake: 0, ring: false, flash: 0} as const satisfies Partial<BlackoutSlamProps>;

/**
 * Silence, then the hit: footage plays, cuts to dead black for a beat, and the slam scene lands with a
 * punch-in, a decaying shake, a flash and a ring. For the roar that smash-cuts to stillness, spread SMASH_CUT
 * (black 0, lead "surge", punch 1, shake 0, ring false, flash 0) and give it a calm `slam` scene.
 */
export const BlackoutSlam: React.FC<BlackoutSlamProps> = ({
	children,
	slam,
	word = 'DROP',
	at = 50,
	black = 12,
	blackColor = '#0c0c0c',
	lead = 'breathe',
	surge = 1.55,
	surgeRoll = 1.8,
	punch = 1.35,
	punchFrames = 5,
	shake = 10,
	ring = true,
	ringColor = '#ffffff',
	flash = 0.55,
	slamBackground = DEMO.ink,
	color = '#ffffff',
	fontSize = 340,
	fontFamily = DISPLAY_FONT,
	seed = 1,
}) => {
	const frame = useCurrentFrame();
	const {width} = useVideoConfig();
	const u = useUnit();
	const slamAt = at + black;

	// 1) normal playback
	if (frame < at) {
		let scale = 1;
		let roll = 0;
		if (lead === 'breathe') {
			scale = 1.01 + 0.01 * Math.sin((frame / 48) * Math.PI * 2);
		} else if (lead === 'surge') {
			const p = Easing.in(Easing.quad)(Math.min(1, frame / Math.max(1, at)));
			scale = 1 + (surge - 1) * p;
			roll = surgeRoll * p;
		}
		return (
			<AbsoluteFill style={{overflow: 'hidden', background: blackColor}}>
				<AbsoluteFill style={{transform: `scale(${scale}) rotate(${roll}deg)`, transformOrigin: '50% 50%'}}>{children}</AbsoluteFill>
			</AbsoluteFill>
		);
	}

	// 2) dead black: not a single thing on screen
	if (frame < slamAt) {
		return <AbsoluteFill style={{background: blackColor}} />;
	}

	// 3) the slam
	const t = frame - slamAt;
	const z = interpolate(t, [0, Math.max(1, punchFrames)], [punch, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const amp = shake > 0 && t < 14 ? shake * Math.exp(-t / 2.5) : 0;
	const sh = shakeOffset(frame, amp * u, seed);
	const ringR = interpolate(t, [0, 16], [80 * u, 900 * u], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const ringOpacity = interpolate(t, [0, 3, 16], [0.85, 0.55, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const flashOpacity = interpolate(t, [0, 4], [flash, 0], {easing: Easing.in(Easing.quad), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const size = fitFont(word, width * 0.8, fontSize * u, fontFamily, '-0.02em');
	const scene =
		slam ?? (
			<AbsoluteFill style={{background: slamBackground, alignItems: 'center', justifyContent: 'center'}}>
				<div
					style={{
						fontFamily,
						fontSize: size,
						lineHeight: 1,
						letterSpacing: '-0.02em',
						color,
						whiteSpace: 'nowrap',
					}}
				>
					{word}
				</div>
			</AbsoluteFill>
		);
	return (
		<AbsoluteFill style={{overflow: 'hidden', background: slamBackground}}>
			<AbsoluteFill style={{transform: `translate(${sh.x}px, ${sh.y}px) scale(${z})`, transformOrigin: '50% 50%'}}>{scene}</AbsoluteFill>
			{ring && t < 16 ? (
				<div
					style={{
						position: 'absolute',
						left: '50%',
						top: '50%',
						width: ringR * 2,
						height: ringR * 2,
						marginLeft: -ringR,
						marginTop: -ringR,
						borderRadius: '50%',
						border: `${10 * u}px solid ${ringColor}`,
						opacity: ringOpacity,
					}}
				/>
			) : null}
			{flash > 0 && t < 4 ? <AbsoluteFill style={{background: '#ffffff', opacity: flashOpacity}} /> : null}
		</AbsoluteFill>
	);
};

const LEAD_AT = 48;
const METER_BARS = 11;

/** Demo footage: scene A, a beat dot that pulses every 12 frames and a level meter whose energy climbs towards the cut. */
const Lead: React.FC = () => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const phase = frame % 12;
	const on = interpolate(phase, [0, 1, 10], [0.3, 1, 0.3], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const grow = interpolate(phase, [0, 1, 10], [1, 1.5, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
	const energy = 0.2 + 0.8 * Math.min(1, frame / LEAD_AT);
	return (
		<AbsoluteFill>
			<SceneA label="A" />
			<div style={{position: 'absolute', left: 740 * u, top: 380 * u, width: 470 * u, height: 210 * u, display: 'flex', alignItems: 'flex-end', gap: 12 * u}}>
				{Array.from({length: METER_BARS}, (_, k) => {
					const wave = 0.5 + 0.5 * Math.sin(frame * 0.5 + k * 1.1 + Math.sin(k * 2.3) * 2);
					const level = Math.min(1, 0.08 + energy * (0.25 + 0.75 * wave));
					return <div key={k} style={{flex: 1, height: `${level * 100}%`, background: level > 0.8 ? DEMO.yellow : DEMO.paper}} />;
				})}
			</div>
			<div style={{position: 'absolute', left: 0, bottom: 0, height: 12 * u, width: `${Math.min(1, frame / LEAD_AT) * 100}%`, background: DEMO.yellow}} />
			<div
				style={{
					position: 'absolute',
					left: 70 * u,
					bottom: 60 * u,
					fontFamily: BODY_FONT,
					fontWeight: 800,
					fontSize: 26 * u,
					letterSpacing: 6 * u,
					color: DEMO.paper,
				}}
			>
				REC 00:{String(Math.floor(frame / 30)).padStart(2, '0')}
			</div>
			<div
				style={{
					position: 'absolute',
					left: 70 * u,
					bottom: 100 * u,
					width: 30 * u,
					height: 30 * u,
					borderRadius: '50%',
					background: DEMO.yellow,
					opacity: on,
					transform: `scale(${grow})`,
				}}
			/>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<BlackoutSlam word="AWAKEN" at={LEAD_AT}>
		<Lead />
	</BlackoutSlam>
);

export const blackoutSlamEntry: LibraryEntry = {
	meta: {
		id: 'blackout-slam',
		title: 'Blackout slam',
		category: 'timing',
		looks: 'Footage breathes along to a beat, cuts to 12 frames of dead black, then the title slams in from 1.35x with a shake, a flash and a ring.',
		use: 'The drop in a PV: silence before the title or the logo hit. Spread SMASH_CUT (black 0, lead "surge", no punch, shake, ring or flash) for the smash cut from roar to stillness.',
		exportName: 'BlackoutSlam',
		durationInFrames: 84,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (Drop Blackout Slam, Smash Cut)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/rhythm/montage-rhythm-moves/DropBlackoutSlam.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
