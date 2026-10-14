import type {Category, LibraryEntry} from '../core/types';
import {camera} from '../effects/camera';
import {fx} from '../effects/fx';
import {shapes} from '../effects/shapes';
import {text} from '../effects/text';
import {timing} from '../effects/timing';
import {transitions} from '../effects/transitions';

export const CATEGORIES: Category[] = ['transitions', 'text', 'camera', 'fx', 'shapes', 'timing'];

export const LIBRARY: LibraryEntry[] = [...transitions, ...text, ...camera, ...fx, ...shapes, ...timing];
