import test from 'node:test';
import assert from 'node:assert/strict';
import { detectHooks, openingOf, type Ad } from '../src/index.js';

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

function types(detections: ReturnType<typeof detectHooks>): string[] {
  return detections.map((d) => d.type);
}

test('detects a question hook in the headline', () => {
  const hooks = detectHooks(ad({ headline: 'Still drinking bitter coffee?' }));
  const question = hooks.find((h) => h.type === 'question');
  assert.ok(question);
  assert.equal(question.evidence.field, 'headline');
  assert.equal(question.evidence.text, 'Still drinking bitter coffee?');
  assert.equal(question.confidence, 0.9);
});

test('a mid-copy question still counts if it is in the opening', () => {
  const hooks = detectHooks(
    ad({ body: 'Mornings should be easy. So why is your coffee routine a chore?' }),
  );
  const question = hooks.find((h) => h.type === 'question');
  assert.ok(question);
  assert.equal(question.evidence.field, 'body');
  assert.ok(question.evidence.text.endsWith('?'));
});

test('detects a stat hook with the number as evidence', () => {
  const hooks = detectHooks(
    ad({ body: '87% of home brewers never taste beans roasted this week.' }),
  );
  const stat = hooks.find((h) => h.type === 'stat');
  assert.ok(stat);
  assert.equal(stat.evidence.text, '87%');
  assert.equal(stat.confidence, 0.85);
});

test('bare numbers are a weaker stat signal than percentages', () => {
  const bare = detectHooks(ad({ body: 'We roast 12 origins every week.' }));
  const stat = bare.find((h) => h.type === 'stat');
  assert.ok(stat);
  assert.equal(stat.confidence, 0.6);
});

test('detects a pain-point hook', () => {
  const hooks = detectHooks(ad({ body: 'Tired of stale supermarket coffee going flat?' }));
  assert.ok(types(hooks).includes('pain_point'));
  const pain = hooks.find((h) => h.type === 'pain_point');
  assert.equal(pain?.evidence.text.toLowerCase(), 'tired of');
});

test('detects a social-proof hook', () => {
  const hooks = detectHooks(ad({ body: 'Join 12,000+ happy brewers who switched.' }));
  const proof = hooks.find((h) => h.type === 'social_proof');
  assert.ok(proof);
  assert.equal(proof.evidence.text, 'Join 12,000+');
});

test('detects an urgency hook', () => {
  const hooks = detectHooks(ad({ headline: 'Last chance: the roastery sale ends tonight' }));
  const urgency = hooks.find((h) => h.type === 'urgency');
  assert.ok(urgency);
  assert.equal(urgency.evidence.text.toLowerCase(), 'last chance');
});

test('detects a curiosity-gap hook', () => {
  const hooks = detectHooks(ad({ headline: 'The secret to cafe-quality espresso at home' }));
  const curiosity = hooks.find((h) => h.type === 'curiosity_gap');
  assert.ok(curiosity);
  assert.equal(curiosity.evidence.text.toLowerCase(), 'the secret to');
});

test('detects a direct-offer hook', () => {
  const hooks = detectHooks(ad({ body: 'Get 20% off your first bag today.' }));
  const offer = hooks.find((h) => h.type === 'direct_offer');
  assert.ok(offer);
  assert.equal(offer.evidence.text, '20% off');
});

test('returns nothing for hook-free copy', () => {
  const hooks = detectHooks(
    ad({ body: 'We are a company that sells beverages to people who enjoy them.' }),
  );
  assert.deepEqual(hooks, []);
});

test('only the opening of the body is scanned', () => {
  const body =
    'Our beans come from three farms. Each lot is cupped twice before roasting. ' +
    'Tired of stale coffee? This late pain point should not count as a hook.';
  const hooks = detectHooks(ad({ body }));
  assert.ok(!types(hooks).includes('pain_point'));
  assert.ok(!types(hooks).includes('question'));
});

test('openingOf returns a prefix of the body', () => {
  const body = 'First sentence. Second sentence! Third sentence is ignored.';
  const opening = openingOf(body);
  assert.ok(body.startsWith(opening));
  assert.ok(opening.includes('Second sentence!'));
  assert.ok(!opening.includes('Third'));
});

test('evidence spans satisfy the slice invariant', () => {
  const creative = ad({
    headline: 'Why settle for bitter coffee?',
    body: 'Join 12,000+ brewers. Get 20% off your first order.',
  });
  for (const hook of detectHooks(creative)) {
    const source = hook.evidence.field === 'headline' ? creative.headline : creative.body;
    assert.ok(source);
    assert.equal(source.slice(hook.evidence.start, hook.evidence.end), hook.evidence.text);
  }
});

test('at most one detection per hook type, sorted by confidence', () => {
  const hooks = detectHooks(
    ad({
      headline: 'Still drinking bitter coffee?',
      body: 'Tired of stale beans? Get 20% off and join 5,000+ brewers.',
    }),
  );
  const seen = types(hooks);
  assert.equal(new Set(seen).size, seen.length);
  for (let i = 1; i < hooks.length; i++) {
    assert.ok(hooks[i - 1].confidence >= hooks[i].confidence);
  }
});
