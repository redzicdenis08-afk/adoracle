/**
 * Analysis orchestration and library-level reporting.
 *
 * `analyzeAd` runs the full pipeline on one ad. `buildReport` aggregates a
 * set of ads (usually one advertiser's public library) into the numbers a
 * media buyer actually wants: which creatives have survived the longest
 * (longevity is the closest public proxy for "this ad converts"), what hook
 * and angle mix the advertiser leans on, and where the scores sit.
 */

import { detectAngles } from './angles.js';
import { detectHooks } from './hooks.js';
import { scoreAd } from './score.js';
import {
  ALL_ANGLE_TYPES,
  ALL_HOOK_TYPES,
  type Ad,
  type AdAnalysis,
  type AngleType,
  type HookType,
} from './models.js';

/** Run the full pipeline (hooks, angles, score) on one canonical ad. */
export function analyzeAd(ad: Ad): AdAnalysis {
  const hooks = detectHooks(ad);
  const angles = detectAngles(ad);
  const score = scoreAd(ad, hooks);
  return { ad, hooks, angles, score };
}

/** Compact, sortable view of one analyzed creative. */
export interface CreativeSummary {
  id: string;
  advertiser: string;
  headline?: string;
  daysActive?: number;
  active: boolean;
  score: number;
  topHook?: HookType;
  topAngle?: AngleType;
}

export interface AdvertiserReport {
  advertiser: string;
  adCount: number;
  activeCount: number;
  averageScore: number;
  /** Sorted by daysActive descending; ads without dates sort last. */
  longestRunning: CreativeSummary[];
  /** Sorted by score descending. */
  topScoring: CreativeSummary[];
  /** Ads containing each hook type (each ad counted once per type). */
  hookDistribution: Record<HookType, number>;
  angleDistribution: Record<AngleType, number>;
}

export interface LibraryReport {
  adCount: number;
  advertiserCount: number;
  averageScore: number;
  hookDistribution: Record<HookType, number>;
  angleDistribution: Record<AngleType, number>;
  advertisers: AdvertiserReport[];
}

export interface ReportOptions {
  /** How many creatives to keep in each top list. Default 5. */
  top?: number;
}

function emptyHookDistribution(): Record<HookType, number> {
  return Object.fromEntries(ALL_HOOK_TYPES.map((t) => [t, 0])) as Record<HookType, number>;
}

function emptyAngleDistribution(): Record<AngleType, number> {
  return Object.fromEntries(ALL_ANGLE_TYPES.map((t) => [t, 0])) as Record<AngleType, number>;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function summarize(analysis: AdAnalysis): CreativeSummary {
  return {
    id: analysis.ad.id,
    advertiser: analysis.ad.advertiser,
    headline: analysis.ad.headline,
    daysActive: analysis.ad.daysActive,
    active: analysis.ad.active,
    score: analysis.score.total,
    topHook: analysis.hooks[0]?.type,
    topAngle: analysis.angles[0]?.type,
  };
}

function byLongevity(a: CreativeSummary, b: CreativeSummary): number {
  return (
    (b.daysActive ?? -1) - (a.daysActive ?? -1) ||
    b.score - a.score ||
    a.id.localeCompare(b.id)
  );
}

function byScore(a: CreativeSummary, b: CreativeSummary): number {
  return (
    b.score - a.score ||
    (b.daysActive ?? -1) - (a.daysActive ?? -1) ||
    a.id.localeCompare(b.id)
  );
}

function buildAdvertiserReport(
  advertiser: string,
  analyses: AdAnalysis[],
  top: number,
): AdvertiserReport {
  const hookDistribution = emptyHookDistribution();
  const angleDistribution = emptyAngleDistribution();
  const summaries = analyses.map(summarize);

  for (const analysis of analyses) {
    for (const type of new Set(analysis.hooks.map((h) => h.type))) {
      hookDistribution[type] += 1;
    }
    for (const type of new Set(analysis.angles.map((a) => a.type))) {
      angleDistribution[type] += 1;
    }
  }

  const total = summaries.reduce((sum, s) => sum + s.score, 0);
  return {
    advertiser,
    adCount: analyses.length,
    activeCount: summaries.filter((s) => s.active).length,
    averageScore: round1(total / Math.max(1, summaries.length)),
    longestRunning: [...summaries].sort(byLongevity).slice(0, top),
    topScoring: [...summaries].sort(byScore).slice(0, top),
    hookDistribution,
    angleDistribution,
  };
}

/**
 * Aggregate a set of canonical ads into a library report, grouped by
 * advertiser. Deterministic: advertisers sort by ad count desc, then name.
 */
export function buildReport(ads: Ad[], options: ReportOptions = {}): LibraryReport {
  const top = options.top ?? 5;
  const analyses = ads.map(analyzeAd);

  const groups = new Map<string, AdAnalysis[]>();
  for (const analysis of analyses) {
    const key = analysis.ad.advertiser;
    const group = groups.get(key);
    if (group) group.push(analysis);
    else groups.set(key, [analysis]);
  }

  const advertisers = [...groups.entries()]
    .map(([name, group]) => buildAdvertiserReport(name, group, top))
    .sort((a, b) => b.adCount - a.adCount || a.advertiser.localeCompare(b.advertiser));

  const hookDistribution = emptyHookDistribution();
  const angleDistribution = emptyAngleDistribution();
  for (const report of advertisers) {
    for (const type of ALL_HOOK_TYPES) hookDistribution[type] += report.hookDistribution[type];
    for (const type of ALL_ANGLE_TYPES) {
      angleDistribution[type] += report.angleDistribution[type];
    }
  }

  const totalScore = analyses.reduce((sum, a) => sum + a.score.total, 0);
  return {
    adCount: ads.length,
    advertiserCount: advertisers.length,
    averageScore: round1(totalScore / Math.max(1, analyses.length)),
    hookDistribution,
    angleDistribution,
    advertisers,
  };
}

// ---------------------------------------------------------------------------
// Text rendering (used by the CLI, exported for anyone who wants plain text)
// ---------------------------------------------------------------------------

function formatDistribution(distribution: Record<string, number>): string {
  const entries = Object.entries(distribution)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, count]) => `${type} ${count}`);
  return entries.length > 0 ? entries.join(', ') : 'none detected';
}

/** Render one analysis as human-readable text. */
export function renderAnalysis(analysis: AdAnalysis): string {
  const { ad, hooks, angles, score } = analysis;
  const lines: string[] = [];
  const days = ad.daysActive !== undefined ? `${ad.daysActive}d` : '?d';
  const status = ad.active ? 'active' : 'inactive';
  lines.push(`${ad.advertiser} — ${ad.id} (${ad.platform}, ${ad.mediaType}, ${status}, ${days})`);
  if (ad.headline) lines.push(`  Headline: ${ad.headline}`);
  if (ad.landingDomain) lines.push(`  Landing:  ${ad.landingDomain}`);
  lines.push(`  Score: ${score.total}/100`);
  for (const f of score.factors) {
    const name = f.name.padEnd(12);
    const raw = f.raw.toFixed(2);
    const weighted = f.weighted.toFixed(1).padStart(5);
    lines.push(`    ${name} ${raw} x ${String(f.weight).padStart(2)} = ${weighted}  ${f.detail}`);
  }
  if (hooks.length > 0) {
    lines.push('  Hooks:');
    for (const h of hooks) {
      lines.push(`    ${h.type.padEnd(13)} ${h.confidence.toFixed(2)}  "${h.evidence.text}" [${h.evidence.field}]`);
    }
  } else {
    lines.push('  Hooks: none detected');
  }
  if (angles.length > 0) {
    lines.push('  Angles:');
    for (const a of angles) {
      const evidence = a.evidence.map((s) => `"${s.text}"`).join(', ');
      lines.push(`    ${a.type.padEnd(13)} ${a.confidence.toFixed(2)}  ${evidence}`);
    }
  } else {
    lines.push('  Angles: none detected');
  }
  return lines.join('\n');
}

/** Render a library report as human-readable text. */
export function renderReport(report: LibraryReport): string {
  const lines: string[] = [];
  lines.push('Ad library report');
  lines.push(
    `  Ads: ${report.adCount} | Advertisers: ${report.advertiserCount} | Avg score: ${report.averageScore}`,
  );
  for (const adv of report.advertisers) {
    lines.push('');
    lines.push(
      `${adv.advertiser} (${adv.adCount} ad${adv.adCount === 1 ? '' : 's'}, ${adv.activeCount} active, avg ${adv.averageScore})`,
    );
    lines.push('  Longest running:');
    adv.longestRunning.forEach((s, i) => {
      const days = s.daysActive !== undefined ? `${s.daysActive}d` : '?d';
      const status = s.active ? 'active  ' : 'inactive';
      const headline = s.headline ? `  "${s.headline}"` : '';
      lines.push(`    ${i + 1}. ${s.id}  ${days.padStart(5)}  ${status}  score ${s.score}${headline}`);
    });
    lines.push(`  Hook mix:  ${formatDistribution(adv.hookDistribution)}`);
    lines.push(`  Angle mix: ${formatDistribution(adv.angleDistribution)}`);
  }
  return lines.join('\n');
}
