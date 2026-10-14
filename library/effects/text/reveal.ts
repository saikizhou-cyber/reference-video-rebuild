import type {LibraryEntry} from '../../core/types';
import {slamText} from './slam-text';
import {charCascadeEntry} from './char-cascade';
import {maskRiseEntry} from './mask-rise';
import {barRevealEntry} from './bar-reveal';
import {trackingInEntry} from './tracking-in';
import {typewriterEntry} from './typewriter';
import {scrambleDecodeEntry} from './scramble-decode';
import {splitFlapEntry} from './split-flap';
import {numberRollEntry} from './number-roll';
import {beatWordsEntry} from './beat-words';

/** group 'reveal' of text: one entry per effect file in this folder */
export const revealGroup: LibraryEntry[] = [
	slamText,
	charCascadeEntry,
	maskRiseEntry,
	barRevealEntry,
	trackingInEntry,
	typewriterEntry,
	scrambleDecodeEntry,
	splitFlapEntry,
	numberRollEntry,
	beatWordsEntry,
];
