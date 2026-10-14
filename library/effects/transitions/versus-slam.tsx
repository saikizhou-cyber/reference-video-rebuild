// Ported from Vincentwei1021/video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft), Apache-2.0, Copyright 2026 Wei Yihao. Modified.
// Changes: generalised from fixed 1080p numbers to any frame size (seam from an angle prop), left / right as props, spring contact squash instead of a hard stop,
// the white flash only on / after the impact frame, an ink seam bar and a skewed hard-shadow stamp, impact spikes, a slow creep on both pictures.
import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, SPRINGS, progress} from '../../core/easing';
import {DEMO, DISPLAY_FONT, SceneA, SceneB} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {mix, polyClip, rand, seg, type Pt} from './_dom-utils';

export type VersusSlamProps = {
	/** full-frame picture of the left panel (it is clipped to the left of the seam) */
	left: React.ReactNode;
	/** full-frame picture of the right panel */
	right: React.ReactNode;
	/** frame the two panels collide on */
	impactFrame?: number;
	/** seam angle from the horizontal in degrees (78 = leans 12 degrees off vertical) */
	angle?: number;
	/** stamp text */
	vs?: string;
	/** colour behind the panels before they meet */
	background?: string;
	/** colour of the seam bar */
	seam?: string;
	/** fill of the stamp; its text and hard shadow use `seam` */
	stamp?: string;
	/** colour of the impact flash and spikes */
	flash?: string;
	/** peak shake in px at 720p */
	shake?: number;
	/** how far the panels squash into each other on contact, px at 720p */
	squash?: number;
	/** slow push-in on both pictures after the hit (0.05 = 5 % over 45 frames) */
	creep?: number;
	fontFamily?: string;
	seed?: number;
};

/**
 * Versus screen: two pictures separated by a slanted seam accelerate in from opposite sides and collide on the diagonal.
 * The impact frame flashes white, shakes the whole screen, presses a skewed VS stamp onto the seam and throws spikes; then it holds.
 * A component (not a presentation): put it in a <Sequence>, frame 0 = first frame of the approach.
 */
export const VersusSlam: React.FC<VersusSlamProps> = ({
	left,
	right,
	impactFrame = 10,
	angle = 78,
	vs = 'VS',
	background = DEMO.ink,
	seam = DEMO.ink,
	stamp = DEMO.yellow,
	flash = '#ffffff',
	shake = 12,
	squash = 20,
	creep = 0.05,
	fontFamily = DISPLAY_FONT,
	seed = 3,
}) => {
	const frame = useCurrentFrame();
	const {width: W, height: H, fps} = useVideoConfig();
	const u = Math.min(W, H) / 720;
	const dx = H / Math.tan((angle * Math.PI) / 180);
	const topX = W / 2 + dx / 2;
	const botX = W / 2 - dx / 2;
	const seamAt = (y: number) => mix(topX, botX, y / H);
	const skew = 90 - angle;

	const since = frame - impactFrame;
	const hit = since >= 0;
	// approach: ease-in cubic, ends exactly on the impact frame; starts with a sliver of each picture already in
	const t = seg(frame, 0, impactFrame);
	const far = (topX + 6 * u) * 0.72 * (1 - t * t);
	const contact = hit ? squash * u * (1 - spring({frame: since, fps, config: SPRINGS.punch})) : 0;
	const lx = -far + contact;
	const rx = far - contact;

	// whole-screen shake: damped oscillation from the impact frame, scaled up just enough to hide the edge
	const env = hit ? shake * u * Math.exp(-since / 1.6) : 0;
	const sx = env * Math.sin(since * 3.4);
	const sy = env * 0.6 * Math.sin(since * 4.1 + 0.7);
	const cover = 1 + (2.2 * env) / Math.min(W, H);
	const flashOpacity = hit ? interpolate(since, [0, 3], [0.9, 0], {extrapolateRight: 'clamp'}) : 0;

	const push = 1 + creep * seg(since, 0, 45);
	const leftClip: Pt[] = [[-4, 0], [topX, 0], [botX, H], [-4, H]];
	const rightClip: Pt[] = [[topX, 0], [W + 4, 0], [W + 4, H], [botX, H]];
	const bar = 13 * u;
	const barPts: Pt[] = [[seamAt(-20) - bar / 2, -20], [seamAt(-20) + bar / 2, -20], [seamAt(H + 20) + bar / 2, H + 20], [seamAt(H + 20) - bar / 2, H + 20]];

	// stamp
	const stampScale = mix(1.6, 1, progress(since, 0, 6, CURVES.backOut));
	const stampOpacity = hit ? Math.min(1, (since + 1) / 2) : 0;
	const fs = 230 * u;
	// spikes thrown from the seam centre
	const spikeT = progress(since, 0, 5, CURVES.expoOut);
	const spikeFade = 1 - seg(since, 2, 7);
	const spikes = Array.from({length: 14}, (_, i) => {
		const a = ((i + rand(seed, 'a', i) * 0.7) / 14) * Math.PI * 2;
		const len = (140 + rand(seed, 'l', i) * 300) * u * spikeT;
		const r0 = 70 * u;
		const w = 0.07 + rand(seed, 'w', i) * 0.05;
		const c = [W / 2, H / 2] as const;
		const pt = (ang: number, r: number): Pt => [c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r];
		return [pt(a - w, r0), pt(a, r0 + len), pt(a + w, r0)] as Pt[];
	});

	const panelStyle = (clip: Pt[], x: number): React.CSSProperties => ({
		position: 'absolute',
		inset: 0,
		clipPath: polyClip(clip),
		transform: `translateX(${x}px)`,
	});

	return (
		<AbsoluteFill style={{background, overflow: 'hidden'}}>
			<AbsoluteFill style={{transform: `translate(${sx}px, ${sy}px) scale(${cover})`}}>
				<div style={panelStyle(rightClip, rx)}>
					<AbsoluteFill style={{transform: `scale(${push})`, transformOrigin: '75% 50%'}}>{right}</AbsoluteFill>
				</div>
				<div style={panelStyle(leftClip, lx)}>
					<AbsoluteFill style={{transform: `scale(${push})`, transformOrigin: '25% 50%'}}>{left}</AbsoluteFill>
				</div>
				{hit ? <AbsoluteFill style={{background: seam, clipPath: polyClip(barPts)}} /> : null}
				{hit && spikeFade > 0 ? (
					<svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
						{spikes.map((s, i) => (
							<polygon key={i} points={s.map((p) => p.join(',')).join(' ')} fill={flash} opacity={spikeFade} />
						))}
					</svg>
				) : null}
				{hit ? (
					<div
						style={{
							position: 'absolute',
							left: W / 2,
							top: H / 2,
							transform: `translate(-50%, -50%) skewX(${-skew}deg) scale(${stampScale})`,
							opacity: stampOpacity,
						}}
					>
						<div style={{position: 'absolute', inset: 0, background: seam, transform: `translate(${10 * u}px, ${10 * u}px)`}} />
						<div
							style={{
								position: 'relative',
								background: stamp,
								border: `${6 * u}px solid ${seam}`,
								padding: `${6 * u}px ${44 * u}px`,
								fontFamily,
								fontSize: fs,
								lineHeight: 1.05,
								letterSpacing: -0.02 * fs,
								color: seam,
								whiteSpace: 'nowrap',
							}}
						>
							{vs}
						</div>
					</div>
				) : null}
			</AbsoluteFill>
			{flashOpacity > 0 ? <AbsoluteFill style={{background: flash, opacity: flashOpacity}} /> : null}
		</AbsoluteFill>
	);
};

/** same component, named after the effect id */
export const versusSlam = VersusSlam;

const Demo: React.FC = () => <VersusSlam left={<SceneA label="A" />} right={<SceneB label="B" />} />;

export const versusSlamEntry: LibraryEntry = {
	meta: {
		id: 'versus-slam',
		title: 'Versus slam',
		category: 'transitions',
		looks: 'Two pictures on a slanted seam race in from opposite sides, collide on the diagonal with a white flash, spikes and a screen shake, and a yellow VS stamp is pressed onto the seam.',
		use: 'Rival / character-versus reveals, mode intros, any A-against-B card in a trailer. Component with left and right slots, not a presentation.',
		exportName: 'VersusSlam',
		durationInFrames: 45,
		source: {kind: 'ported', name: 'Vincentwei1021/video-shotcraft (VersusSlam)', url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/transition/transition-hidden-cut/VersusSlam.tsx', license: 'Apache-2.0'},
	},
	Demo,
};
