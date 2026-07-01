/**
 * Deterministic creative scoring.
 *
 * The score is a weighted sum of six normalized signals, always 0-100, with
 * the full factor breakdown attached. Same ad in, same score out — no
 * randomness, no network, no model. The point is not that a regex heuristic
 * beats a human reviewer; it is that a *transparent, reproducible* baseline
 * lets you rank thousands of creatives and audit every single number.
 */

import { detectHooks } from './hooks.js';
import type { Ad, CreativeScore, HookDetection, ScoreFactor } from './models.js';

/** Factor weights. They sum to exactly 100. */
export const SCORE_WEIGHTS = {
  hook: 30,
  specificity: 20,
  cta: 15,
  length: 15,
  readability: 10,
  repetition: 10,
} as const;

const STRONG_CTA =
  /^(?:shop|get|start|try|claim|book|order|download|subscribe|join|buy|grab|sign up|reserve|unlock|apply|save)\b/i;
const GENERIC_CTA =
  /^(?:learn more|see more|read more|watch more|find out|discover|explore|contact us|visit|like page|follow)\b/i;
const INLINE_CTA =
  /\b(?:shop now|order now|buy now|sign up|get started|try (?:it |us )?free|claim your|start your)\b/i;

const NUMBER_PATTERN =
  /(?:\$|€|£)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s*(?:%|percent|x\b)|\b\d[\d,]*(?:\.\d+)?\b/g;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fullText(ad: Ad): string {
  return [ad.headline, ad.body, ad.linkDescription, ad.cta]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(' ');
}

function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((w) => w !== '');
}

function factor(
  name: ScoreFactor['name'],
  raw: number,
  detail: string,
): ScoreFactor {
  const weight = SCORE_WEIGHTS[name];
  const clamped = round2(clamp01(raw));
  return {
    name,
    weight,
    raw: clamped,
    weighted: Math.round(weight * clamped * 10) / 10,
    detail,
  };
}

function hookFactor(hooks: HookDetection[]): ScoreFactor {
  if (hooks.length === 0) {
    return factor('hook', 0, 'no recognizable opening hook');
  }
  const best = hooks[0];
  const raw = clamp01(best.confidence + 0.05 * (hooks.length - 1));
  return factor(
    'hook',
    raw,
    `${best.type} hook ("${best.evidence.text}")${
      hooks.length > 1 ? ` plus ${hooks.length - 1} more` : ''
    }`,
  );
}

function specificityFactor(text: string, wordCount: number): ScoreFactor {
  if (wordCount === 0) {
    return factor('specificity', 0, 'no creative text');
  }
  const matches = [...text.matchAll(NUMBER_PATTERN)];
  const per100 = (matches.length / wordCount) * 100;
  const raw = clamp01(per100 / 6);
  return factor(
    'specificity',
    raw,
    `${matches.length} concrete figure(s) in ${wordCount} words`,
  );
}

function ctaFactor(ad: Ad, text: string): ScoreFactor {
  const cta = ad.cta?.trim();
  if (cta) {
    if (STRONG_CTA.test(cta)) {
      return factor('cta', 1, `strong action CTA ("${cta}")`);
    }
    if (GENERIC_CTA.test(cta)) {
      return factor('cta', 0.55, `generic CTA ("${cta}")`);
    }
    return factor('cta', 0.75, `CTA present ("${cta}")`);
  }
  const inline = INLINE_CTA.exec(text);
  if (inline) {
    return factor('cta', 0.5, `no CTA field, but copy contains "${inline[0]}"`);
  }
  return factor('cta', 0, 'no call to action found');
}

function lengthFactor(wordCount: number): ScoreFactor {
  let raw: number;
  if (wordCount === 0) raw = 0;
  else if (wordCount < 8) raw = 0.3;
  else if (wordCount < 15) raw = 0.7;
  else if (wordCount <= 150) raw = 1;
  else if (wordCount <= 250) raw = 0.7;
  else raw = 0.4;
  return factor('length', raw, `${wordCount} words`);
}

function readabilityFactor(text: string, words: string[]): ScoreFactor {
  if (words.length === 0) {
    return factor('readability', 0, 'no creative text');
  }
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim() !== '');
  const sentenceCount = Math.max(1, sentences.length);
  const avgSentence = words.length / sentenceCount;
  const avgWord = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  let raw: number;
  if (avgSentence <= 12) raw = 1;
  else if (avgSentence <= 18) raw = 0.85;
  else if (avgSentence <= 25) raw = 0.6;
  else raw = 0.35;
  if (avgWord > 7) raw -= 0.15;
  return factor(
    'readability',
    raw,
    `~${Math.round(avgSentence)} words/sentence, ${round2(avgWord)} chars/word`,
  );
}

function repetitionFactor(words: string[]): ScoreFactor {
  const content = words
    .map((w) => w.toLowerCase().replace(/[^a-z0-9']/g, ''))
    .filter((w) => w.length >= 4);
  if (content.length < 8) {
    return factor('repetition', 1, 'too little text to penalize');
  }
  const distinct = new Set(content).size;
  const ratio = 1 - distinct / content.length;
  const allowance = 0.25;
  const excess = Math.max(0, ratio - allowance);
  const raw = clamp01(1 - excess * 3);
  return factor(
    'repetition',
    raw,
    `${distinct}/${content.length} distinct content words`,
  );
}

/**
 * Score one ad. Pass pre-computed hook detections to avoid re-running the
 * hook detector; otherwise they are computed internally.
 */
export function scoreAd(ad: Ad, hooks?: HookDetection[]): CreativeScore {
  const detections = hooks ?? detectHooks(ad);
  const text = fullText(ad);
  const words = wordsOf(text);

  const factors: ScoreFactor[] = [
    hookFactor(detections),
    specificityFactor(text, words.length),
    ctaFactor(ad, text),
    lengthFactor(words.length),
    readabilityFactor(text, words),
    repetitionFactor(words),
  ];

  const total = Math.min(
    100,
    Math.max(0, Math.round(factors.reduce((sum, f) => sum + f.weight * f.raw, 0))),
  );

  return { total, factors };
}
