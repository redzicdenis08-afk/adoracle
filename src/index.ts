/**
 * adoracle — ad intelligence engine.
 *
 * Pipeline: normalize -> detect hooks -> detect angles -> score -> report.
 */

export {
  ALL_ANGLE_TYPES,
  ALL_HOOK_TYPES,
  type Ad,
  type AdAnalysis,
  type AngleDetection,
  type AngleType,
  type CreativeField,
  type CreativeScore,
  type HookDetection,
  type HookType,
  type MediaType,
  type Platform,
  type ScoreFactor,
  type Span,
} from './models.js';

export {
  extractDomain,
  humanizeCta,
  isMetaRecord,
  normalizeAd,
  normalizeGenericAd,
  normalizeMetaAd,
  normalizeRecords,
  type GenericAdRecord,
  type MetaAdLibraryRecord,
  type NormalizeOptions,
} from './normalize.js';

export { HOOK_RULES, detectHooks, openingOf, type HookRule } from './hooks.js';

export { ANGLE_RULES, detectAngles, type AngleRule } from './angles.js';

export { SCORE_WEIGHTS, scoreAd } from './score.js';

export {
  analyzeAd,
  buildReport,
  renderAnalysis,
  renderReport,
  type AdvertiserReport,
  type CreativeSummary,
  type LibraryReport,
  type ReportOptions,
} from './report.js';
