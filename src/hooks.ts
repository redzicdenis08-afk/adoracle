/**
 * Opening-hook detection.
 *
 * A hook is whatever the ad leads with to stop the scroll. Detection is
 * rule-based and only looks at the *opening* of the creative: the headline
 * plus the first couple of sentences of the body. A pain-point phrase buried
 * in paragraph three is copy, not a hook.
 *
 * Every detection carries a {@link Span} pointing at the exact matched text,
 * so results are always auditable.
 */

import type { Ad, CreativeField, HookDetection, HookType, Span } from './models.js';

/** How much of the body counts as "the opening", as a hard character cap. */
const OPENING_BODY_CHARS = 240;
/** How many leading sentences of the body count as "the opening". */
const OPENING_SENTENCES = 2;

interface Segment {
  field: CreativeField;
  /** The opening slice of the field. Always a prefix of the full field text. */
  text: string;
}

/** One rule: a hook type, a pattern, and how confident a match makes us. */
export interface HookRule {
  type: HookType;
  pattern: RegExp;
  confidence: number;
}

/**
 * The default rule pack. Patterns are matched case-insensitively against the
 * opening segments. When several rules of the same type match, the highest
 * confidence wins.
 */
export const HOOK_RULES: readonly HookRule[] = [
  // Numbers with teeth: money, percentages, multipliers.
  {
    type: 'stat',
    confidence: 0.85,
    pattern: /(?:\$|€|£)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s*(?:%|percent\b|x\b)/i,
  },
  // Any bare number in the opening still signals specificity, just weaker.
  {
    type: 'stat',
    confidence: 0.6,
    pattern: /\b\d[\d,]*(?:\.\d+)?\b/,
  },
  {
    type: 'pain_point',
    confidence: 0.85,
    pattern:
      /\b(?:tired of|sick of|fed up with|struggling (?:with|to)|stop wasting|frustrated (?:by|with)|hate (?:when|how|that)|still (?:can't|cannot|haven't|waiting))\b/i,
  },
  {
    type: 'social_proof',
    confidence: 0.85,
    pattern:
      /\bjoin(?:ed)? (?:over )?\d[\d,]*\+?|\b(?:trusted|loved|used) by\b|\brated \d(?:\.\d)?\b|\b\d[\d,]*\+? (?:five[- ]star )?(?:reviews|customers|members)\b|#1\b|\bbest[- ]sell(?:ing|er)\b/i,
  },
  {
    type: 'urgency',
    confidence: 0.85,
    pattern:
      /\b(?:last chance|ends (?:tonight|today|soon|this week(?:end)?|sunday|monday|friday|saturday)|today only|limited[- ](?:time|stock|supply|run)|only \d+ left|while (?:supplies|stocks) last|hurry|don'?t wait|final (?:hours|day|call)|sale ends|closing soon)\b/i,
  },
  {
    type: 'curiosity_gap',
    confidence: 0.8,
    pattern:
      /\b(?:the secrets? (?:to|behind|of)|what (?:no ?one|nobody) (?:tells|told) you|you won'?t believe|the (?:real|surprising) reason|here'?s (?:why|how|what)|this (?:one )?(?:weird |simple |little[- ]known )?(?:trick|habit|mistake|ingredient)|nobody talks about|most people (?:don'?t know|get wrong))\b/i,
  },
  {
    type: 'direct_offer',
    confidence: 0.85,
    pattern:
      /\b\d+% off\b|\bfree (?:shipping|trial)\b|\bbuy one,? get one\b|\bbogo\b|\bsave (?:\$|€|£)?\d[\d,]*\b|(?:\$|€|£)\d[\d,]* off\b|\bstarting at (?:\$|€|£)?\d[\d,]*\b|\bfirst (?:bag|box|month|order) (?:free|on us)\b/i,
  },
];

const STRONG_QUESTION_OPENER =
  /^(?:what|why|how|when|where|who|which|did|do|does|are|is|have|has|can|could|would|will|ever|still|tired|struggling|want|ready|need)\b/i;

/** Split into sentences while keeping offsets recoverable via indexOf. */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== '');
}

/**
 * The opening slice of a body: the first {@link OPENING_SENTENCES} sentences,
 * hard-capped at {@link OPENING_BODY_CHARS} characters. Always a prefix of the
 * input, so span offsets computed inside it are valid for the full field.
 */
export function openingOf(body: string): string {
  const boundary = /[.!?]+(?:\s+|$)/g;
  let count = 0;
  let end = body.length;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(body)) !== null) {
    count += 1;
    if (count === OPENING_SENTENCES) {
      end = match.index + match[0].length;
      break;
    }
  }
  return body.slice(0, Math.min(end, OPENING_BODY_CHARS));
}

function openingSegments(ad: Ad): Segment[] {
  const segments: Segment[] = [];
  if (ad.headline && ad.headline.trim() !== '') {
    segments.push({ field: 'headline', text: ad.headline });
  }
  if (ad.body && ad.body.trim() !== '') {
    segments.push({ field: 'body', text: openingOf(ad.body) });
  }
  return segments;
}

function makeSpan(segment: Segment, start: number, end: number): Span {
  return { field: segment.field, start, end, text: segment.text.slice(start, end) };
}

/** Question hooks need sentence awareness, so they get a dedicated detector. */
function detectQuestion(segments: Segment[]): HookDetection | undefined {
  for (const segment of segments) {
    let cursor = 0;
    for (const sentence of sentencesOf(segment.text)) {
      const index = segment.text.indexOf(sentence, cursor);
      if (index === -1) continue;
      cursor = index + sentence.length;
      const trimmed = sentence.trim();
      if (!trimmed.endsWith('?')) continue;
      const confidence = STRONG_QUESTION_OPENER.test(trimmed) ? 0.9 : 0.75;
      return {
        type: 'question',
        confidence,
        evidence: makeSpan(segment, index, index + sentence.length),
      };
    }
  }
  return undefined;
}

/**
 * Detect every opening hook in an ad. At most one detection per hook type is
 * returned (the highest-confidence match), sorted by confidence descending.
 */
export function detectHooks(ad: Ad, rules: readonly HookRule[] = HOOK_RULES): HookDetection[] {
  const segments = openingSegments(ad);
  const best = new Map<HookType, HookDetection>();

  const question = detectQuestion(segments);
  if (question) best.set('question', question);

  for (const rule of rules) {
    for (const segment of segments) {
      const match = rule.pattern.exec(segment.text);
      if (!match) continue;
      const detection: HookDetection = {
        type: rule.type,
        confidence: rule.confidence,
        evidence: makeSpan(segment, match.index, match.index + match[0].length),
      };
      const previous = best.get(rule.type);
      if (!previous || detection.confidence > previous.confidence) {
        best.set(rule.type, detection);
      }
    }
  }

  return [...best.values()].sort(
    (a, b) => b.confidence - a.confidence || a.type.localeCompare(b.type),
  );
}
