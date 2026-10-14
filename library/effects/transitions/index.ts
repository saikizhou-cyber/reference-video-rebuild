import type {LibraryEntry} from '../../core/types';
import {domGroup} from './dom';
import {glGroup} from './gl';
import {gsapGroup} from './gsap';
import {codropsGroup} from './codrops';

export const transitions: LibraryEntry[] = [...domGroup, ...glGroup, ...gsapGroup, ...codropsGroup];
