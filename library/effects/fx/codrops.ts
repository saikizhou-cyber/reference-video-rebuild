import type {LibraryEntry} from '../../core/types';
import {asciiGlyphEntry} from './ascii-glyph';
import {lensShiftEntry} from './lens-shift';

/** group 'codrops' of fx: ports and reimplementations of MIT-licensed Codrops demos; one entry per effect file in this folder */
export const codropsGroup: LibraryEntry[] = [lensShiftEntry, asciiGlyphEntry];
