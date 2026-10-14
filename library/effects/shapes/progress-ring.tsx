// Ported from HyperFrames conic-progress-ring (https://github.com/heygen-com/hyperframes/blob/main/registry/components/conic-progress-ring/conic-progress-ring.html), Apache-2.0, Copyright (c) 2026 HeyGen, Inc.
// Changes: Remotion component (the registered --ring-progress property and GSAP tween are replaced by a per-frame percentage written straight into the conic-gradient), props for value / size /
// thickness / colours, bright frontier bar, tick marks, completion ring pulse and exit added; `variant="stroke"` (SVG dashoffset ring) is an original addition, not part of the source. Modified.
import React from 'react';
import {AbsoluteFill, Easing, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {SPRINGS, progress} from '../../core/easing';
import {Backdrop, BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {MONO_FONT, clamp01, dashWindow, withAlpha} from './_hud-utils';

export type ProgressRingProps = {
	/** where the ring ends, 0..100 */
	value?: number;
	/** number shown in the centre at the end of the fill (default: `value`); the count is always fill / value * this */
	displayValue?: number;
	/** text after the number */
	suffix?: string;
	/** small line under the number */
	caption?: string;
	/** conic = hard-edged gradient ring with a bright frontier; stroke = SVG dash ring with round ends */
	variant?: 'conic' | 'stroke';
	/** ring diameter, px at 720p */
	size?: number;
	/** ring width as % of the radius (conic) or of the radius too (stroke) */
	thickness?: number;
	color?: string;
	trackColor?: string;
	textColor?: string;
	/** frames the fill takes */
	fillFrames?: number;
	/** frames to wait before the ring appears */
	delay?: number;
	easing?: (t: number) => number;
	/** tick marks around the ring, lit as the fill passes them */
	ticks?: boolean;
	/** shock ring when the fill ends */
	pulse?: boolean;
	/** centre of the ring in px at 720p (default: middle of the composition) */
	x?: number;
	y?: number;
	/** frame at which the ring fades away (omit to hold) */
	outAt?: number;
	fontFamily?: string;
};

/**
 * Ring progress with a centre count driven by the same eased value, so fill and number can never drift apart.
 * Starts at frame `delay` of its <Sequence>.
 */
export const ProgressRing: React.FC<ProgressRingProps> = ({
	value = 100,
	displayValue,
	suffix = '%',
	caption,
	variant = 'conic',
	size = 340,
	thickness = 14,
	color = DEMO.cyan,
	trackColor = 'rgba(244,241,234,0.14)',
	textColor = DEMO.paper,
	fillFrames = 42,
	delay = 0,
	easing = Easing.out(Easing.cubic),
	ticks = true,
	pulse = true,
	x,
	y,
	outAt,
	fontFamily = DISPLAY_FONT,
}) => {
	const frame = useCurrentFrame();
	const {width: W, height: H, fps} = useVideoConfig();
	const u = useUnit();
	const t = frame - delay;
	if (t < 0) {
		return null;
	}
	const target = Math.min(100, Math.max(0, value));
	const fill = easing(clamp01(t / Math.max(1, fillFrames))) * target; // 0..100, the one number everything is derived from
	const frac = fill / 100;
	const shown = Math.round(((displayValue ?? target) * fill) / Math.max(0.0001, target));
	const D = size * u;
	const R = D / 2;
	const ringW = (thickness / 100) * R;
	const appear = progress(t, 0, 6, Easing.out(Easing.quad));
	const q = outAt === undefined ? 0 : clamp01((frame - outAt) / 10);
	const scale = (0.94 + 0.06 * appear) * (1 - 0.05 * q);
	const cx = x !== undefined ? x * u : W / 2;
	const cy = y !== undefined ? y * u : H / 2;
	const done = t - fillFrames;
	const pop = done >= 0 ? spring({frame: done, fps, config: SPRINGS.punch, durationInFrames: 14}) : 1;
	const popScale = 1 + 0.04 * (1 - pop) * (done >= 0 ? 1 : 0);
	const ringProg = pulse && done >= 0 ? progress(done, 0, 16, Easing.out(Easing.cubic)) : 0;
	const angle = frac * 360; // clockwise from 12 o'clock: matches conic-gradient(from 0deg), the ticks and the stroke ring (rotate -90)
	const mid = D / 2;

	return (
		<AbsoluteFill style={{opacity: appear * (1 - q)}}>
			<div style={{position: 'absolute', left: cx - D / 2, top: cy - D / 2, width: D, height: D, transform: `scale(${scale * popScale})`}}>
				{pulse && done >= 0 && done < 17 ? (
					<div
						style={{
							position: 'absolute',
							inset: -ringProg * 34 * u,
							borderRadius: '50%',
							border: `${Math.max(1, 3 * u * (1 - ringProg))}px solid ${color}`,
							opacity: 1 - ringProg,
						}}
					/>
				) : null}
				{variant === 'conic' ? (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							borderRadius: '50%',
							background: `conic-gradient(from 0deg, ${color} 0 ${fill}%, ${trackColor} ${fill}% 100%)`,
							WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}%), #000 0)`,
							mask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}%), #000 0)`,
						}}
					/>
				) : (
					<svg width={D} height={D} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
						<circle cx={mid} cy={mid} r={R - ringW / 2} fill="none" stroke={trackColor} strokeWidth={ringW} />
						{frac > 0.001 ? (
							<circle
								cx={mid}
								cy={mid}
								r={R - ringW / 2}
								fill="none"
								stroke={color}
								strokeWidth={ringW}
								strokeLinecap={frac > 0.999 ? 'butt' : 'round'}
								pathLength={1}
								transform={`rotate(-90 ${mid} ${mid})`}
								{...dashWindow(0, frac)}
							/>
						) : null}
					</svg>
				)}
				{ticks ? (
					<svg width={D} height={D} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
						{Array.from({length: 40}, (_, i) => {
							const a = (i / 40) * Math.PI * 2 - Math.PI / 2;
							const major = i % 10 === 0;
							const r0 = R + 9 * u;
							const r1 = R + (major ? 22 : 15) * u;
							const lit = i / 40 <= frac + 0.0001 && frac > 0;
							return (
								<line
									key={i}
									x1={mid + Math.cos(a) * r0}
									y1={mid + Math.sin(a) * r0}
									x2={mid + Math.cos(a) * r1}
									y2={mid + Math.sin(a) * r1}
									stroke={lit ? color : withAlpha('#f4f1ea', 0.22)}
									strokeWidth={(major ? 2.5 : 1.5) * u}
								/>
							);
						})}
					</svg>
				) : null}
				{variant === 'conic' && frac > 0.002 && frac < 0.998 ? (
					<div style={{position: 'absolute', inset: 0, transform: `rotate(${angle}deg)`}}>
						<div style={{position: 'absolute', left: '50%', top: 0, width: 3.5 * u, height: ringW, marginLeft: -1.75 * u, background: '#ffffff'}} />
					</div>
				) : null}
				<div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: textColor}}>
					<div style={{display: 'flex', alignItems: 'flex-start', lineHeight: 1}}>
						<span style={{fontFamily, fontSize: D * 0.3, letterSpacing: -0.02 * D * 0.3, fontVariantNumeric: 'tabular-nums'}}>{shown}</span>
						{suffix ? <span style={{fontFamily, fontSize: D * 0.12, marginTop: D * 0.03, marginLeft: D * 0.01, color}}>{suffix}</span> : null}
					</div>
					{caption ? (
						<div style={{fontFamily: MONO_FONT, fontSize: Math.max(10, D * 0.048), letterSpacing: D * 0.012, opacity: 0.7, marginTop: D * 0.035}}>{caption}</div>
					) : null}
				</div>
			</div>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => {
	const u = useUnit();
	return (
		<Backdrop color="#07090d">
			<ProgressRing x={250} y={350} size={330} value={87} caption="CHARGE" color={DEMO.yellow} delay={0} />
			<ProgressRing x={640} y={350} size={330} value={64} caption="SIGNAL" variant="stroke" thickness={10} color={DEMO.cyan} delay={6} />
			<ProgressRing x={1030} y={350} size={330} value={100} caption="SYNC" thickness={24} color={DEMO.red} suffix="" delay={12} />
			<div style={{position: 'absolute', left: 0, right: 0, bottom: 52 * u, textAlign: 'center', fontFamily: BODY_FONT, fontWeight: 800, fontSize: 18 * u, letterSpacing: 8 * u, color: DEMO.paper, opacity: 0.35}}>
				LOADING SEQUENCE
			</div>
		</Backdrop>
	);
};

export const progressRingEntry: LibraryEntry = {
	meta: {
		id: 'progress-ring',
		title: 'Progress ring',
		category: 'shapes',
		looks: 'A hard-edged conic ring (or round-capped stroke ring) fills with an eased curve while a bright frontier bar leads it and the centre number counts from the same value; a shock ring marks the end.',
		use: 'Loading / charge / sync-rate beats, stat reveals, "98 % complete" call-outs.',
		exportName: 'ProgressRing',
		durationInFrames: 78,
		source: {
			kind: 'ported',
			name: 'HyperFrames conic-progress-ring',
			url: 'https://github.com/heygen-com/hyperframes/blob/main/registry/components/conic-progress-ring/conic-progress-ring.html',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
