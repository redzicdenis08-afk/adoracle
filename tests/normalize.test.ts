import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDomain,
  humanizeCta,
  normalizeGenericAd,
  normalizeMetaAd,
  normalizeRecords,
} from '../src/index.js';

const NOW = new Date('2026-02-01T00:00:00Z');

const metaRecord = {
  id: '310000000000001',
  page_name: 'GlowBrew Coffee',
  ad_creative_link_titles: ['Still drinking bitter coffee?'],
  ad_creative_bodies: ['Tired of stale supermarket beans? We roast small-batch.'],
  ad_creative_link_captions: ['www.glowbrew.example'],
  ad_creative_link_descriptions: ['Freshly roasted. Delivered fast.'],
  cta_type: 'SHOP_NOW',
  media_type: 'IMAGE',
  ad_delivery_start_time: '2026-01-02',
  publisher_platforms: ['facebook', 'instagram'],
  languages: ['en'],
};

test('normalizeMetaAd maps core Meta Ad Library fields', () => {
  const ad = normalizeMetaAd(metaRecord, { now: NOW });
  assert.equal(ad.id, '310000000000001');
  assert.equal(ad.advertiser, 'GlowBrew Coffee');
  assert.equal(ad.platform, 'meta');
  assert.equal(ad.headline, 'Still drinking bitter coffee?');
  assert.equal(ad.body, 'Tired of stale supermarket beans? We roast small-batch.');
  assert.equal(ad.linkDescription, 'Freshly roasted. Delivered fast.');
  assert.equal(ad.mediaType, 'image');
  assert.deepEqual(ad.languages, ['en']);
});

test('normalizeMetaAd computes daysActive against `now` for running ads', () => {
  const ad = normalizeMetaAd(metaRecord, { now: NOW });
  assert.equal(ad.active, true);
  assert.equal(ad.lastSeen, undefined);
  assert.equal(ad.daysActive, 30);
});

test('normalizeMetaAd uses the stop time for finished ads', () => {
  const ad = normalizeMetaAd(
    { ...metaRecord, ad_delivery_stop_time: '2026-01-22' },
    { now: NOW },
  );
  assert.equal(ad.active, false);
  assert.equal(ad.daysActive, 20);
});

test('normalizeMetaAd humanizes the CTA', () => {
  const ad = normalizeMetaAd(metaRecord, { now: NOW });
  assert.equal(ad.cta, 'Shop now');
  assert.equal(humanizeCta('SIGN_UP'), 'Sign up');
  assert.equal(humanizeCta(undefined), undefined);
});

test('normalizeMetaAd extracts the landing domain from the display caption', () => {
  const ad = normalizeMetaAd(metaRecord, { now: NOW });
  assert.equal(ad.landingDomain, 'glowbrew.example');
});

test('link_url wins over the caption for the landing domain', () => {
  const ad = normalizeMetaAd(
    { ...metaRecord, link_url: 'https://www.shop.glowbrew.example/beans?utm=x' },
    { now: NOW },
  );
  assert.equal(ad.landingDomain, 'shop.glowbrew.example');
});

test('records without an id get a deterministic derived id', () => {
  const { id, ...anonymous } = metaRecord;
  const a = normalizeMetaAd(anonymous, { now: NOW });
  const b = normalizeMetaAd(anonymous, { now: NOW });
  assert.match(a.id, /^ad-[0-9a-f]{8}$/);
  assert.equal(a.id, b.id);
});

test('normalizeGenericAd maps a flat record and platform aliases', () => {
  const ad = normalizeGenericAd(
    {
      id: 'pf-0001',
      advertiser: 'PeakForm Fitness',
      platform: 'instagram',
      headline: 'The 20-minute workout',
      body: 'Short sessions. Real results.',
      cta: 'Start free trial',
      landing_url: 'https://www.peakform.example/trial',
      media_type: 'video',
      first_seen: '2025-08-14',
      last_seen: '2026-01-14',
    },
    { now: NOW },
  );
  assert.equal(ad.platform, 'meta'); // instagram is a Meta surface
  assert.equal(ad.advertiser, 'PeakForm Fitness');
  assert.equal(ad.mediaType, 'video');
  assert.equal(ad.landingDomain, 'peakform.example');
  assert.equal(ad.daysActive, 153);
  assert.equal(ad.active, false);
});

test('unknown platforms map to "other" and missing advertiser to "unknown"', () => {
  const ad = normalizeGenericAd({ id: 'x1', platform: 'billboards' }, { now: NOW });
  assert.equal(ad.platform, 'other');
  assert.equal(ad.advertiser, 'unknown');
  assert.equal(ad.mediaType, 'unknown');
});

test('normalizeRecords unwraps envelopes, arrays, and single records', () => {
  const fromEnvelope = normalizeRecords({ data: [metaRecord] }, { now: NOW });
  const fromArray = normalizeRecords([metaRecord, metaRecord], { now: NOW });
  const fromSingle = normalizeRecords(metaRecord, { now: NOW });
  assert.equal(fromEnvelope.length, 1);
  assert.equal(fromArray.length, 2);
  assert.equal(fromSingle.length, 1);
  assert.equal(fromEnvelope[0].advertiser, 'GlowBrew Coffee');
});

test('normalizeRecords auto-detects Meta vs generic shapes', () => {
  const ads = normalizeRecords(
    [metaRecord, { id: 'g1', advertiser: 'PeakForm Fitness', platform: 'tiktok' }],
    { now: NOW },
  );
  assert.equal(ads[0].platform, 'meta');
  assert.equal(ads[1].platform, 'tiktok');
});

test('extractDomain handles bare hosts, www, and garbage', () => {
  assert.equal(extractDomain('https://www.glowbrew.example/a/b?c=1'), 'glowbrew.example');
  assert.equal(extractDomain('glowbrew.example'), 'glowbrew.example');
  assert.equal(extractDomain('not a url'), undefined);
  assert.equal(extractDomain('localhost'), undefined);
  assert.equal(extractDomain(undefined), undefined);
});
