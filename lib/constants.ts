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
