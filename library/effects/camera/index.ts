import type {LibraryEntry} from '../../core/types';
import {movesGroup} from './moves';
import {spaceGroup} from './space';

export const camera: LibraryEntry[] = [...movesGroup, ...spaceGroup];
