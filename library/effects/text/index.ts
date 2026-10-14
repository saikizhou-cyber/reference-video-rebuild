import type {LibraryEntry} from '../../core/types';
import {revealGroup} from './reveal';
import {displayGroup} from './display';
import {gsapGroup} from './gsap';
import {codropsGroup} from './codrops';

export const text: LibraryEntry[] = [...revealGroup, ...displayGroup, ...gsapGroup, ...codropsGroup];
