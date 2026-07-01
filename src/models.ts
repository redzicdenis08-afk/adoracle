/**
 * Canonical data model for adoracle.
 *
 * Everything downstream (hook detection, angle analysis, scoring, reporting)
 * operates on the {@link Ad} shape. Normalizers in `normalize.ts` are the only
 * code that knows about source-specific formats.
 */

/** Platforms adoracle understands. Unknown sources map to `other`. */
export type Platform =
  | 'meta'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'pinterest'
  | 'other';

/** The dominant creative medium of the ad. */
export type MediaType = 'video' | 'image' | 'carousel' | 'text' | 'unknown';

/** The creative text fields evidence spans can point into. */
export type CreativeField = 'headline' | 'body' | 'linkDescription' | 'cta';

/**
 * One canonical ad, regardless of which ad library it came from.
 */
export interface Ad {
  /** Stable identifier: the source record id, or a deterministic hash of the record. */
  id: string;
  /** Advertiser / brand / page name. `unknown` when the source omits it. */
  advertiser: string;
  platform: Platform;
  /** ISO-8601 date the ad was first seen delivering. */
  firstSeen?: string;
  /** ISO-8601 date the ad was last seen delivering (absent while still active). */
  lastSeen?: string;
  /** Days the ad has been (or was) live. Always >= 1 when `firstSeen` is known. */
  daysActive?: number;
  /** Whether the ad appears to still be running. */
  active: boolean;
  headline?: string;
  body?: string;
  /** Secondary description line (Meta's `ad_creative_link_descriptions`). */
  linkDescription?: string;
  /** Call to action, humanized (e.g. `SHOP_NOW` becomes `Shop now`). */
  cta?: string;
  /** Bare landing-page domain, `www.` stripped (e.g. `glowbrew.example`). */
  landingDomain?: string;
  mediaType: MediaType;
  /** BCP-47-ish language tags reported by the source. */
  languages: string[];
}

/**
 * A span of matched text inside one creative field. Every detection carries
 * one or more of these so a claim like "this is an urgency hook" can always
 * be traced back to the exact words that triggered it.
 *
 * Invariant: `ad[field].slice(start, end) === text`.
 */
export interface Span {
  field: CreativeField;
  start: number;
  end: number;
  text: string;
}

/** Opening-hook taxonomy. */
export type HookType =
  | 'question'
  | 'stat'
  | 'pain_point'
  | 'social_proof'
  | 'urgency'
  | 'curiosity_gap'
  | 'direct_offer';

export const ALL_HOOK_TYPES: readonly HookType[] = [
  'question',
  'stat',
  'pain_point',
  'social_proof',
  'urgency',
  'curiosity_gap',
  'direct_offer',
];

/** One detected opening hook, with the exact text that triggered it. */
export interface HookDetection {
  type: HookType;
  /** Rule confidence in [0, 1]. Heuristic, not a probability. */
  confidence: number;
  evidence: Span;
}

/** Persuasion-angle taxonomy. */
export type AngleType =
  | 'price'
  | 'quality'
  | 'speed'
  | 'trust'
  | 'fomo'
  | 'transformation';

export const ALL_ANGLE_TYPES: readonly AngleType[] = [
  'price',
  'quality',
  'speed',
  'trust',
  'fomo',
  'transformation',
];

/** One detected persuasion angle with every matched span (capped). */
export interface AngleDetection {
  type: AngleType;
  /** Grows with the number of independent evidence spans, capped at 0.95. */
  confidence: number;
  evidence: Span[];
}

/** One weighted signal inside a creative score. */
export interface ScoreFactor {
  name: 'hook' | 'specificity' | 'cta' | 'length' | 'readability' | 'repetition';
  /** Points this factor can contribute. All weights sum to 100. */
  weight: number;
  /** Normalized signal strength in [0, 1]. */
  raw: number;
  /** `weight * raw`, rounded to one decimal. */
  weighted: number;
  /** Human-readable justification. */
  detail: string;
}

/** Deterministic 0-100 creative score with a full factor breakdown. */
export interface CreativeScore {
  total: number;
  factors: ScoreFactor[];
}

/** Everything adoracle can say about one ad. */
export interface AdAnalysis {
  ad: Ad;
  hooks: HookDetection[];
  angles: AngleDetection[];
  score: CreativeScore;
}
