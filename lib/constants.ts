// lib/constants.ts — Shared constants

export const CATEGORIES = [
  'Sports',
  'History',
  'Science',
  'Entertainment',
  'Music',
  'Current Events',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_ABBR: Record<string, string> = {
  Sports: 'SPR',
  History: 'HIS',
  Science: 'SCI',
  Entertainment: 'ENT',
  Music: 'MUS',
  'Current Events': 'CUR',
  Other: 'OTH',
};

// Lookup map: lowercase → canonical name
const CATEGORY_LOOKUP: Record<string, Category> = {};
for (const cat of CATEGORIES) {
  CATEGORY_LOOKUP[cat.toLowerCase()] = cat;
}
// Aliases
CATEGORY_LOOKUP['pop culture'] = 'Entertainment';

/**
 * Normalize a category string to its canonical CATEGORIES form.
 * Falls back to "Other" if unrecognized.
 */
export function normalizeCategory(raw: string): Category {
  return CATEGORY_LOOKUP[raw.toLowerCase().trim()] ?? 'Other';
}
