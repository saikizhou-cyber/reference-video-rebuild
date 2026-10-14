import type {LibraryEntry} from '../../core/types';
import {rgbSplitEntry} from './rgb-split';
import {analogGlitchEntry} from './analog-glitch';
import {blockGlitchEntry} from './block-glitch';
import {vhsEntry} from './vhs';
import {crtEntry} from './crt';
import {filmGrainEntry} from './film-grain';
import {zoomBlurEntry} from './zoom-blur';

/** group 'signal' of fx: one entry per effect file in this folder */
export const signalGroup: LibraryEntry[] = [
	rgbSplitEntry,
	analogGlitchEntry,
	blockGlitchEntry,
	vhsEntry,
	crtEntry,
	filmGrainEntry,
	zoomBlurEntry,
];
