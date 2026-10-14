import React from 'react';
import {AbsoluteFill, Easing, Sequence, random, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {DEMO, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {TitleCard, lerp} from './_space-utils';

export type KanadaSnapProps = {
	/** the element that snaps in (a fixed-size block works best) */
	children: React.ReactNode;
	/** the side it whips in from */
	from?: 'left' | 'right' | 'top' | 'bottom';
	/** frames from the first pose to the landing */
	inFrames?: number;
	/** camera perspective in px at 720p: starts exaggerated (fisheye) and relaxes to a flat lens */
	fromPerspective?: number;
	toPerspective?: number;
	/** degrees the element is turned out of the picture plane at the start */
	fromAngle?: number;
	fromScale?: number;
	/** how far off its resting place it starts, px at 720p */
	fromOffset?: number;
	/** degrees it swings past flat on landing; settles back in `overshootFrames` */
	overshoot?: number;
	overshootFrames?: number;
	/** impact shake in px at 720p and how many frames it lasts */
	shake?: number;
	shakeFrames?: number;
	/** motion blur in px at 720p during the whip */
	blur?: number;
	/** opacity of the hard black shadow (0 = none): long and skewed on entry, a tight drop shadow once landed */
	shadow?: number;
	shadowLength?: number;
	/** resting position relative to the frame centre, px at 720p */
	position?: readonly [number, number];
	ease?: (t: number) => number;
	seed?: number;
};

const AXES = {
	left: {dir: [-1, 0], axis: [0.5, 1, 0.1], over: 'rotateY'},
	right: {dir: [1, 0], axis: [0.5, -1, -0.1], over: 'rotateY'},
	top: {dir: [0, -1], axis: [-1, 0.5, 0.1], over: 'rotateX'},
	bottom: {dir: [0, 1], axis: [1, 0.5, -0.1], over: 'rotateX'},
} as const;

/**
 * Anime-style perspective whip: the element arrives from an exaggerated fisheye 3D pose (turned ~58 degrees,
 * 1.7x, a 300 px lens) and snaps flat in a few frames, overshoots a little, shakes and drops a hard shadow.
 * Starts at frame 0 of its <Sequence>; the parent supplies the stage (it fills the frame).
 */
export const KanadaSnap: React.FC<KanadaSnapProps> = ({
	children,
	from = 'left',
	inFrames = 18,
	fromPerspective = 320,
	toPerspective = 1500,
	fromAngle = 58,
	fromScale = 1.5,
	fromOffset = 560,
	overshoot = 5,
	overshootFrames = 4,
	shake = 6,
	shakeFrames = 2,
	blur = 2.5,
	shadow = 0.55,
	shadowLength = 190,
	position = [0, 0],
	ease = Easing.bezier(0.16, 0.62, 0.22, 1),
	seed = 1,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const cfg = AXES[from];
	const e = progress(frame, 0, inFrames, ease);
	const k = 1 - e;
	const persp = lerp(fromPerspective, toPerspective, progress(frame, 0, inFrames, CURVES.expoOut)) * u;
	const since = frame - inFrames;
	const landed = since >= 0;
	// swing past flat and come back
	const over = landed && since < overshootFrames ? Math.sin((Math.PI * since) / overshootFrames) : 0;
	const sign = cfg.over === 'rotateY' ? (from === 'left' ? 1 : -1) : from === 'top' ? -1 : 1;
	const amp = landed && since < shakeFrames ? shake * u * (1 - since / shakeFrames) : 0;
	const dx = amp * (random(`${seed}-x-${frame}`) * 2 - 1);
	const dy = amp * (random(`${seed}-y-${frame}`) * 2 - 1);
	// the frame is wider than tall: top / bottom entries travel less
	const tx = cfg.dir[0] * fromOffset * u * k + position[0] * u + dx;
	const ty = cfg.dir[1] * fromOffset * 0.6 * u * k + position[1] * u + dy;
	const scale = lerp(fromScale, 1, e) * (1 + 0.03 * over);
	const [ax, ay, az] = cfg.axis;
	const pose = `translate(-50%, -50%) translate3d(${tx}px, ${ty}px, 0) rotate3d(${ax}, ${ay}, ${az}, ${fromAngle * k}deg) ${cfg.over}(${sign * overshoot * over}deg) scale(${scale})`;
	const blurPx = blur * u * Math.pow(k, 0.7);
	const flash = landed && since < 1 ? 1.3 : 1;
	const opacity = Math.min(1, 0.4 + frame * 0.3);
	// shadow: long and skewed while the element is in the air, a tight hard drop shadow when it lands
	const len = (14 + (shadowLength - 14) * Math.pow(k, 1.5)) * u;
	const shadowT = `translate(${len * 0.75}px, ${len * 0.7}px) skewX(${-k * 30}deg) scaleY(${1 + k * 0.4})`;
	return (
		<AbsoluteFill style={{perspective: `${persp}px`, perspectiveOrigin: '50% 50%'}}>
			<div
				style={{
					position: 'absolute',
					left: '50%',
					top: '50%',
					transform: pose,
					filter: `${blurPx > 0.05 ? `blur(${blurPx}px)` : ''} ${flash > 1 ? `brightness(${flash})` : ''}`.trim() || undefined,
					opacity,
				}}
			>
				{shadow > 0 ? (
					<div style={{position: 'absolute', inset: 0, transform: shadowT, transformOrigin: '50% 100%'}}>
						<div style={{filter: 'brightness(0)', opacity: shadow}}>{children}</div>
					</div>
				) : null}
				<div style={{position: 'relative'}}>{children}</div>
			</div>
		</AbsoluteFill>
	);
};

const Grid: React.FC = () => (
	<AbsoluteFill
		style={{
			opacity: 0.1,
			backgroundImage: `linear-gradient(${DEMO.paper} 1px, transparent 1px), linear-gradient(90deg, ${DEMO.paper} 1px, transparent 1px)`,
			backgroundSize: '64px 64px',
		}}
	/>
);

// five panels land on a 15-frame beat, each from a different side; the last one slams over the seam
const Demo: React.FC = () => (
	<AbsoluteFill style={{background: '#14141d', overflow: 'hidden'}}>
		<Grid />
		<Sequence from={3}>
			<KanadaSnap from="left" position={[-345, -175]} seed={1}>
				<TitleCard word="ROUND" tag="ONE / FIGHT" bg={DEMO.blue} fg={DEMO.paper} accent={DEMO.yellow} w={420} h={230} />
			</KanadaSnap>
		</Sequence>
		<Sequence from={18}>
			<KanadaSnap from="right" position={[340, -150]} seed={2}>
				<TitleCard word="NO MERCY" tag="ROUND TWO" bg={DEMO.red} fg={DEMO.ink} accent={DEMO.paper} w={420} h={230} />
			</KanadaSnap>
		</Sequence>
		<Sequence from={33}>
			<KanadaSnap from="bottom" position={[-370, 140]} seed={3} fromAngle={64}>
				<TitleCard word="GO!" tag="PRESS START" bg={DEMO.yellow} fg={DEMO.ink} accent={DEMO.red} w={400} h={190} />
			</KanadaSnap>
		</Sequence>
		<Sequence from={48}>
			<KanadaSnap from="top" position={[345, 125]} seed={4} fromAngle={62}>
				<TitleCard word="FINAL" tag="LAST CHANCE" bg={DEMO.paper} fg={DEMO.ink} accent={DEMO.blue} w={420} h={220} />
			</KanadaSnap>
		</Sequence>
		<Sequence from={63}>
			<KanadaSnap from="left" position={[-10, -5]} seed={5} fromScale={1.8} shadowLength={230}>
				<TitleCard word="VS" tag="VERSUS" bg={DEMO.cyan} fg={DEMO.ink} accent={DEMO.red} w={290} h={290} />
			</KanadaSnap>
		</Sequence>
	</AbsoluteFill>
);

export const kanadaSnapEntry: LibraryEntry = {
	meta: {
		id: 'kanada-snap',
		title: 'Kanada snap',
		category: 'camera',
		looks: 'Five panels in a row each whip in from a fisheye 3D pose (turned ~60 degrees, 1.5x, 320 px lens) and snap flat in 18 frames, swing 5 degrees past, shake and drop a hard shadow.',
		use: 'Title cards, UI panels and character cards that must land with attitude on a beat.',
		exportName: 'KanadaSnap',
		durationInFrames: 90,
		source: {
			kind: 'inspired',
			name: 'video-shotcraft KanadaPerspectiveSnap',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/slam-entrance-moves/KanadaPerspectiveSnap.tsx',
		},
	},
	Demo,
};
