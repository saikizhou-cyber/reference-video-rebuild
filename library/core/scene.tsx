import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';

/** Font stacks: no web fonts are loaded, so these fall back to what the render machine has. */
export const DISPLAY_FONT = '"Anton", "Bebas Neue", "Oswald", "Arial Black", Impact, sans-serif';
export const BODY_FONT = '"Inter", "Helvetica Neue", Arial, sans-serif';

/** Palette shared by the gallery demos. */
export const DEMO = {
	ink: '#0b0b10',
	paper: '#f4f1ea',
	blue: '#1f5bff',
	red: '#ff3b2e',
	yellow: '#ffd23f',
	cyan: '#29e0ff',
	grey: '#2a2a33',
} as const;

const Stripes: React.FC<{color: string; angle: number; gap: number; width: number; opacity: number}> = ({
	color,
	angle,
	gap,
	width,
	opacity,
}) => (
	<AbsoluteFill
		style={{
			opacity,
			backgroundImage: `repeating-linear-gradient(${angle}deg, ${color} 0 ${width}px, transparent ${width}px ${gap}px)`,
		}}
	/>
);

/** Scene A for transition demos: blue plate, white "A", diagonal stripes. */
export const SceneA: React.FC<{label?: string}> = ({label = 'A'}) => {
	const {width, height} = useVideoConfig();
	const u = Math.min(width, height) / 720;
	return (
		<AbsoluteFill style={{background: DEMO.blue, overflow: 'hidden'}}>
			<Stripes color="#ffffff" angle={-30} gap={46 * u} width={6 * u} opacity={0.12} />
			<div
				style={{
					position: 'absolute',
					left: 90 * u,
					top: 40 * u,
					fontFamily: DISPLAY_FONT,
					fontSize: 560 * u,
					lineHeight: 1,
					color: DEMO.paper,
					letterSpacing: -10 * u,
				}}
			>
				{label}
			</div>
			<div
				style={{
					position: 'absolute',
					right: 70 * u,
					bottom: 60 * u,
					fontFamily: BODY_FONT,
					fontWeight: 800,
					fontSize: 34 * u,
					color: DEMO.paper,
					letterSpacing: 6 * u,
				}}
			>
				SCENE A / 01
			</div>
			<div
				style={{
					position: 'absolute',
					right: 70 * u,
					top: 70 * u,
					width: 260 * u,
					height: 260 * u,
					borderRadius: '50%',
					border: `${18 * u}px solid ${DEMO.yellow}`,
				}}
			/>
		</AbsoluteFill>
	);
};

/** Scene B for transition demos: red plate, black "B", dot grid. */
export const SceneB: React.FC<{label?: string}> = ({label = 'B'}) => {
	const {width, height} = useVideoConfig();
	const u = Math.min(width, height) / 720;
	return (
		<AbsoluteFill style={{background: DEMO.red, overflow: 'hidden'}}>
			<AbsoluteFill
				style={{
					opacity: 0.18,
					backgroundImage: `radial-gradient(${DEMO.ink} ${3 * u}px, transparent ${3.5 * u}px)`,
					backgroundSize: `${28 * u}px ${28 * u}px`,
				}}
			/>
			<div
				style={{
					position: 'absolute',
					right: 110 * u,
					top: 40 * u,
					fontFamily: DISPLAY_FONT,
					fontSize: 560 * u,
					lineHeight: 1,
					color: DEMO.ink,
					letterSpacing: -10 * u,
				}}
			>
				{label}
			</div>
			<div
				style={{
					position: 'absolute',
					left: 70 * u,
					bottom: 60 * u,
					fontFamily: BODY_FONT,
					fontWeight: 800,
					fontSize: 34 * u,
					color: DEMO.ink,
					letterSpacing: 6 * u,
				}}
			>
				SCENE B / 02
			</div>
			<div
				style={{
					position: 'absolute',
					left: 80 * u,
					top: 90 * u,
					width: 300 * u,
					height: 120 * u,
					background: DEMO.ink,
					transform: 'skewX(-18deg)',
				}}
			/>
		</AbsoluteFill>
	);
};

/**
 * A busy still for post-FX demos (grain, halftone, glitch...): soft gradients, hard shapes,
 * a figure silhouette and type, so every effect has highlights, shadows and edges to act on.
 */
export const Plate: React.FC = () => {
	const {width, height} = useVideoConfig();
	const u = Math.min(width, height) / 720;
	return (
		<AbsoluteFill
			style={{
				overflow: 'hidden',
				background: `radial-gradient(circle at 70% 35%, #ffb36b 0%, #e2475a 28%, #3a1d6e 62%, #0d0b1f 100%)`,
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: '58%',
					top: '14%',
					width: 300 * u,
					height: 300 * u,
					borderRadius: '50%',
					background: 'radial-gradient(circle, #fff4d6 0%, #ffd08a 45%, rgba(255,160,90,0) 70%)',
				}}
			/>
			<svg
				viewBox="0 0 1280 720"
				preserveAspectRatio="xMidYMid slice"
				style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}
			>
				<path d="M0 560 L220 470 L380 520 L560 430 L760 500 L980 410 L1280 480 L1280 720 L0 720 Z" fill="#160f2e" />
				<path d="M0 620 L300 560 L620 610 L900 540 L1280 600 L1280 720 L0 720 Z" fill="#07060f" />
				{/* figure silhouette */}
				<path
					d="M300 620 L312 470 Q300 440 318 420 L332 380 Q340 350 362 346 Q386 344 392 372 L398 404 Q420 418 418 452 L430 540 L414 542 L404 470 L398 620 Z"
					fill="#07060f"
				/>
				<circle cx="364" cy="326" r="26" fill="#07060f" />
			</svg>
			<div
				style={{
					position: 'absolute',
					left: 70 * u,
					top: 60 * u,
					fontFamily: DISPLAY_FONT,
					fontSize: 150 * u,
					lineHeight: 0.9,
					color: DEMO.paper,
					letterSpacing: -2 * u,
				}}
			>
				NIGHT
				<br />
				SHIFT
			</div>
			<div
				style={{
					position: 'absolute',
					left: 74 * u,
					top: 350 * u,
					fontFamily: BODY_FONT,
					fontWeight: 700,
					fontSize: 22 * u,
					color: DEMO.paper,
					letterSpacing: 8 * u,
					opacity: 0.85,
				}}
			>
				EPISODE 07 — 23:40
			</div>
		</AbsoluteFill>
	);
};

/** Flat backdrop for text and shape demos. */
export const Backdrop: React.FC<{color?: string; children?: React.ReactNode}> = ({color = DEMO.ink, children}) => (
	<AbsoluteFill style={{background: color, overflow: 'hidden'}}>{children}</AbsoluteFill>
);

/** Scale factor so effects authored at 1280x720 stay proportional at any composition size. */
export const useUnit = (): number => {
	const {width, height} = useVideoConfig();
	return Math.min(width, height) / 720;
};
