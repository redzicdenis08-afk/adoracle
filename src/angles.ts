/**
 * Persuasion-angle analysis.
 *
 * While hooks are about *how the ad opens*, angles are about *what argument
 * the ad makes anywhere in the creative*: price, quality, speed, trust,
 * fear-of-missing-out, or transformation. An ad can (and good ads often do)
 * run several angles at once, so detections are multi-label.
 *
 * Confidence grows with the number of independent evidence spans and is
 * capped below 1: a regex match is a strong hint, never proof.
 */

import type { Ad, AngleDetection, AngleType, CreativeField, Span } from './models.js';

/** Cap on stored evidence spans per angle, to keep output readable. */
const MAX_EVIDENCE = 6;

export interface AngleRule {
  type: AngleType;
  /** Must carry the `g` flag; matched with `matchAll` across every text field. */
  pattern: RegExp;
}

/** The default angle rule pack, matched against every creative text field. */
export const ANGLE_RULES: readonly AngleRule[] = [
  {
    type: 'price',
    pattern:
      /\b\d+% off\b|(?:\$|€|£)\s?\d[\d,]*(?:\.\d{2})?|\b(?:cheap(?:er|est)?|affordable|budget[- ]friendly|save (?:money|big|up to)|no hidden fees|half the price|price[- ]match|lowest price|free shipping|great value)\b/gi,
  },
  {
    type: 'quality',
    pattern:
      /\b(?:premium|hand[- ]?crafted|hand[- ]?made|small[- ]batch|top[- ]rated|highest[- ]quality|built to last|artisan(?:al)?|finest|craftsmanship|best[- ]in[- ]class|luxur(?:y|ious))\b/gi,
  },
  {
    type: 'speed',
    pattern:
      /\b(?:in (?:just )?(?:minutes|seconds)|in (?:just )?\d+ (?:minutes|seconds|hours|days)|instant(?:ly)?|same[- ]day|next[- ]day|overnight|within \d+ (?:hours|days)|fast(?:er|est)?|quick(?:ly|est)?|ships? (?:today|tomorrow|free))\b/gi,
  },
  {
    type: 'trust',
    pattern:
      /\b(?:guaranteed?|money[- ]back|certified|clinically (?:proven|tested)|dermatologist[- ](?:tested|approved)|award[- ]winning|trusted by|as seen (?:in|on)|\d+[- ]year warranty|since (?:19|20)\d{2}|backed by|no[- ]risk)\b/gi,
  },
  {
    type: 'fomo',
    pattern:
      /\b(?:don'?t miss(?: out| it| this)?|selling out|almost gone|limited edition|limited[- ]time|only \d+ left|before (?:it'?s|they'?re) gone|while (?:supplies|stocks) last|join the waitlist|everyone'?s talking about|going fast|last chance|back in stock)\b/gi,
  },
  {
    type: 'transformation',
    pattern:
      /\b(?:before (?:and|&) after|went from|say goodbye to|say hello to|transform(?:s|ed|ation)?|life[- ]changing|no more \w+|in (?:just )?\d+ (?:days|weeks)|imagine (?:waking|feeling|having|finally)|start(?:ed)? (?:sleeping|feeling|waking))\b/gi,
  },
];

interface FieldText {
  field: CreativeField;
  text: string;
}

function creativeFields(ad: Ad): FieldText[] {
  const fields: FieldText[] = [];
  if (ad.headline) fields.push({ field: 'headline', text: ad.headline });
  if (ad.body) fields.push({ field: 'body', text: ad.body });
  if (ad.linkDescription) fields.push({ field: 'linkDescription', text: ad.linkDescription });
  if (ad.cta) fields.push({ field: 'cta', text: ad.cta });
  return fields;
}

/** 1 span -> 0.6, each extra span +0.1, capped at 0.95. */
function confidenceFor(evidenceCount: number): number {
  return Math.min(0.95, Math.round((0.6 + 0.1 * (evidenceCount - 1)) * 100) / 100);
}

/**
 * Detect every persuasion angle present in the ad's creative text. Results
 * are sorted by confidence, then evidence count, then type name — all
 * deterministic tie-breaks.
 */
export function detectAngles(
  ad: Ad,
  rules: readonly AngleRule[] = ANGLE_RULES,
): AngleDetection[] {
  const fields = creativeFields(ad);
  const detections: AngleDetection[] = [];

  for (const rule of rules) {
    const evidence: Span[] = [];
    for (const { field, text } of fields) {
      for (const match of text.matchAll(rule.pattern)) {
        if (match.index === undefined) continue;
        evidence.push({
          field,
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
        });
        if (evidence.length >= MAX_EVIDENCE) break;
      }
      if (evidence.length >= MAX_EVIDENCE) break;
    }
    if (evidence.length > 0) {
      detections.push({
        type: rule.type,
        confidence: confidenceFor(evidence.length),
        evidence,
      });
    }
  }

  return detections.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.evidence.length - a.evidence.length ||
      a.type.localeCompare(b.type),
  );
}
