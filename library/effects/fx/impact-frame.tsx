// Ported from video-shotcraft (https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/impact-feedback/AnimeImpact.tsx), Apache-2.0, Copyright 2026 Wei Yihao. Modified. Changes: turned the fixed demo shot into a wrapper for any scene (hit list, impact length, zoom / release, target point, line count and weight, contrast, colour fringe, shake), edge-safe re-centring of the crash zoom, resolution-independent units.
import React from 'react';
import {AbsoluteFill, Easing, useCurrentFrame, useVideoConfig} from 'remotion';
import {CURVES} from '../../core/easing';
import {Plate} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp, hash} from './_hits-utils';

export type ImpactFrameProps = {
	/** first frame of the impact (frame number inside the surrounding <Sequence>); a list for several hits */
	at?: number | number[];
	/** how many frames the negative lasts. 3 is the sweet spot: at 4+ the viewer sees through the trick */
	frames?: number;
	/** scale the crash zoom reaches on impact (1 = no zoom) */
	zoom?: number;
	/** frames of the crash zoom before the hit (ease-in, so it accelerates into the impact) */
	approach?: number;
	/** frames after the impact over which the zoom eases back to 1 (0 = stay zoomed in) */
	release?: number;
	/** hit point as fractions of the frame: the zoom centres on it and the speed lines radiate from it */
	target?: [number, number];
	/** number of speed-line wedges */
	lines?: number;
	/** thickness multiplier of the wedges */
	lineWeight?: number;
	/** peak shake after the impact, px at 720p (decays in ~12 frames) */
	shake?: number;
	/** red / cyan colour fringe on the negative, px at 720p (0 = off) */
	split?: number;
	/** contrast of the black-and-white negative (1 = soft grey negative, 8 = near-hard black / white, 20+ = pure threshold) */
	contrast?: number;
	/** line colours: every 3rd wedge is solid `ink`, the others invert the picture beneath them (`paper` over black) */
	ink?: string;
	paper?: string;
	/** changes the line pattern */
	seed?: number;
	children: React.ReactNode;
};

const NEG = (c: number) => `invert(1) grayscale(1) contrast(${c})`;

const Zoom: React.FC<{s: number; tx: number; ty: number; children: React.ReactNode}> = ({s, tx, ty, children}) => (
	<AbsoluteFill style={{transform: s === 1 ? undefined : `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: '0 0'}}>{children}</AbsoluteFill>
);

/** Manga-style focus lines: thin wedges that start away from the target and fan out past the frame, a new set every frame. */
const SpeedLines: React.FC<{
	w: number;
	h: number;
	cx: number;
	cy: number;
	count: number;
	weight: number;
	phase: number;
	seed: number;
	ink: string;
	paper: string;
}> = ({w, h, cx, cy, count, weight, phase, seed, ink, paper}) => {
	const R = Math.hypot(w, h);
	const polys = Array.from({length: count}, (_, i) => {
		const k = i * 13 + phase * 101 + seed * 7;
		const ang = ((i + 0.5) / count) * Math.PI * 2 + (hash(k) - 0.5) * 0.22;
		const r0 = (0.28 + hash(k + 1) * 0.2) * h;
		// half-angle in radians: an angular size, so the same at 720p, 1080p and 4K
		const half = ((7 + hash(k + 2) * 16) * weight) / 1300;
		const pts = [
			[cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0],
			[cx + Math.cos(ang - half) * R, cy + Math.sin(ang - half) * R],
			[cx + Math.cos(ang + half) * R, cy + Math.sin(ang + half) * R],
		];
		return pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
	});
	const svgStyle: React.CSSProperties = {position: 'absolute', inset: 0, width: '100%', height: '100%'};
	// ink wedges are plain black; paper wedges use `difference`, so they come out white over the black shapes and
	// black over the white ground: every line stays readable on a hard black-and-white picture
	return (
		<>
			<svg viewBox={`0 0 ${w} ${h}`} style={svgStyle}>
				{polys.map((pts, i) => (i % 3 === 0 ? <polygon key={i} points={pts} fill={ink} /> : null))}
			</svg>
			<svg viewBox={`0 0 ${w} ${h}`} style={{...svgStyle, mixBlendMode: 'difference'}}>
				{polys.map((pts, i) => (i % 3 === 0 ? null : <polygon key={i} points={pts} fill={paper} />))}
			</svg>
		</>
	);
};

/**
 * Anime impact frame: a crash zoom slams into the target, the picture flips to a black-and-white negative with
 * radial speed lines and a red / cyan fringe for a few frames, then snaps back with a decaying shake.
 * Wraps any scene; renders it up to three times, only during the impact frames.
 */
export const ImpactFrame: React.FC<ImpactFrameProps> = ({
	at = 24,
	frames = 3,
	zoom = 1.8,
	approach = 6,
	release = 0,
	target = [0.5, 0.5],
	lines = 30,
	lineWeight = 1.3,
	shake = 8,
	split = 10,
	contrast = 8,
	ink = '#111111',
	paper = '#f5f5f5',
	seed = 1,
	children,
}) => {
	const frame = useCurrentFrame();
	const {width: w, height: h} = useVideoConfig();
	const u = Math.min(w, h) / 720;
	const hits = (Array.isArray(at) ? [...at] : [at]).sort((a, b) => a - b);

	// crash zoom: 0..1 amount of the zoom at this frame (max over all hits)
	let z = 0;
	for (const hit of hits) {
		let v: number;
		if (frame < hit - approach) {
			v = 0;
		} else if (frame < hit) {
			v = approach > 0 ? Easing.in(Easing.cubic)((frame - (hit - approach)) / approach) : 1;
		} else if (frame < hit + frames || release <= 0) {
			v = 1;
		} else {
			v = 1 - CURVES.inOutCubic(clamp((frame - hit - frames) / release, 0, 1));
		}
		z = Math.max(z, v);
	}
	const s = 1 + (zoom - 1) * z;
	// put the target in the middle of the frame without ever showing outside the picture
	const tx = clamp(w / 2 - s * target[0] * w, w - s * w, 0);
	const ty = clamp(h / 2 - s * target[1] * h, h - s * h, 0);
	const cx = s * target[0] * w + tx;
	const cy = s * target[1] * h + ty;

	const hitNow = hits.find((hit) => frame >= hit && frame < hit + frames);
	const impact = hitNow !== undefined;
	const phase = impact ? frame - (hitNow as number) : 0;

	// decaying shake after the last impact frame
	const ended = hits.map((hit) => hit + frames).filter((e) => e <= frame);
	const since = ended.length > 0 ? frame - Math.max(...ended) : -1;
	const env = since >= 0 && since < 24 ? shake * u * Math.exp(-since / 2.2) : 0;
	const dx = env * Math.sin(since * 3.7);
	const dy = env * 0.7 * Math.sin(since * 5.1 + 0.9);
	// a hair of overscan while shaking so the edge never shows
	const over = env > 0.05 ? 1 + (2 * env + 2) / Math.min(w, h) : 1;

	const neg = NEG(contrast);
	const sp = split * u;
	const fringe = (color: string, dir: 1 | -1) => (
		<AbsoluteFill
			key={color}
			style={{
				mixBlendMode: 'screen',
				// a hair of overscan so the shifted copy never shows the frame edge
				transform: `translate(${dir * sp}px, ${(phase % 2 === 0 ? -dir : dir) * sp * 0.5}px) scale(${1 + (2.4 * sp) / Math.min(w, h)})`,
			}}
		>
			<AbsoluteFill style={{filter: neg}}>
				<Zoom s={s} tx={tx} ty={ty}>
					{children}
				</Zoom>
			</AbsoluteFill>
			<AbsoluteFill style={{background: color, mixBlendMode: 'multiply'}} />
		</AbsoluteFill>
	);

	return (
		<AbsoluteFill style={{background: impact ? '#131315' : undefined, overflow: 'hidden'}}>
			<AbsoluteFill style={{transform: env > 0.05 ? `translate(${dx}px, ${dy}px) scale(${over})` : undefined}}>
				<AbsoluteFill style={{filter: impact ? neg : undefined}}>
					<Zoom s={s} tx={tx} ty={ty}>
						{children}
					</Zoom>
				</AbsoluteFill>
				{impact ? (
					<>
						{sp > 0 ? [fringe('#ff0033', -1), fringe('#00e5ff', 1)] : null}
						<SpeedLines w={w} h={h} cx={cx} cy={cy} count={lines} weight={lineWeight} phase={phase} seed={seed} ink={ink} paper={paper} />
					</>
				) : null}
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

const Demo: React.FC = () => (
	<ImpactFrame at={[14, 36]} frames={3} zoom={2} approach={6} release={12} target={[0.7, 0.35]}>
		<Plate />
	</ImpactFrame>
);

export const impactFrameEntry: LibraryEntry = {
	meta: {
		id: 'impact-frame',
		title: 'Impact frame',
		category: 'fx',
		looks:
			'A 6-frame crash zoom slams into the target, then for exactly 3 frames the picture flips to a high-contrast black-and-white negative with 30 radial speed lines and a red/cyan fringe, and snaps back with a decaying shake.',
		use: 'The punch of a strike, a reveal or a drop: one per hit, never longer than 3 frames.',
		exportName: 'ImpactFrame',
		durationInFrames: 60,
		source: {
			kind: 'ported',
			name: 'video-shotcraft (AnimeImpact)',
			url: 'https://github.com/Vincentwei1021/video-shotcraft/blob/main/demos/effects/impact-feedback/AnimeImpact.tsx',
			license: 'Apache-2.0',
		},
	},
	Demo,
};
