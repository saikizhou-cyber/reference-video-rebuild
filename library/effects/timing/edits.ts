import type {LibraryEntry} from '../../core/types';
import {trailerHookEntry} from './trailer-hook';
import {beatAccelerandoEntry} from './beat-accelerando';
import {blackoutSlamEntry} from './blackout-slam';
import {strobeBlackoutEntry} from './strobe-blackout';
import {flashFreezeEntry} from './flash-freeze';
import {speedRampEntry} from './speed-ramp';
import {hitStopEntry} from './hit-stop';
import {cadenceShiftEntry} from './cadence-shift';

/** group 'edits' of timing: one entry per effect file in this folder */
export const editsGroup: LibraryEntry[] = [
	trailerHookEntry,
	beatAccelerandoEntry,
	blackoutSlamEntry,
	strobeBlackoutEntry,
	flashFreezeEntry,
	speedRampEntry,
	hitStopEntry,
	cadenceShiftEntry,
];
