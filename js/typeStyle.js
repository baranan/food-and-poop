/**
 * How each entry type looks: icon, label, colour class, route.
 *
 * In its own module because the home screen and the history timeline both draw
 * types, and CLAUDE.md asks that a type be recognisable at a glance. If these
 * lived in one screen and were copied into the other, they would eventually
 * disagree and the glance would start lying.
 *
 * To change an icon, change it here and it changes everywhere.
 */

import { TYPES } from './records.js';

export const TYPE_STYLE = {
  [TYPES.FOOD]: {
    route: 'food',
    className: 'food',
    icon: '🥪',
    label: 'אוכל'
  },
  [TYPES.POOP]: {
    route: 'poop',
    className: 'poop',
    icon: '💩',
    label: 'קקי'
  },
  [TYPES.SYMPTOM]: {
    route: 'symptom',
    className: 'symptom',
    icon: '🤒',
    label: 'תסמין'
  }
};

/** The order entry types are offered in, everywhere. */
export const TYPE_ORDER = [TYPES.FOOD, TYPES.POOP, TYPES.SYMPTOM];

/** Style for a type, with a harmless fallback for a hand-typed row. */
export function styleFor(type) {
  return TYPE_STYLE[type] || { route: 'home', className: '', icon: '•', label: type || '' };
}
