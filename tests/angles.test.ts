import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAngles, type Ad } from '../src/index.js';

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

test('detects a price angle with multiple evidence spans', () => {
  const angles = detectAngles(
    ad({ body: 'Now 30% off with free shipping. Save up to $18 on your first box.' }),
  );
  const price = angles.find((a) => a.type === 'price');
  assert.ok(price);
  assert.ok(price.evidence.length >= 3);
  assert.ok(price.evidence.some((s) => s.text === '30% off'));
  assert.ok(price.evidence.some((s) => s.text.toLowerCase() === 'free shipping'));
});

test('detects a quality angle', () => {
  const angles = detectAngles(
    ad({ body: 'Small-batch, hand-crafted beans from a premium roastery.' }),
  );
  const quality = angles.find((a) => a.type === 'quality');
  assert.ok(quality);
  assert.equal(quality.evidence.length, 3);
});

test('detects a speed angle', () => {
  const angles = detectAngles(ad({ body: 'Brewed in just 3 minutes. Ships same-day.' }));
  const speed = angles.find((a) => a.type === 'speed');
  assert.ok(speed);
  assert.ok(speed.evidence.some((s) => s.text.toLowerCase() === 'in just 3 minutes'));
  assert.ok(speed.evidence.some((s) => s.text.toLowerCase() === 'same-day'));
});

test('detects a trust angle', () => {
  const angles = detectAngles(
    ad({ body: 'Money-back guarantee from an award-winning roaster, since 2019.' }),
  );
  const trust = angles.find((a) => a.type === 'trust');
  assert.ok(trust);
  assert.ok(trust.evidence.length >= 3);
});

test('detects a FOMO angle', () => {
  const angles = detectAngles(ad({ body: 'Limited edition holiday roast. Almost gone.' }));
  const fomo = angles.find((a) => a.type === 'fomo');
  assert.ok(fomo);
  assert.equal(fomo.evidence.length, 2);
});

test('detects a transformation angle', () => {
  const angles = detectAngles(
    ad({ body: 'Say goodbye to bitter mornings. One customer went from groggy to energized.' }),
  );
  const transformation = angles.find((a) => a.type === 'transformation');
  assert.ok(transformation);
  assert.ok(transformation.evidence.some((s) => s.text.toLowerCase() === 'say goodbye to'));
});

test('confidence grows with evidence count and is capped', () => {
  const one = detectAngles(ad({ body: 'A premium cup.' }));
  const many = detectAngles(
    ad({ body: 'Premium, hand-crafted, small-batch, top-rated, artisanal, luxurious, finest.' }),
  );
  const single = one.find((a) => a.type === 'quality');
  const multi = many.find((a) => a.type === 'quality');
  assert.ok(single && multi);
  assert.equal(single.confidence, 0.6);
  assert.ok(multi.confidence > single.confidence);
  assert.ok(multi.confidence <= 0.95);
  assert.ok(multi.evidence.length <= 6);
});

test('angles are detected across fields, including the CTA', () => {
  const angles = detectAngles(ad({ cta: 'Save $10 today' }));
  const price = angles.find((a) => a.type === 'price');
  assert.ok(price);
  assert.equal(price.evidence[0].field, 'cta');
});

test('evidence spans satisfy the slice invariant', () => {
  const creative = ad({
    headline: 'Premium beans, 30% off',
    body: 'Money-back guarantee. Ships same-day. Limited edition roast.',
    linkDescription: 'Great value, delivered fast.',
    cta: 'Shop now',
  });
  const source = {
    headline: creative.headline,
    body: creative.body,
    linkDescription: creative.linkDescription,
    cta: creative.cta,
  } as Record<string, string | undefined>;
  for (const angle of detectAngles(creative)) {
    for (const span of angle.evidence) {
      const text = source[span.field];
      assert.ok(text);
      assert.equal(text.slice(span.start, span.end), span.text);
    }
  }
});

test('returns nothing for angle-free copy', () => {
  const angles = detectAngles(ad({ body: 'Our team writes words about beans sometimes.' }));
  assert.deepEqual(angles, []);
});

test('results are sorted by confidence then evidence count', () => {
  const angles = detectAngles(
    ad({
      body: 'Premium, small-batch and hand-crafted. Money-back guarantee. 30% off.',
    }),
  );
  for (let i = 1; i < angles.length; i++) {
    assert.ok(angles[i - 1].confidence >= angles[i].confidence);
  }
});
