import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, progress} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {charLayout, fitSize, mixHex} from './_display-utils';

export type TextCylinderProps = {
	text: string;
	/** px at 720p; keep it at or below ~140: past ~160 px on screen the browser rasterises 3D-transformed glyphs as paths and edge pixels stop being bit-identical between renders */
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number | string;
	/** colour of the face that looks at the camera */
	color?: string;
	/** colour the faces fall to as the drum turns them away */
	shade?: string;
	/** colour each letter lands in before it cools to `color` (null = none) */
	flash?: string | null;
	/** extra px between glyphs at 720p */
	tracking?: number;
	/** how fast faces fall to `shade` as they turn away (higher = darker rows above and below) */
	falloff?: number;
	/** copies of the word around the drum */
	faces?: number;
	/** air between two lines on the drum, as a share of the cap height */
	lineGap?: number;
	/** full turns each letter spins before it settles on the front face */
	turns?: number;
	/** frames one letter takes to spin down */
	spinFrames?: number;
	/** frames between the start of one letter and the next (0 = the whole word spins as one drum) */
	stagger?: number;
	/** frame (relative to the Sequence) at which the first letter starts to spin */
	startAt?: number;
	/** how far behind the screen plane the drum starts, px at 720p; it flies up to the plane while it spins */
	flyIn?: number;
	/** yaw in degrees the drum starts at, swinging round to face the camera */
	yawFrom?: number;
	/** camera distance, px at 720p (smaller = stronger perspective) */
	perspective?: number;
	/** degrees each letter overshoots the front face before it rocks back */
	settle?: number;
	/** opacity of the shutter copies trailing a fast spin (0 = off) */
	smear?: number;
	/** the word is shrunk to fit this share of the frame width (0 = never shrink) */
	fitWidth?: number;
	style?: React.CSSProperties;
};

const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** brightness of the drum surface at angle `deg` from the front: 1 facing the camera, 0 edge-on */
const lit = (deg: number, sharp: number) => Math.pow(Math.max(0, Math.cos((deg * Math.PI) / 180)), sharp);

/**
 * The word is set on every face of a drum (CSS 3D, `rotateX` copies around a horizontal axis). Each letter's
 * drum spins up from behind the screen plane, one letter after another, brakes hard and settles on the front
 * face with a small rock-back; the faces shade by the angle at which they look at the camera, so the drum reads
 * as one lit cylinder. Starts at frame 0 of its <Sequence>; the last frame is the word facing front.
 */
export const TextCylinder: React.FC<TextCylinderProps> = ({
	text,
	fontSize = 135,
	fontFamily = DISPLAY_FONT,
	fontWeight = 400,
	color = DEMO.paper,
	shade = '#243562',
	flash = DEMO.yellow,
	tracking = 5,
	falloff = 2.4,
	faces = 16,
	lineGap = 0.3,
	turns = 1,
	spinFrames = 30,
	stagger = 2.5,
	startAt = 3,
	flyIn = 520,
	yawFrom = 26,
	perspective = 1100,
	settle = 7,
	smear = 0.4,
	fitWidth = 0.84,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const {width, height} = useVideoConfig();
	const fs = fitSize(text, fontFamily, fontSize * u, fitWidth * width, fontWeight);
	const lay = charLayout(text, fontFamily, fs, fontWeight, tracking * u * (fs / (fontSize * u)));
	const n = Math.max(6, Math.round(faces));
	const step = 360 / n;
	const faceH = lay.capHeight * (1 + lineGap);
	const radius = faceH / (2 * Math.tan(Math.PI / n));
	const capMid = lay.baseline - lay.capHeight / 2;
	const P = perspective * u;
	const left0 = (width - lay.width) / 2;
	const pad = 0.18 * fs;

	// one drum per visible glyph, numbered left to right so spaces do not delay the cascade
	let count = 0;
	const cols = lay.chars
		.map((ch, i) => {
			if (ch.trim() === '') {
				return null;
			}
			return {ch, i, k: count++};
		})
		.filter((c): c is {ch: string; i: number; k: number} => c !== null);

	/** drum angle (deg) of glyph k at time `f`: spins up from -turns*360 to 0, brakes, rocks back */
	const spinAt = (k: number, f: number) => {
		const t = f - startAt - k * stagger;
		const e = progress(t, 0, spinFrames, CURVES.expoOut);
		const tt = t - spinFrames * 0.5;
		const kick = tt > 0 ? settle * Math.exp(-tt / 5) * Math.sin(tt * 0.72) : 0;
		return -turns * 360 * (1 - e) + kick;
	};

	// the whole drum flies up to the screen plane while it swings round to face the camera
	const g = progress(frame, startAt, spinFrames + 6, CURVES.expoOut);
	const zOff = -flyIn * u * (1 - g);
	const yaw = yawFrom * (1 - g);

	const renderSet = (key: string, back: number, opacity: number) =>
		cols.map((c) => {
			const a = spinAt(c.k, frame) - back * Math.max(0, spinAt(c.k, frame) - spinAt(c.k, frame - 1));
			const landT = frame - startAt - c.k * stagger - spinFrames;
			const hot = flash && landT >= 0 ? Math.max(0, 1 - landT / 9) : 0;
			const faceEls: React.ReactNode[] = [];
			for (let j = 0; j < n; j++) {
				const phi = wrap(j * step + a);
				if (Math.abs(phi) > 100) {
					continue;
				}
				let top = mixHex(shade, color, lit(phi + step / 2, falloff));
				let bottom = mixHex(shade, color, lit(phi - step / 2, falloff));
				if (hot > 0 && flash && j === 0) {
					top = mixHex(top, flash, hot);
					bottom = mixHex(bottom, flash, hot);
				}
				faceEls.push(
					<div
						key={j}
						style={{
							position: 'absolute',
							left: 0,
							top: -faceH / 2,
							width: lay.w[c.i],
							height: faceH,
							backfaceVisibility: 'hidden',
							opacity,
							transform: `rotateX(${(j * step).toFixed(3)}deg) translateZ(${radius.toFixed(2)}px)`,
						}}
					>
						<span
							style={{
								position: 'absolute',
								left: -pad,
								width: lay.w[c.i] + pad * 2,
								top: faceH / 2 - capMid,
								height: fs,
								lineHeight: 1,
								textAlign: 'center',
								whiteSpace: 'pre',
								fontFamily,
								fontWeight,
								fontSize: fs,
								color: 'transparent',
								backgroundImage: `linear-gradient(180deg, ${top} ${(capMid - faceH / 2).toFixed(1)}px, ${bottom} ${(capMid + faceH / 2).toFixed(1)}px)`,
								WebkitBackgroundClip: 'text',
								backgroundClip: 'text',
							}}
						>
							{c.ch}
						</span>
					</div>,
				);
			}
			return (
				<div
					key={`${key}${c.k}`}
					style={{
						position: 'absolute',
						left: left0 + lay.x[c.i] - width / 2,
						top: 0,
						width: lay.w[c.i],
						height: 0,
						transformStyle: 'preserve-3d',
						transform: `rotateX(${a.toFixed(3)}deg)`,
					}}
				>
					{faceEls}
				</div>
			);
		});

	// shutter copies: only while some drum is spinning fast
	const fastest = Math.max(...cols.map((c) => Math.abs(spinAt(c.k, frame) - spinAt(c.k, frame - 1))), 0);
	const ghosts = smear > 0 && fastest > step * 0.4;

	return (
		<div style={{position: 'absolute', inset: 0, overflow: 'hidden', ...style}}>
			<div style={{position: 'absolute', inset: 0, perspective: `${P}px`, perspectiveOrigin: '50% 50%'}}>
				<div
					style={{
						position: 'absolute',
						left: width / 2,
						top: height / 2,
						width: 0,
						height: 0,
						transformStyle: 'preserve-3d',
						transform: `translateZ(${(zOff - radius).toFixed(2)}px) rotateY(${yaw.toFixed(3)}deg)`,
					}}
				>
					{ghosts ? renderSet('g2', 1.0, smear * 0.45) : null}
					{ghosts ? renderSet('g1', 0.5, smear * 0.7) : null}
					{renderSet('m', 0, 1)}
				</div>
			</div>
		</div>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		<TextCylinder text="JACKPOT" />
	</Backdrop>
);

export const textCylinderEntry: LibraryEntry = {
	meta: {
		id: 'text-cylinder',
		title: 'Text cylinder',
		category: 'text',
		looks: 'The word sits on every face of a lit 3D drum; each letter spins up from behind the screen one after another, brakes and settles on the front face with a rock-back.',
		use: 'Slot-reel / counter style title reveals; a word that must feel mechanical and lands on a beat.',
		exportName: 'TextCylinder',
		durationInFrames: 90,
		source: {kind: 'inspired', name: 'CodePen petebarr 3D CSS Kinetic Type Poster', url: 'https://codepen.io/petebarr/pen/OJPBEwy'},
	},
	Demo,
};
