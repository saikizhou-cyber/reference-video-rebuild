import type {LibraryEntry} from '../../core/types';
import {barWipeEntry} from './bar-wipe';
import {comicPanelsEntry} from './comic-panels';
import {flareSweepEntry} from './flare-sweep';
import {halftoneWipeEntry} from './halftone-wipe';
import {impactCutEntry} from './impact-cut';
import {shapeBurstEntry} from './shape-burst';
import {strobeCutEntry} from './strobe-cut';
import {textMaskZoomEntry} from './text-mask-zoom';
import {versusSlamEntry} from './versus-slam';

/** group 'dom' of transitions: one entry per effect file in this folder */
export const domGroup: LibraryEntry[] = [
	barWipeEntry,
	impactCutEntry,
	strobeCutEntry,
	shapeBurstEntry,
	halftoneWipeEntry,
	textMaskZoomEntry,
	versusSlamEntry,
	comicPanelsEntry,
	flareSweepEntry,
];
