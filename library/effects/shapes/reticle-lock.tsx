// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/fui-hud-moves/ReticleLockOn.tsx), Apache-2.0, Copyright (c) 2026 Wei Yihao.
// Changes: props-driven target rectangle / label / colours instead of the fixture dashboard, resolution independent (useUnit), SVG brackets with speed ghosts,
// scan-line sweep, lock flash + shock ring + centre cross + leader label added, overshoot done with the library's CURVES / SPRINGS. Modified.
import React, {useId} from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES, SPRINGS, progress} from '../../core/easing';
import {BODY_FONT, DEMO, Plate, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {MONO_FONT, clamp01, lerp} from './_hud-utils';

export type ReticleLockProps = {
	/** the thing to lock onto, px at 720p (x / y = top-left). Default: a box in the middle of the frame */
	target?: {x: number; y: number; width: number; height: number};
	label?: string;
	sublabel?: string;
	/** bracket / label colour */
	color?: string;
	/** colour of the lock flash on the target */
	flashColor?: string;
	/** length of each bracket arm, px at 720p */
	armLength?: number;
	/** bracket line weight, px at 720p */
	thickness?: number;
	/** gap between brackets and target once locked, px at 720p */
	padding?: number;
	/** frames the oversized reticle takes to arrive */
	flyFrames?: number;
	/** frame at which the brackets click shut */
	lockFrame?: number;
	/** scale the reticle starts at (1 = locked size) */
	fromScale?: number;
	/** degrees it starts rotated by */
	fromRotate?: number;
	/** scan line that sweeps down the target while the brackets close */
	scan?: boolean;
	labelSide?: 'auto' | 'left' | 'right';
	/** hang the label from the top corner of the target, or stand it on the bottom corner */
	labelAlign?: 'top' | 'bottom';
	fontFamily?: string;
	style?: React.CSSProperties;
};

/**
 * Target lock: four L-brackets fly in oversized, close on the target, overshoot inward and click shut; a scan line
 * sweeps the target, it flashes, a ring shocks out and a label pops. Starts at frame 0 of its <Sequence>.
 */
export const ReticleLock: React.FC<ReticleLockProps> = ({
	target,
	label = 'TARGET LOCKED',
	sublabel = 'TGT-02 / 0.97',
	color = DEMO.yellow,
	flashColor = '#fff3c4',
	armLength = 46,
	thickness = 5,
	padding = 12,
	flyFrames = 9,
	lockFrame = 30,
	fromScale = 1.9,
	fromRotate = -8,
	scan = true,
	labelSide = 'auto',
	labelAlign = 'top',
	fontFamily = BODY_FONT,
	style,
}) => {
	const frame = useCurrentFrame();
	const {width: W, height: H, fps} = useVideoConfig();
	const u = useUnit();
	const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
	const tg = target ?? {x: (W / u - 360) / 2, y: (H / u - 280) / 2, width: 360, height: 280};
	const tx = tg.x * u;
	const ty = tg.y * u;
	const tw = tg.width * u;
	const th = tg.height * u;
	const cx = tx + tw / 2;
	const cy = ty + th / 2;
	const pad = padding * u;
	const arm = Math.min(armLength * u, tw / 2, th / 2);
	const sw = thickness * u;
	const L = lockFrame;
	const lockedSize = 0.9;

	// reticle scale at frame f: big and drifting, accelerates in, overshoots below 1, springs out to 1
	const scaleAt = (f: number): number => {
		if (f < L) {
			const sp = clamp01((f - flyFrames) / Math.max(1, L - flyFrames));
			const e = Easing.bezier(0.55, 0, 0.75, 1)(sp);
			return lerp(fromScale, lockedSize, e);
		}
		const k = spring({frame: f - L, fps, config: SPRINGS.punch, durationInFrames: 14});
		return lerp(lockedSize, 1, k);
	};
	const rotAt = (f: number): number => fromRotate * (1 - Easing.bezier(0.55, 0, 0.75, 1)(clamp01((f - flyFrames * 0.5) / Math.max(1, L - flyFrames * 0.5))));
	const offAt = (f: number): number => 1 - CURVES.expoOut(clamp01(f / Math.max(1, flyFrames)));

	const bracketsAt = (f: number, alpha: number, stroke: string, key: string) => {
		const s = scaleAt(f);
		const hw = (tw / 2 + pad) * s;
		const hh = (th / 2 + pad) * s;
		const o = offAt(f);
		const dx = o * W * 0.42;
		const dy = o * H * 0.38;
		const corners = [
			{x: cx - hw, y: cy - hh, sx: 1, sy: 1},
			{x: cx + hw, y: cy - hh, sx: -1, sy: 1},
			{x: cx - hw, y: cy + hh, sx: 1, sy: -1},
			{x: cx + hw, y: cy + hh, sx: -1, sy: -1},
		];
		return (
			<g key={key} opacity={alpha} transform={`translate(${dx} ${dy}) rotate(${rotAt(f)} ${cx} ${cy})`}>
				{corners.map((c, i) => (
					<path
						key={i}
						d={`M${c.x + c.sx * arm} ${c.y} L${c.x} ${c.y} L${c.x} ${c.y + c.sy * arm}`}
						fill="none"
						stroke={stroke}
						strokeWidth={sw}
						strokeLinejoin="miter"
						strokeLinecap="butt"
					/>
				))}
			</g>
		);
	};

	const since = frame - L;
	const locked = since >= 0;
	const appear = clamp01(frame / 2);
	const bracketColor = locked && since < 2 ? '#ffffff' : color;

	// scan line: sweeps down the target between arrival and lock
	const scanStart = Math.max(0, flyFrames - 5);
	const scanEnd = Math.max(scanStart + 4, L - 2);
	const sp = progress(frame, scanStart, scanEnd - scanStart, CURVES.inOutCubic);
	const scanOn = scan && frame >= scanStart && frame < scanEnd + 1;
	const scanY = ty - pad + sp * (th + pad * 2);
	const trail = 44 * u;

	// lock flash, shock ring, centre cross
	const flash = locked ? interpolate(since, [0, 1, 3, 12], [0.7, 0.34, 0.12, 0.035], {extrapolateRight: 'clamp'}) : 0;
	const ring = locked ? progress(since, 0, 16, CURVES.expoOut) : 0;
	const ringOn = locked && since < 17;
	const cross = locked ? spring({frame: since, fps, config: SPRINGS.punch, durationInFrames: 10}) : 0;
	const crossLen = 14 * u;

	// label
	const side = labelSide === 'auto' ? (cx > W * 0.62 ? 'left' : 'right') : labelSide;
	const labelT = progress(since - 2, 0, 9, CURVES.backOut);
	const labelClip = clamp01(progress(since - 2, 0, 7, CURVES.expoOut));
	const leaderLen = 24 * u;
	const anchorX = side === 'right' ? tx + tw + pad : tx - pad;

	return (
		<div style={{position: 'absolute', inset: 0, overflow: 'hidden', ...style}}>
			{locked ? <div style={{position: 'absolute', left: tx - pad, top: ty - pad, width: tw + pad * 2, height: th + pad * 2, background: flashColor, opacity: flash}} /> : null}
			<svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
				<defs>
					<clipPath id={`rl-clip-${uid}`}>
						<rect x={tx - pad} y={ty - pad} width={tw + pad * 2} height={th + pad * 2} />
					</clipPath>
					<linearGradient id={`rl-trail-${uid}`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stopColor={color} stopOpacity="0" />
						<stop offset="1" stopColor={color} stopOpacity="0.5" />
					</linearGradient>
				</defs>
				{scanOn ? (
					<g clipPath={`url(#rl-clip-${uid})`} opacity={frame < scanStart + 2 ? 0.6 : 1}>
						<rect x={tx - pad} y={scanY - trail} width={tw + pad * 2} height={trail} fill={`url(#rl-trail-${uid})`} />
						<rect x={tx - pad} y={scanY - 1.5 * u} width={tw + pad * 2} height={3 * u} fill={color} />
					</g>
				) : null}
				{ringOn ? (
					<rect
						x={tx - pad - ring * 46 * u}
						y={ty - pad - ring * 46 * u}
						width={tw + pad * 2 + ring * 92 * u}
						height={th + pad * 2 + ring * 92 * u}
						fill="none"
						stroke={color}
						strokeWidth={Math.max(1, 2 * u * (1 - ring))}
						opacity={1 - ring}
					/>
				) : null}
				{/* speed ghosts only while the reticle is still travelling */}
				{since < 0 && frame > 1 ? bracketsAt(frame - 4, 0.14 * appear, bracketColor, 'g2') : null}
				{since < 0 && frame > 1 ? bracketsAt(frame - 2, 0.3 * appear, bracketColor, 'g1') : null}
				{bracketsAt(frame, appear, bracketColor, 'main')}
				{locked ? (
					<g opacity={cross}>
						<path d={`M${cx - crossLen * cross} ${cy} H${cx + crossLen * cross} M${cx} ${cy - crossLen * cross} V${cy + crossLen * cross}`} stroke={color} strokeWidth={2 * u} fill="none" />
						{[
							[tx + tw / 2, ty - pad, 0, -1],
							[tx + tw / 2, ty + th + pad, 0, 1],
							[tx - pad, ty + th / 2, -1, 0],
							[tx + tw + pad, ty + th / 2, 1, 0],
						].map(([px, py, ux, uy], i) => (
							<path key={i} d={`M${px} ${py} L${px + ux * 12 * u * cross} ${py + uy * 12 * u * cross}`} stroke={color} strokeWidth={2 * u} />
						))}
					</g>
				) : null}
			</svg>
			{locked ? (
				<div
					style={{
						position: 'absolute',
						left: side === 'right' ? anchorX : undefined,
						right: side === 'left' ? W - anchorX : undefined,
						top: labelAlign === 'top' ? ty - pad : undefined,
						bottom: labelAlign === 'bottom' ? H - (ty + th + pad) : undefined,
						// the leader line is the label's own padding, so it is revealed with the same wipe
						paddingLeft: side === 'right' ? leaderLen : 0,
						paddingRight: side === 'left' ? leaderLen : 0,
						transform: `translateX(${(1 - labelT) * (side === 'right' ? -14 : 14) * u}px)`,
						clipPath: side === 'right' ? `inset(0 ${(1 - labelClip) * 100}% 0 0)` : `inset(0 0 0 ${(1 - labelClip) * 100}%)`,
						display: 'flex',
						flexDirection: 'column',
						alignItems: side === 'right' ? 'flex-start' : 'flex-end',
						gap: 5 * u,
						whiteSpace: 'nowrap',
					}}
				>
					<div style={{position: 'absolute', top: 17 * u - u, [side === 'right' ? 'left' : 'right']: 0, width: leaderLen, height: 2 * u, background: color}} />
					<div
						style={{
							background: color,
							color: DEMO.ink,
							fontFamily,
							fontWeight: 800,
							fontSize: 19 * u,
							letterSpacing: 4 * u,
							padding: `${7 * u}px ${18 * u}px ${7 * u}px ${14 * u}px`,
							clipPath: side === 'right' ? 'polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%)' : 'polygon(10px 0, 100% 0, 100% 100%, 0 100%)',
						}}
					>
						{label}
					</div>
					{sublabel ? (
						<div style={{fontFamily: MONO_FONT, fontWeight: 700, fontSize: 14 * u, letterSpacing: 3 * u, color: '#fff', background: 'rgba(8,8,12,0.78)', padding: `${3 * u}px ${10 * u}px`}}>{sublabel}</div>
					) : null}
				</div>
			) : null}
		</div>
	);
};

const Demo: React.FC = () => (
	<>
		<Plate />
		<ReticleLock target={{x: 292, y: 292, width: 150, height: 250}} label="TARGET LOCKED" sublabel="TGT-02 / RANGE 0.97" labelAlign="bottom" />
	</>
);

export const reticleLockEntry: LibraryEntry = {
	meta: {
		id: 'reticle-lock',
		title: 'Reticle lock',
		category: 'shapes',
		looks: 'Four yellow L-brackets fly in oversized, close onto the target with an overshoot, a scan line sweeps it, then the brackets click shut with a flash, shock ring and label.',
		use: 'Spotting a character, a hit or an object: "found you" beats, tutorial call-outs, enemy intros.',
		exportName: 'ReticleLock',
		durationInFrames: 78,
		source: {
			kind: 'ported',
			name: 'video-shotcraft ReticleLockOn',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/fui-hud-moves/ReticleLockOn.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
