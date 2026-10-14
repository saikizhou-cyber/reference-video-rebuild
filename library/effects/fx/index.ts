import type {LibraryEntry} from '../../core/types';
import {signalGroup} from './signal';
import {lookGroup} from './look';
import {hitsGroup} from './hits';
import {codropsGroup} from './codrops';

export const fx: LibraryEntry[] = [...signalGroup, ...lookGroup, ...hitsGroup, ...codropsGroup];
