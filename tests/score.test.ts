import test from 'node:test';
import assert from 'node:assert/strict';
import { SCORE_WEIGHTS, scoreAd, type Ad } from '../src/index.js';

function ad(overrides: Partial<Ad>): Ad {
  return {
    id: 'test-ad',
    advertiser: 'GlowBrew Coffee',
    platform: 'meta',
    active: true,
    mediaType: 'image',
    languages: ['en'],
    ...overrides,
  };
}

const strongAd = ad({
  headline: 'Still drinking bitter coffee?',
  body:
    'Tired of stale supermarket beans? GlowBrew roasts small-batch coffee and ships ' +
    'within 48 hours of roasting. Join 12,000+ happy brewers and get 20% off your first bag.',
  cta: 'Shop now',
});

const weakAd = ad({
  body: 'We are a beverage company and we make products for people who like beverages and we think our products are products people might like because our products are beverage products for people.',
});

test('factor weights sum to exactly 100', () => {
  const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);
});

test('score is always within 0..100 with all six factors present', () => {
  for (const candidate of [strongAd, weakAd, ad({})]) {
    const score = scoreAd(candidate);
    assert.ok(score.total >= 0 && score.total <= 100);
    assert.deepEqual(
      score.factors.map((f) => f.name),
      ['hook', 'specificity', 'cta', 'length', 'readability', 'repetition'],
    );
  }
});

test('the total matches the factor breakdown', () => {
  const score = scoreAd(strongAd);
  const reconstructed = score.factors.reduce((sum, f) => sum + f.weight * f.raw, 0);
  assert.ok(Math.abs(score.total - reconstructed) <= 0.5);
  for (const f of score.factors) {
    assert.ok(f.raw >= 0 && f.raw <= 1, `${f.name} raw out of range`);
    assert.ok(Math.abs(f.weighted - f.weight * f.raw) < 0.06, `${f.name} weighted mismatch`);
  }
});

test('a hooked, specific, CTA-clear ad outscores rambling copy', () => {
  const strong = scoreAd(strongAd);
  const weak = scoreAd(weakAd);
  assert.ok(strong.total > weak.total + 20, `${strong.total} vs ${weak.total}`);
});

test('a missing CTA zeroes the cta factor', () => {
  const score = scoreAd(ad({ body: 'Beans roasted weekly in small batches.' }));
  const cta = score.factors.find((f) => f.name === 'cta');
  assert.equal(cta?.raw, 0);
});

test('an inline CTA in the copy earns partial credit', () => {
  const score = scoreAd(ad({ body: 'Fresh beans, roasted weekly. Shop now at our site.' }));
  const cta = score.factors.find((f) => f.name === 'cta');
  assert.equal(cta?.raw, 0.5);
});

test('generic CTAs score below strong action CTAs', () => {
  const strong = scoreAd(ad({ cta: 'Shop now' })).factors.find((f) => f.name === 'cta');
  const generic = scoreAd(ad({ cta: 'Learn more' })).factors.find((f) => f.name === 'cta');
  assert.equal(strong?.raw, 1);
  assert.equal(generic?.raw, 0.55);
});

test('repeated content words are penalized', () => {
  const repetitive = scoreAd(
    ad({ body: 'coffee coffee coffee coffee coffee coffee coffee coffee coffee coffee' }),
  ).factors.find((f) => f.name === 'repetition');
  const varied = scoreAd(
    ad({ body: 'Bright acidity, chocolate finish, floral aroma, gentle roast, honest sourcing.' }),
  ).factors.find((f) => f.name === 'repetition');
  assert.ok(repetitive && varied);
  assert.ok(repetitive.raw < 0.2);
  assert.equal(varied.raw, 1);
});

test('concrete numbers raise the specificity factor', () => {
  const vague = scoreAd(
    ad({ body: 'Our coffee ships quickly after roasting and many people enjoy it a lot.' }),
  ).factors.find((f) => f.name === 'specificity');
  const specific = scoreAd(
    ad({ body: 'Roasted 48 hours before shipping. 12,000 brewers. Rated 4.8 by 900 reviews.' }),
  ).factors.find((f) => f.name === 'specificity');
  assert.ok(vague && specific);
  assert.equal(vague.raw, 0);
  assert.ok(specific.raw > 0.5);
});

test('scoring is deterministic', () => {
  assert.deepEqual(scoreAd(strongAd), scoreAd(strongAd));
});

test('an empty ad scores near zero', () => {
  const score = scoreAd(ad({}));
  assert.ok(score.total <= 10, String(score.total));
});
