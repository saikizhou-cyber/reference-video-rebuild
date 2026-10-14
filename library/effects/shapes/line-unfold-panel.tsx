// Ported from video-shotcraft LineUnfoldPanel (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/fui-hud-moves/LineUnfoldPanel.tsx), Apache-2.0, Copyright (c) 2026 Wei Yihao.
// Changes: props-driven size / colours / children instead of the fixture card, resolution independent (useUnit), panel is resized (not scaled) so content never stretches,
// hot-white to panel colour burn-in, CRT scanlines and glow added, optional start delay and exit frame. The 5 / 9 frame line-then-unfold timing and the CRT-off exit are kept. Modified.
import React from 'react';
import {AbsoluteFill, Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop, BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import {progress} from '../../core/easing';
import type {LibraryEntry} from '../../core/types';
import {MONO_FONT, clamp01, mixColor, withAlpha} from './_hud-utils';

export type LineUnfoldPanelProps = {
	/** panel size, px at 720p */
	width?: number;
	height?: number;
	/** left / top in px at 720p (default: centred in the composition) */
	x?: number;
	y?: number;
	/** frames to wait before the line appears */
	delay?: number;
	/** frame at which the CRT-off exit starts (omit to hold forever) */
	outAt?: number;
	/** thickness of the line / dot, px at 720p */
	lineThickness?: number;
	/** colour of the line while it is hot */
	hot?: string;
	/** panel fill */
	background?: string;
	/** panel outline once it has cooled */
	borderColor?: string;
	/** outline weight, px at 720p */
	borderWidth?: number;
	/** glow around line and panel (null = none) */
	glow?: string | null;
	/** horizontal scanlines over the panel */
	scanlines?: boolean;
	/** content, laid out at full panel size and revealed as the panel opens */
	children?: React.ReactNode;
	style?: React.CSSProperties;
};

const OUT_X = Easing.in(Easing.poly(4));
const IN_X = Easing.out(Easing.poly(4));

/**
 * CRT entrance and exit: a thin line is pulled out of a point to both sides in 5 frames, the panel opens vertically
 * in 9 and the content fades up; the exit squashes to a line, the line shrinks to a dot and the dot goes out.
 */
export const LineUnfoldPanel: React.FC<LineUnfoldPanelProps> = ({
	width = 600,
	height = 340,
	x,
	y,
	delay = 0,
	outAt,
	lineThickness = 3,
	hot = '#ffffff',
	background = '#0b1218',
	borderColor = DEMO.cyan,
	borderWidth = 2,
	glow = DEMO.cyan,
	scanlines = true,
	children,
	style,
}) => {
	const frame = useCurrentFrame();
	const {width: W, height: H} = useVideoConfig();
	const u = useUnit();
	const t = frame - delay;
	const LINE_END = 5;
	const UNFOLD_END = LINE_END + 9;
	const OUT0 = outAt === undefined ? Infinity : outAt - delay;
	const COLLAPSE_END = OUT0 + 7;
	const SHRINK_END = COLLAPSE_END + 6;
	const OFF = SHRINK_END + 4;
	if (t < 0 || t >= OFF) {
		return null;
	}

	const pw = width * u;
	const ph = height * u;
	const lh = lineThickness * u;
	const wFrac = Math.min(1 - (outAt === undefined ? 0 : progress(t, COLLAPSE_END, 6, OUT_X)), 0.004 + 0.996 * progress(t, 0, LINE_END, IN_X));
	const unfold = progress(t, LINE_END, 9, Easing.out(Easing.cubic)) * (1 - (outAt === undefined ? 0 : progress(t, OUT0, 7, Easing.in(Easing.cubic))));
	const curW = Math.max(lh, pw * wFrac);
	const curH = lh + (ph - lh) * unfold;
	const cx = x !== undefined ? x * u + pw / 2 : W / 2;
	const cy = y !== undefined ? y * u + ph / 2 : H / 2;
	const dotOp = outAt === undefined ? 1 : 1 - progress(t, SHRINK_END, 4, Easing.in(Easing.quad));
	const contentIn = progress(t, UNFOLD_END - 2, 11, Easing.out(Easing.quad));
	const contentOut = outAt === undefined ? 1 : 1 - clamp01((t - (OUT0 - 4)) / 6);
	const content = Math.min(contentIn, contentOut);
	// white-hot while it is a line, burning down to the panel colour as it opens (and heating up again on the way out)
	const cool = unfold * unfold;
	const fill = mixColor(hot, background, cool);
	const edge = mixColor(hot, borderColor, cool);
	const bw = Math.min(borderWidth * u, curH / 2);
	// the hot line is brightest and widest; the glow settles once the panel has opened
	const glowPx = (26 - 12 * unfold) * u;
	const turnOn = Math.pow(1 - unfold, 2) * 0.4 * (wFrac >= 1 ? 1 : 0);

	return (
		<AbsoluteFill style={style}>
			<div
				style={{
					position: 'absolute',
					left: cx - curW / 2,
					top: cy - curH / 2,
					width: curW,
					height: curH,
					background: fill,
					boxShadow: `inset 0 0 0 ${bw}px ${edge}${glow ? `, 0 0 ${glowPx}px ${withAlpha(glow, 0.7)}, 0 0 ${glowPx * 0.3}px ${withAlpha(hot, 0.7)}` : ''}`,
					opacity: dotOp,
					overflow: 'hidden',
				}}
			>
				<div style={{position: 'absolute', left: '50%', top: '50%', width: pw, height: ph, transform: 'translate(-50%, -50%)', opacity: content}}>{children}</div>
				{scanlines ? (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							opacity: unfold,
							backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,0.26) 0, rgba(0,0,0,0.26) ${u}px, transparent ${u}px, transparent ${3 * u}px)`,
						}}
					/>
				) : null}
				<div style={{position: 'absolute', inset: 0, background: hot, opacity: turnOn}} />
			</div>
		</AbsoluteFill>
	);
};

const Row: React.FC<{k: string; v: number; u: number; frame: number; start: number}> = ({k, v, u, frame, start}) => {
	const p = progress(frame, start, 14, Easing.out(Easing.cubic));
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 16 * u, fontFamily: MONO_FONT, fontSize: 17 * u, letterSpacing: 3 * u, color: DEMO.paper, marginTop: 14 * u}}>
			<span style={{width: 130 * u, opacity: 0.6}}>{k}</span>
			<div style={{flex: 1, height: 10 * u, background: 'rgba(41,224,255,0.16)'}}>
				<div style={{width: `${v * p * 100}%`, height: '100%', background: DEMO.cyan}} />
			</div>
			<span style={{width: 50 * u, textAlign: 'right', fontWeight: 700}}>{Math.round(v * p * 100)}</span>
		</div>
	);
};

const Demo: React.FC = () => {
	const u = useUnit();
	const frame = useCurrentFrame();
	return (
		<Backdrop color="#06090d">
			<AbsoluteFill style={{background: 'radial-gradient(circle at 50% 50%, rgba(41,224,255,0.1), transparent 62%)'}} />
			<LineUnfoldPanel width={640} height={360} delay={2} outAt={46}>
				<div style={{height: '100%', padding: `${34 * u}px ${44 * u}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
					<div style={{fontFamily: MONO_FONT, fontSize: 16 * u, letterSpacing: 7 * u, color: DEMO.yellow}}>DIAGNOSTIC // PASS 03</div>
					<div style={{fontFamily: DISPLAY_FONT, fontSize: 86 * u, lineHeight: 1, color: DEMO.paper, margin: `${6 * u}px 0 ${10 * u}px`, letterSpacing: -u}}>SYSTEMS READY</div>
					<Row k="REACTOR" v={0.92} u={u} frame={frame} start={14} />
					<Row k="SHIELDS" v={0.74} u={u} frame={frame} start={18} />
					<Row k="UPLINK" v={0.58} u={u} frame={frame} start={22} />
					<div style={{fontFamily: BODY_FONT, fontWeight: 800, fontSize: 13 * u, letterSpacing: 5 * u, color: DEMO.paper, opacity: 0.45, marginTop: 18 * u}}>ALL CHANNELS NOMINAL</div>
				</div>
			</LineUnfoldPanel>
		</Backdrop>
	);
};

export const lineUnfoldPanelEntry: LibraryEntry = {
	meta: {
		id: 'line-unfold-panel',
		title: 'Line unfold panel',
		category: 'shapes',
		looks: 'A white-hot line is pulled out of a point to both sides, the panel opens vertically and its content fades up; the exit squashes to a line, shrinks to a dot and blinks out like an old CRT.',
		use: 'Opening and closing UI panels, menus, mission cards or any screen that should power on and off.',
		exportName: 'LineUnfoldPanel',
		durationInFrames: 68,
		source: {
			kind: 'ported',
			name: 'video-shotcraft LineUnfoldPanel',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/fui-hud-moves/LineUnfoldPanel.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
