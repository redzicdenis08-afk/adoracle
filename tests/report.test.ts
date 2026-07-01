import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAd,
  buildReport,
  renderAnalysis,
  renderReport,
  type Ad,
} from '../src/index.js';

function ad(overrides: Partial<Ad>): Ad {
  return {
    id: `ad-${Math.abs(JSON.stringify(overrides).length)}`,
    advertiser: 'GlowBrew Coffee',
    platform: 'meta',
    active: true,
    mediaType: 'image',
    languages: ['en'],
    ...overrides,
  };
}

const library: Ad[] = [
  ad({
    id: 'gb-1',
    headline: 'Still drinking bitter coffee?',
    body: 'Get 20% off your first bag. Join 12,000+ brewers.',
    cta: 'Shop now',
    daysActive: 120,
  }),
  ad({ id: 'gb-2', body: 'Premium small-batch beans, roasted weekly.', daysActive: 45 }),
  ad({ id: 'gb-3', body: 'Limited edition holiday roast. Almost gone.', daysActive: 12, active: false }),
  ad({
    id: 'pf-1',
    advertiser: 'PeakForm Fitness',
    platform: 'tiktok',
    headline: 'The secret to a 20-minute workout',
    body: 'Say goodbye to two-hour gym sessions.',
    daysActive: 200,
  }),
];

test('analyzeAd bundles hooks, angles, and score for one ad', () => {
  const analysis = analyzeAd(library[0]);
  assert.equal(analysis.ad.id, 'gb-1');
  assert.ok(analysis.hooks.length > 0);
  assert.ok(analysis.angles.length > 0);
  assert.ok(analysis.score.total > 0);
});

test('buildReport groups ads by advertiser', () => {
  const report = buildReport(library);
  assert.equal(report.adCount, 4);
  assert.equal(report.advertiserCount, 2);
  assert.equal(report.advertisers[0].advertiser, 'GlowBrew Coffee');
  assert.equal(report.advertisers[0].adCount, 3);
  assert.equal(report.advertisers[0].activeCount, 2);
  assert.equal(report.advertisers[1].advertiser, 'PeakForm Fitness');
});

test('longest-running creatives are sorted by daysActive descending', () => {
  const report = buildReport(library);
  const glowbrew = report.advertisers[0];
  assert.deepEqual(
    glowbrew.longestRunning.map((s) => s.id),
    ['gb-1', 'gb-2', 'gb-3'],
  );
  assert.equal(glowbrew.longestRunning[0].daysActive, 120);
});

test('the top option limits list sizes', () => {
  const report = buildReport(library, { top: 1 });
  assert.equal(report.advertisers[0].longestRunning.length, 1);
  assert.equal(report.advertisers[0].topScoring.length, 1);
});

test('hook and angle distributions count each ad once per type', () => {
  const report = buildReport(library);
  const glowbrew = report.advertisers[0];
  assert.equal(glowbrew.hookDistribution.question, 1);
  assert.equal(glowbrew.hookDistribution.direct_offer, 1);
  assert.equal(glowbrew.angleDistribution.fomo, 1);
  assert.equal(glowbrew.angleDistribution.quality, 1);
  // Library-level distribution is the sum of advertiser distributions.
  assert.equal(
    report.hookDistribution.curiosity_gap,
    report.advertisers.reduce((n, a) => n + a.hookDistribution.curiosity_gap, 0),
  );
});

test('averageScore is the rounded mean of ad scores', () => {
  const report = buildReport(library);
  const mean =
    library.map((a) => analyzeAd(a).score.total).reduce((x, y) => x + y, 0) / library.length;
  assert.equal(report.averageScore, Math.round(mean * 10) / 10);
});

test('buildReport on an empty list is well-formed', () => {
  const report = buildReport([]);
  assert.equal(report.adCount, 0);
  assert.equal(report.advertiserCount, 0);
  assert.equal(report.averageScore, 0);
  assert.deepEqual(report.advertisers, []);
});

test('renderAnalysis and renderReport produce readable text', () => {
  const text = renderAnalysis(analyzeAd(library[0]));
  assert.match(text, /GlowBrew Coffee — gb-1/);
  assert.match(text, /Score: \d+\/100/);
  assert.match(text, /Hooks:/);

  const reportText = renderReport(buildReport(library));
  assert.match(reportText, /Ad library report/);
  assert.match(reportText, /Longest running:/);
  assert.match(reportText, /PeakForm Fitness/);
});
