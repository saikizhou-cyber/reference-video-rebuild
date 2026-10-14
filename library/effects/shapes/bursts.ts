import type {LibraryEntry} from '../../core/types';
import {alertBurstEntry} from './alert-burst';
import {confettiEntry} from './confetti';
import {patternScrollEntry} from './pattern-scroll';
import {radialBurstEntry} from './radial-burst';
import {shardSprayEntry} from './shard-spray';
import {shockwaveRingsEntry} from './shockwave-rings';
import {speedLinesEntry} from './speed-lines';
import {trimBurstEntry} from './trim-burst';

/** group 'bursts' of shapes: one entry per effect file in this folder */
export const burstsGroup: LibraryEntry[] = [
	speedLinesEntry,
	trimBurstEntry,
	radialBurstEntry,
	shockwaveRingsEntry,
	alertBurstEntry,
	shardSprayEntry,
	confettiEntry,
	patternScrollEntry,
];
