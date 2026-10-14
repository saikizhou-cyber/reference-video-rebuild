import type {LibraryEntry} from '../../core/types';
import {burstsGroup} from './bursts';
import {hudGroup} from './hud';
import {gsapGroup} from './gsap';

export const shapes: LibraryEntry[] = [...burstsGroup, ...hudGroup, ...gsapGroup];
