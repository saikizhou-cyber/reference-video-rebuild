import type {LibraryEntry} from '../../core/types';
import {crtOffEntry} from './crt-off';
import {dustDissolveEntry} from './dust-dissolve';
import {glitchCutEntry} from './glitch-cut';
import {lensPunchEntry} from './lens-punch';
import {pixelateEntry} from './pixelate';
import {revolveEntry} from './revolve';
import {screenMeltEntry} from './screen-melt';
import {shatterEntry} from './shatter';
import {swishEntry} from './swish';

/** group 'gl' of transitions: one entry per effect file in this folder */
export const glGroup: LibraryEntry[] = [
	glitchCutEntry,
	lensPunchEntry,
	dustDissolveEntry,
	revolveEntry,
	swishEntry,
	screenMeltEntry,
	shatterEntry,
	crtOffEntry,
	pixelateEntry,
];
