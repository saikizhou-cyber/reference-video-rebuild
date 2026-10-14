import React from 'react';
import {AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {Figure, clamp01, lerp, rnd} from './_space-utils';

export type BulletTimeProps = {
	/** the scene. Its clock (useCurrentFrame) stops while the camera orbits. Give it `transform-style: preserve-3d` and translateZ layers for real parallax */
	children: React.ReactNode;
	/** frame (of this component's own clock) where the scene freezes */
	freezeAt?: number;
	/** frames to swing out to the full angle, to hover there, and to swing back; the clock resumes after all three */
	orbitIn?: number;
	apex?: number;
	orbitOut?: number;
	/** peak camera yaw in degrees */
	angle?: number;
	/** lens in px at 720p (bigger = flatter) */
	perspective?: number;
	/** scale at the apex */
	zoom?: number;
	/** sideways drift in px at 720p at the apex */
	sway?: number;
	/** wash laid over the frame while time is stopped (null = none) */
	tint?: string | null;
	/** white flash when time stops and a tinted one when it resumes */
	flash?: boolean;
	/** what sits behind the scene: laid on a plane 800 px back, 10x the frame wide and 4x tall, centred on the frame, so it slides against the scene as the camera orbits and its edge never shows. null = none */
	backdrop?: React.ReactNode | null;
};

const DefaultBackdrop: React.FC = () => (
	<div
		style={{
			position: 'absolute',
			inset: 0,
			background: `radial-gradient(ellipse 1500px 950px at 50% 50%, #1d1c52 0%, #0e0d26 55%, ${DEMO.ink} 100%)`,
		}}
	>
		<div
			style={{
				position: 'absolute',
				inset: 0,
				opacity: 0.2,
				backgroundImage: `linear-gradient(${DEMO.cyan} 2px, transparent 2px), linear-gradient(90deg, ${DEMO.cyan} 2px, transparent 2px)`,
				backgroundSize: '110px 110px',
				backgroundPosition: 'center',
			}}
		/>
	</div>
);

/**
 * Bullet time: the scene's clock freezes (its children keep rendering the frozen frame) while the camera orbits
 * through perspective yaw, hovers at the apex and swings back; then time resumes where it stopped.
 * Starts at frame 0 of its <Sequence>.
 */
export const BulletTime: React.FC<BulletTimeProps> = ({
	children,
	freezeAt = 24,
	orbitIn = 16,
	apex = 10,
	orbitOut = 16,
	angle = 55,
	perspective = 1600,
	zoom = 1.12,
	sway = 70,
	tint = DEMO.cyan,
	flash = true,
	backdrop,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const hold = orbitIn + apex + orbitOut;
	const frozen = frame >= freezeAt && frame < freezeAt + hold;
	// the scene's own clock: runs, stops at freezeAt for `hold` frames, then continues from there
	const clock = frame < freezeAt ? frame : frozen ? freezeAt : frame - hold;

	const swing = progress(frame, freezeAt, orbitIn, Easing.bezier(0.42, 0.05, 0.2, 1));
	// the arc never fully stops: 20 % of the angle is a slow creep across the swing and the hover
	const creep = progress(frame, freezeAt, orbitIn + apex, (t) => t);
	const back = progress(frame, freezeAt + orbitIn + apex, orbitOut, CURVES.inOutCubic);
	const share = (0.8 * swing + 0.2 * creep) * (1 - back);
	const yaw = angle * share;
	const scale = lerp(1, zoom, share);
	const dx = sway * u * share;

	// time-stopped feel: tint + vignette fade in over 5 frames, out over the last 5 of the hold
	const hold01 = Math.min(progress(frame, freezeAt, 5, CURVES.expoOut), 1 - progress(frame, freezeAt + hold - 5, 5, (t) => t));
	const sinceFreeze = frame - freezeAt;
	const sinceResume = frame - (freezeAt + hold);
	const flashWhite = flash && sinceFreeze >= 0 && sinceFreeze < 3 ? interpolate(sinceFreeze, [0, 3], [0.9, 0]) : 0;
	const flashTint = flash && sinceResume >= 0 && sinceResume < 3 ? interpolate(sinceResume, [0, 3], [0.45, 0]) : 0;

	const P = perspective * u;
	const bg = backdrop === undefined ? <DefaultBackdrop /> : backdrop;
	return (
		<AbsoluteFill style={{background: DEMO.ink, overflow: 'hidden'}}>
			<AbsoluteFill style={{perspective: `${P}px`, perspectiveOrigin: '50% 50%'}}>
				<div
					style={{
						position: 'absolute',
						inset: 0,
						transformStyle: 'preserve-3d',
						transform: `translateX(${dx}px) scale(${scale}) rotateY(${yaw}deg)`,
					}}
				>
					{bg ? (
						<div
							style={{
								position: 'absolute',
								left: '-450%',
								top: '-150%',
								width: '1000%',
								height: '400%',
								transform: `translateZ(${-800 * u}px)`,
							}}
						>
							{bg}
						</div>
					) : null}
					<Sequence from={frame - clock} layout="none">
						{children}
					</Sequence>
				</div>
			</AbsoluteFill>
			{tint ? <AbsoluteFill style={{background: tint, opacity: 0.16 * hold01, mixBlendMode: 'screen'}} /> : null}
			<AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,0.7) 100%)', opacity: hold01}} />
			{flashWhite > 0 ? <AbsoluteFill style={{background: '#ffffff', opacity: flashWhite}} /> : null}
			{flashTint > 0 && tint ? <AbsoluteFill style={{background: tint, opacity: flashTint}} /> : null}
		</AbsoluteFill>
	);
};

// ---- demo scene: a burst of shards on 3D layers, frozen mid-air ------------------------------------------

const COLORS = [DEMO.red, DEMO.yellow, DEMO.paper, DEMO.cyan, DEMO.blue, DEMO.paper];
const SHARDS = 46;
const SHAPES = [
	'polygon(50% 0, 100% 100%, 0 100%)',
	'polygon(50% 0, 100% 38%, 50% 100%, 0 38%)',
	'polygon(35% 0, 100% 0, 65% 100%, 0 100%)',
];

const Slot: React.FC<{x: number; y: number; z: number; w: number; h: number; rot?: string; style?: React.CSSProperties; children?: React.ReactNode}> = ({
	x,
	y,
	z,
	w,
	h,
	rot = '',
	style,
	children,
}) => (
	<div
		style={{
			position: 'absolute',
			left: '50%',
			top: '50%',
			width: w,
			height: h,
			marginLeft: -w / 2,
			marginTop: -h / 2,
			transform: `translate3d(${x}px, ${y}px, ${z}px) ${rot}`,
			...style,
		}}
	>
		{children}
	</div>
);

const BulletScene: React.FC = () => {
	const t = useCurrentFrame();
	const u = useUnit();
	const go = Math.max(0, t - 3);
	const tau = 40;
	const ring = progress(t, 3, 40, CURVES.expoOut);
	const fade = 1 - progress(t, 46, 14, (x) => x);
	const charge = 1 - progress(t, 0, 6, CURVES.expoOut);
	return (
		<div style={{position: 'absolute', inset: 0, transformStyle: 'preserve-3d'}}>
			<Slot x={0} y={-40 * u} z={-330 * u} w={1500 * u} h={420 * u} style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
				<div
					style={{
						fontFamily: DISPLAY_FONT,
						fontSize: 400 * u,
						lineHeight: 1,
						color: 'transparent',
						WebkitTextStroke: `${4 * u}px ${DEMO.paper}`,
						opacity: 0.4,
						whiteSpace: 'nowrap',
					}}
				>
					HOLD
				</div>
			</Slot>
			<Slot x={0} y={0} z={-90 * u} w={900 * u} h={900 * u}>
				<div
					style={{
						width: '100%',
						height: '100%',
						borderRadius: '50%',
						border: `${14 * u}px solid ${DEMO.yellow}`,
						transform: `scale(${0.12 + ring * 0.88})`,
						opacity: (1 - ring) * 0.95 * fade,
					}}
				/>
			</Slot>
			<Slot x={0} y={0} z={-60 * u} w={900 * u} h={900 * u}>
				<div
					style={{
						width: '100%',
						height: '100%',
						borderRadius: '50%',
						border: `${5 * u}px solid ${DEMO.red}`,
						transform: `scale(${0.05 + progress(t, 5, 40, CURVES.expoOut) * 0.7})`,
						opacity: (1 - progress(t, 5, 40, CURVES.expoOut)) * fade,
					}}
				/>
			</Slot>
			{charge > 0.02 ? (
				<Slot x={0} y={0} z={20 * u} w={600 * u} h={600 * u}>
					<div style={{width: '100%', height: '100%', borderRadius: '50%', background: '#ffffff', transform: `scale(${charge})`}} />
				</Slot>
			) : null}
			{/* the figure at the centre of it: a stack of slices so it has thickness when the camera comes round */}
			{Array.from({length: 7}, (_, k) => {
				const front = k === 6;
				const shade = k / 6;
				const mix = (a: number, b: number) => Math.round(a + (b - a) * shade);
				return (
					<Slot key={k} x={0} y={10 * u} z={(k - 6) * 9 * u + 30 * u} w={560 * u} h={620 * u}>
						<svg viewBox="-190 -300 380 330" style={{width: '100%', height: '100%', overflow: 'visible'}}>
							<g transform="scale(1.15)">
								<Figure
									fill={front ? DEMO.paper : `rgb(${mix(30, 200)},${mix(28, 196)},${mix(72, 190)})`}
									rim={front ? DEMO.cyan : 'none'}
									accent={front ? DEMO.red : `rgb(${mix(60, 200)},${mix(16, 40)},${mix(24, 30)})`}
								/>
							</g>
						</svg>
					</Slot>
				);
			})}
			{Array.from({length: SHARDS}, (_, i) => {
				const th = rnd('th', i) * Math.PI * 2;
				const ph = Math.acos(1 - 2 * rnd('ph', i));
				const v = (10 + rnd('v', i) * 16) * u;
				const dist = v * tau * (1 - Math.exp(-go / tau));
				const dir = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th) * 0.75, Math.cos(ph)];
				const size = (22 + rnd('s', i) * 54) * u;
				const sp = [rnd('a', i) - 0.5, rnd('b', i) - 0.5, rnd('c', i) - 0.5].map((x) => x * 14);
				return (
					<Slot
						key={i}
						x={dir[0] * dist}
						y={dir[1] * dist}
						z={dir[2] * dist * 0.6}
						w={size}
						h={size * (0.9 + rnd('h', i) * 1.2)}
						rot={`rotateX(${sp[0] * go}deg) rotateY(${sp[1] * go}deg) rotateZ(${sp[2] * go + rnd('r', i) * 360}deg)`}
						style={{
							background: COLORS[i % COLORS.length],
							clipPath: SHAPES[i % SHAPES.length],
							opacity: clamp01(go / 2) * fade,
						}}
					/>
				);
			})}
		</div>
	);
};

const Demo: React.FC = () => (
	<BulletTime freezeAt={22} orbitIn={16} apex={10} orbitOut={16}>
		<BulletScene />
	</BulletTime>
);

export const bulletTimeEntry: LibraryEntry = {
	meta: {
		id: 'bullet-time',
		title: 'Bullet time',
		category: 'camera',
		looks: 'The burst freezes mid-air while the camera yaws 55 degrees around it through 3D layers, hovers, swings back, and time resumes.',
		use: 'The hit that deserves a second look: an impact, a jump, a reveal; pairs with a bass drop.',
		exportName: 'BulletTime',
		durationInFrames: 100,
		source: {
			kind: 'inspired',
			name: 'video-shotcraft Bullet-Time Freeze Orbit',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/camera/tension-camera-moves/BulletTimeFreezeOrbit.tsx',
		},
	},
	Demo,
};
