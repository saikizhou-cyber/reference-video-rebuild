import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import gsap from 'gsap';
import {SplitText} from 'gsap/SplitText';
import {progress, CURVES} from '../../core/easing';
import {useGsapTimeline, type GsapBuild} from '../../core/gsap';
import {Backdrop, BODY_FONT, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';

gsap.registerPlugin(SplitText);

export type ParagraphMode = 'rise' | 'words' | 'flip';

export type ParagraphRevealProps = {
	/** the copy; it wraps at `width`, SplitText finds the real line breaks. "\n" forces a break */
	text: string;
	/**
	 * 'rise'  = characters climb out of an invisible mask on every line;
	 * 'words' = whole words slide up out of the line masks with a slight tilt;
	 * 'flip'  = characters flip in on rotateX from -90deg (perspective, hinge at the baseline)
	 */
	mode?: ParagraphMode;
	/** frames between consecutive units (characters for rise / flip, words for words); default depends on the mode */
	stagger?: number;
	/** frames each unit takes to arrive */
	inFrames?: number;
	/** width of the text block, px at 720p */
	width?: number;
	/** px at 720p */
	fontSize?: number;
	fontFamily?: string;
	fontWeight?: number;
	/** unitless multiple of fontSize; keep >= 1.2 so the line masks do not shave ascenders */
	lineHeight?: number;
	/** em */
	letterSpacing?: number;
	align?: 'left' | 'center' | 'right';
	color?: string;
	/** colour of the highlighted words */
	accent?: string;
	/** words (or consecutive-word phrases) coloured with `accent`; case and punctuation are ignored */
	highlight?: readonly string[];
	/** frame (of this Sequence) the lines start to slide out upwards; null = the copy stays */
	exitAt?: number | null;
	/** frames each line takes to leave */
	exitFrames?: number;
	/** frames between consecutive lines leaving */
	exitStagger?: number;
	style?: React.CSSProperties;
};

const DEFAULT_STAGGER: Record<ParagraphMode, number> = {rise: 0.45, words: 2.5, flip: 0.55};
/** how far (in % of its own box) a unit starts below its mask: enough to clear descenders and the tilt */
const TRAVEL = 130;

/** lower-case letters and digits only, so "Harrow," matches "harrow" */
const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** indices of the words covered by any highlight phrase (one or more consecutive words) */
const matchHighlights = (words: readonly string[], phrases: readonly string[]): Set<number> => {
	const keys = words.map(norm);
	const hit = new Set<number>();
	for (const phrase of phrases) {
		const toks = phrase.split(/\s+/).map(norm).filter(Boolean);
		if (!toks.length) {
			continue;
		}
		for (let i = 0; i + toks.length <= keys.length; i++) {
			if (toks.every((t, k) => keys[i + k] === t)) {
				toks.forEach((_, k) => hit.add(i + k));
			}
		}
	}
	return hit;
};

/**
 * SplitText measures the line breaks once, with whatever font is on screen at that moment. A webfont that arrives
 * later (FontFace, @remotion/google-fonts) would leave the lines split with the fallback font's metrics: orphan
 * words, lines that fall short of the block width. This hook returns a counter that grows every time the document's
 * fonts finish loading; it is part of the rebuild key, so the paragraph is split again with the real font.
 * While a font the copy needs is still loading, and until the re-split has been committed, the render is held with
 * delayRender, so no frame is captured with the fallback line breaks.
 * Fonts already loaded at mount (system fonts included) cost nothing: no wait, no second split.
 */
const useFontEpoch = (spec: string, sample: string): number => {
	const [epoch, setEpoch] = useState(0);
	const asked = useRef(0);
	const holds = useRef<{handle: number; need: number}[]>([]);

	useLayoutEffect(() => {
		const fonts = typeof document === 'undefined' ? undefined : document.fonts;
		if (!fonts) {
			return;
		}
		let alive = true;
		const hold = (need: number) => holds.current.push({handle: delayRender('paragraph-reveal: waiting for fonts before splitting the lines'), need});
		const resplit = () => {
			if (alive) {
				asked.current += 1;
				hold(asked.current);
				setEpoch(asked.current);
			}
		};
		let waiting = false;
		const onDone = () => {
			waiting = false;
			resplit();
		};
		fonts.addEventListener('loadingdone', onDone);
		let pending = fonts.status === 'loading';
		try {
			pending = pending || !fonts.check(spec, sample);
		} catch {
			// a font shorthand the browser cannot parse: nothing to wait for
		}
		if (pending) {
			waiting = true;
			// released by the re-split that follows, whichever of the two signals below arrives first
			hold(asked.current + 1);
			Promise.resolve(fonts.load(spec, sample))
				.catch(() => undefined)
				.then(() => fonts.ready)
				.then(() => {
					if (waiting) {
						waiting = false;
						resplit();
					}
				});
		}
		return () => {
			alive = false;
			fonts.removeEventListener('loadingdone', onDone);
			holds.current.splice(0).forEach((h) => continueRender(h.handle));
		};
	}, [spec, sample]);

	// passive effects run after the layout effects of the same commit: by then the timeline is rebuilt for this epoch
	useEffect(() => {
		holds.current = holds.current.filter((h) => {
			if (h.need <= epoch) {
				continueRender(h.handle);
				return false;
			}
			return true;
		});
	}, [epoch]);

	return epoch;
};

/**
 * Long multi-line copy revealed with GSAP SplitText, which measures the REAL line breaks (the text wraps at `width`
 * like in a browser) and wraps each line in a clip mask. Starts at frame 0 of its <Sequence>.
 * Rise / words slide out of the line masks, flip hinges characters up on rotateX; `highlight` words take the accent
 * colour; `exitAt` slides the lines out upwards, staggered. Split happens inside the timeline build, never outside.
 * A webfont given as `fontFamily` should be loaded before this mounts (e.g. @remotion/google-fonts loadFont() at
 * module level): the paragraph then waits for it and splits with its real metrics (see useFontEpoch).
 */
export const ParagraphReveal: React.FC<ParagraphRevealProps> = ({
	text,
	mode = 'rise',
	stagger,
	inFrames = 16,
	width = 800,
	fontSize = 36,
	fontFamily = BODY_FONT,
	fontWeight = 700,
	lineHeight = 1.4,
	letterSpacing = 0,
	align = 'left',
	color = DEMO.paper,
	accent = DEMO.yellow,
	highlight = [],
	exitAt = null,
	exitFrames = 12,
	exitStagger = 3,
	style,
}) => {
	const u = useUnit();
	const {fps} = useVideoConfig();
	const each = stagger ?? DEFAULT_STAGGER[mode];
	const fontEpoch = useFontEpoch(`${fontWeight} ${fontSize * u}px ${fontFamily}`, text);
	const sig = [fontEpoch, text, mode, each, inFrames, width, fontSize, fontFamily, fontWeight, lineHeight, letterSpacing, align, color, accent, highlight.join('|'), exitAt, exitFrames, exitStagger, u, fps].join('~');

	const build: GsapBuild<HTMLDivElement> = (tl, q) => {
		const copy = q('.copy')[0] as HTMLElement;
		const splitChars = mode !== 'words';
		// the split lives inside gsap.context (core/gsap.ts): it is reverted when the timeline is rebuilt or unmounted
		const split = SplitText.create(copy, {
			type: splitChars ? 'lines,words,chars' : 'lines,words',
			mask: mode === 'flip' ? undefined : 'lines',
			linesClass: 'pr-line',
			wordsClass: 'pr-word',
			charsClass: 'pr-char',
		});
		const words = split.words as HTMLElement[];
		const hit = matchHighlights(words.map((w) => w.textContent ?? ''), highlight);
		if (hit.size) {
			tl.set([...hit].map((i) => words[i]), {color: accent}, 0);
		}

		const dur = inFrames / fps;
		const step = each / fps;
		if (mode === 'rise') {
			tl.from(split.chars, {yPercent: TRAVEL, rotation: 5, transformOrigin: '0% 100%', duration: dur, ease: 'power4.out', stagger: step}, 0);
		} else if (mode === 'words') {
			tl.from(split.words, {yPercent: TRAVEL, rotation: 9, transformOrigin: '0% 100%', duration: dur, ease: 'expo.out', stagger: step}, 0);
		} else {
			tl.from(
				split.chars,
				{rotationX: -90, opacity: 0, transformPerspective: 520 * u, transformOrigin: '50% 100%', duration: dur, ease: 'back.out(1.8)', stagger: step},
				0,
			);
		}

		if (exitAt !== null) {
			// lines leave through their masks; flip has no masks, so its lines fade as they go
			tl.to(
				split.lines,
				{yPercent: -TRAVEL, ...(mode === 'flip' ? {opacity: 0} : {}), duration: exitFrames / fps, ease: 'power2.in', stagger: exitStagger / fps},
				exitAt / fps,
			);
		}
	};

	const scope = useGsapTimeline<HTMLDivElement>(build, [sig]);
	const rows = text.split('\n');
	return (
		<div ref={scope} style={{width: width * u, ...style}}>
			{/* keyed by every input: SplitText rewrites this subtree, so React must never patch it in place */}
			<div
				key={sig}
				className="copy"
				style={{
					fontFamily,
					fontWeight,
					fontSize: fontSize * u,
					lineHeight,
					letterSpacing: `${letterSpacing}em`,
					textAlign: align,
					color,
					fontKerning: 'none',
				}}
			>
				{rows.flatMap((row, i) => (i ? [<br key={`br${i}`} />, row] : [row]))}
			</div>
		</div>
	);
};

const LORE =
	'The tide stopped coming in three winters ago. Since then the lamps of Harrow Deep burn without oil, and the few who still remember the sea keep one last light alive.';

const Demo: React.FC = () => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const bar = progress(frame, 0, 26, CURVES.expoOut);
	const barOut = progress(frame, 126, 20, CURVES.expoIn);
	const label = interpolate(frame, [0, 10], [0, 1], {extrapolateRight: 'clamp'}) * (1 - barOut);
	return (
		<Backdrop>
			<AbsoluteFill style={{justifyContent: 'center', paddingLeft: 150 * u}}>
				<div style={{display: 'flex', alignItems: 'stretch', gap: 34 * u}}>
					<div style={{width: 6 * u, background: DEMO.yellow, transformOrigin: '50% 0%', transform: `scaleY(${bar * (1 - barOut)})`}} />
					<div>
						<div
							style={{
								fontFamily: DISPLAY_FONT,
								fontSize: 28 * u,
								letterSpacing: '0.28em',
								color: DEMO.cyan,
								marginBottom: 26 * u,
								opacity: label,
							}}
						>
							ARCHIVE 07 / THE LONG TIDE
						</div>
						<ParagraphReveal
							text={LORE}
							mode="rise"
							width={940}
							fontSize={46}
							highlight={['tide', 'light']}
							accent={DEMO.yellow}
							exitAt={112}
							exitFrames={18}
							exitStagger={5}
							stagger={0.3}
						/>
					</div>
				</div>
			</AbsoluteFill>
		</Backdrop>
	);
};

export const paragraphRevealEntry: LibraryEntry = {
	meta: {
		id: 'paragraph-reveal',
		title: 'Paragraph reveal',
		category: 'text',
		looks: 'A four-line lore paragraph climbs out of invisible line masks character by character (SplitText finds the real line breaks), two words glow yellow, then the lines slide out upwards one after another; also word-slide and character-flip modes.',
		use: 'Story text between hype shots, mission briefings, intro lore, subtitles and closing credits: any copy longer than one line.',
		exportName: 'ParagraphReveal',
		durationInFrames: 150,
		deps: ['gsap'],
		source: {kind: 'original'},
	},
	Demo,
};
