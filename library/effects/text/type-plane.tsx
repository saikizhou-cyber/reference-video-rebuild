import React from 'react';
import {Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {measure, mixHex} from './_display-utils';

export type PlaneCam = {
	/** camera distance to the far end of the word, as a multiple of the word's depth: 1.2 = near end almost at the lens (first letter ~6x the last), 3.4 = gentle (~1.4x) */
	d: number;
	/** where the far (last-letter) end lands on screen, px at 720p from the frame's top-left */
	fx: number;
	fy: number;
};

/** a camera pose that is reached at frame `at`; the move into it uses `ease` (progress 0..1 -> 0..1) */
export type PlaneKey = PlaneCam & {
	at: number;
	ease?: (t: number) => number;
};

export type TypePlaneProps = {
	text: string;
	/** plane yaw in degrees: the larger, the more the first letter swings toward the camera */
	yaw?: number;
	/** baseline roll in degrees (negative = the word rises to the right) */
	roll?: number;
	/** width the word is fitted to before perspective, px at 720p */
	fitW?: number;
	/** largest font size, px at 720p (short words stop here instead of being stretched to `fitW`) */
	maxSize?: number;
	/** perspective distance, px at 720p (smaller = stronger convergence) */
	perspective?: number;
	fontFamily?: string;
	fontWeight?: number | string;
	/** colour of the word's face */
	face?: string;
	/** colour of the stepped extrusion next to the face */
	ext?: string;
	/** colour of the extrusion at its foot (null = same as `ext`) */
	extDeep?: string | null;
	/** extrusion length as a share of the cap height (0 = flat word) */
	extDepth?: number;
	/**
	 * Camera track: poses reached at given frames (at least one), eased between. Before the first key the camera rests on it,
	 * after the last it stays. Keep the near end at about d >= 1.7 where the word must stay readable and bit-stable: on screen
	 * the first glyph is then below ~150 px, past ~160 px the browser draws 3D-transformed glyphs as paths and edge pixels
	 * differ by a level or two between renders.
	 */
	keys?: PlaneKey[];
	/** ghost copies of the previous frames while the camera is fast (0 = off) */
	smear?: number;
	style?: React.CSSProperties;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const PUSH = Easing.bezier(0.5, 0, 0.1, 1);

/** push in on the first letter, hold the lockup, then fly past the lens */
const DEFAULT_KEYS: PlaneKey[] = [
	{at: 3, d: 6, fx: 720, fy: 372},
	{at: 30, d: 2.6, fx: 900, fy: 372, ease: PUSH},
	{at: 52, d: 2.6, fx: 900, fy: 372},
	{at: 72, d: 1.15, fx: 1040, fy: 540, ease: CURVES.expoIn},
];

/**
 * A heavy word lies on a perspective plane that recedes to the right; a real CSS perspective camera
 * dollies toward its first letter, which explodes toward the lower left and flies past while the last
 * letters hold mid-frame. Optional stepped extrusion and motion ghosts. Starts at frame 0 of its <Sequence>.
 */
export const TypePlane: React.FC<TypePlaneProps> = ({
	text,
	yaw = 40,
	roll = -8,
	fitW = 430,
	maxSize = 170,
	perspective = 800,
	fontFamily = DISPLAY_FONT,
	fontWeight = 400,
	face = DEMO.paper,
	ext = DEMO.ink,
	extDeep = null,
	extDepth = 0.34,
	keys: keysProp = DEFAULT_KEYS,
	smear = 0.35,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const {width, height} = useVideoConfig();
	const keys = keysProp.length ? keysProp : DEFAULT_KEYS;
	const P = perspective * u;
	const ref = measure(text, fontFamily, 100, fontWeight);
	const fs = Math.min(maxSize * u, ((fitW * u) / Math.max(1, ref.width)) * 100);
	const m = measure(text, fontFamily, fs, fontWeight);
	const W = m.width;
	const yawRad = (yaw * Math.PI) / 180;
	const depthSpan = Math.max(1, W * Math.sin(yawRad));

	const camAt = (f: number) => {
		const pick = (k: PlaneCam) => ({ratio: k.d, fx: k.fx * u, fy: k.fy * u});
		if (f <= keys[0].at) {
			return pick(keys[0]);
		}
		for (let i = 1; i < keys.length; i++) {
			if (f <= keys[i].at) {
				const a = keys[i - 1];
				const b = keys[i];
				const e = (b.ease ?? PUSH)((f - a.at) / Math.max(1, b.at - a.at));
				return {ratio: Math.exp(lerp(Math.log(a.d), Math.log(b.d), e)), fx: lerp(a.fx, b.fx, e) * u, fy: lerp(a.fy, b.fy, e) * u};
			}
		}
		return pick(keys[keys.length - 1]);
	};

	// the extrusion is a text-shadow ladder in the plane's own coordinates (down and to the left)
	const capDepth = extDepth * m.capHeight;
	const n = capDepth > 0.5 ? 18 : 0;
	const shadow = Array.from({length: n}, (_, i) => {
		const t = (i + 1) / n;
		const sd = t * capDepth;
		return `${(-sd * 0.5).toFixed(2)}px ${(sd * 0.86).toFixed(2)}px 0 ${extDeep ? mixHex(ext, extDeep, t) : ext}`;
	}).join(', ');
	const stage = (key: string, f: number, opacity: number) => {
		const cam = camAt(f);
		// the near end may never reach the lens
		const d = Math.max(cam.ratio * depthSpan, depthSpan * 1.06 + 12 * u);
		const k = P / d;
		const ax = width / 2 + (cam.fx - width / 2) / k;
		const ay = height / 2 + (cam.fy - height / 2) / k;
		const az = P - d;
		return (
			<div key={key} style={{position: 'absolute', inset: 0, perspective: `${P}px`, perspectiveOrigin: `${width / 2}px ${height / 2}px`, opacity}}>
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						width: 0,
						height: 0,
						transformOrigin: '0 0',
						transform: `translate3d(${ax.toFixed(2)}px, ${ay.toFixed(2)}px, ${az.toFixed(2)}px) rotateZ(${roll}deg) rotateY(${yaw}deg)`,
					}}
				>
					<div
						style={{
							position: 'absolute',
							right: 0,
							top: -m.baseline,
							whiteSpace: 'pre',
							fontFamily,
							fontWeight,
							fontSize: fs,
							lineHeight: 1,
							color: face,
							textShadow: n ? shadow : undefined,
						}}
					>
						{text}
					</div>
				</div>
			</div>
		);
	};

	// how fast the camera is moving right now: ghosts only appear on the fast frames
	const speed = Math.abs(Math.log(camAt(frame).ratio / camAt(frame - 1).ratio));
	const ghostOn = smear > 0 && speed > 0.025;
	const g = Math.min(1, speed * 8) * smear;

	return (
		<div style={{position: 'absolute', inset: 0, overflow: 'hidden', ...style}}>
			{ghostOn ? stage('g2', frame - 1.3, g * 0.5) : null}
			{ghostOn ? stage('g1', frame - 0.65, g) : null}
			{stage('now', frame, 1)}
		</div>
	);
};

const Demo: React.FC = () => (
	<Backdrop color={DEMO.blue}>
		<TypePlane text="HORIZON" ext="#0a1f8a" />
	</Backdrop>
);

export const typePlaneEntry: LibraryEntry = {
	meta: {
		id: 'type-plane',
		title: 'Type plane',
		category: 'text',
		looks: 'A heavy extruded word lies on a receding plane; a perspective camera dollies at its first letter, which explodes toward the lower left while the last letters hold.',
		use: 'Title hits on a push-in; a word that flies past the lens as a transition into the next shot.',
		exportName: 'TypePlane',
		durationInFrames: 78,
		source: {kind: 'original'},
	},
	Demo,
};
