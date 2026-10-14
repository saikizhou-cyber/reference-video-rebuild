import type {LibraryEntry} from '../../core/types';
import {outlineDrawEntry} from './outline-draw';
import {glitchTextEntry} from './glitch-text';
import {rushTypeEntry} from './rush-type';
import {extrudePopEntry} from './extrude-pop';
import {typeWallEntry} from './type-wall';
import {typePlaneEntry} from './type-plane';
import {slicedTextEntry} from './sliced-text';
import {echoStackEntry} from './echo-stack';
import {textCylinderEntry} from './text-cylinder';

/** group 'display' of text: one entry per effect file in this folder */
export const displayGroup: LibraryEntry[] = [
	outlineDrawEntry,
	glitchTextEntry,
	rushTypeEntry,
	extrudePopEntry,
	typeWallEntry,
	typePlaneEntry,
	slicedTextEntry,
	echoStackEntry,
	textCylinderEntry,
];
