# Adoracle

> AI ad intelligence. See what is working in your market before you spend.

[![CI](https://github.com/redzicdenis08-afk/adoracle/actions/workflows/ci.yml/badge.svg)](https://github.com/redzicdenis08-afk/adoracle/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Zero runtime deps](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Adoracle pulls competitor ads from public ad libraries and breaks them down: the hooks, the angles, and the structures that make them convert. The production SaaS (ingestion pipelines, LLM analysis workers, Next.js dashboard, billing) is private — **this repository is the open reference implementation of the analysis engine at its core**: fresh, readable TypeScript with zero runtime dependencies, so you can see exactly how ad-library records become creative intelligence.

```
$ npx adoracle analyze my_competitor_ads.json
```

## Why this exists

If you buy paid social traffic, your competitors' ad libraries are the closest thing to a public leaderboard of what converts. Meta alone shows you every active ad, when it started running, and its creative text. The problem is volume and noise: hundreds of creatives per advertiser, no structure, no way to answer *"what hook do they lead with, what argument do they make, and which creatives have actually survived?"*

`adoracle` turns that pile of JSON into three things:

1. **One canonical ad model** — whatever the source shape, you analyze the same fields.
2. **Auditable detections** — every hook and angle comes with the exact matched text span. No black-box labels.
3. **A deterministic 0-100 creative score** — the same ad always scores the same, and the full factor breakdown ships with the number.

The production system layers LLM analysis on top of this. The engine here is the deterministic backbone: the part that must be fast, free, reproducible, and boring — because you run it on every ad, every day.

## Architecture

```
                    ad-library JSON (Meta-shaped or generic)
                                     |
                                     v
                       +-------------------------+
                       |      normalize.ts       |
                       |  one canonical Ad model |
                       |  id / advertiser / dates|
                       |  creative text / CTA /  |
                       |  media / landing domain |
                       +-------------------------+
                             |             |
                 opening only|             |full creative text
                             v             v
                  +---------------+   +---------------+
                  |   hooks.ts    |   |   angles.ts   |
                  | question stat |   | price quality |
                  | pain  proof   |   | speed  trust  |
                  | urgency  gap  |   | fomo  transform|
                  | direct offer  |   |               |
                  +---------------+   +---------------+
                             \             /
              every detection \           / carries evidence spans
                               v         v
                       +-------------------------+
                       |        score.ts         |
                       |  6 weighted signals ->  |
                       |  deterministic 0-100    |
                       +-------------------------+
                                     |
                                     v
                       +-------------------------+
                       |        report.ts        |
                       | longevity leaderboard,  |
                       | hook/angle mix, averages|
                       +-------------------------+
                                     |
                                     v
                          cli.ts  /  library API
```

## Quickstart

Requires Node >= 18. No runtime dependencies.

```bash
git clone https://github.com/redzicdenis08-afk/adoracle
cd adoracle
npm install     # typescript + @types/node, dev-only
npm run build
npm test        # 62 tests on the built-in node:test runner
npm link        # optional: puts `adoracle` on your PATH
```

## CLI

### `adoracle analyze <file>`

Point it at a JSON file containing a single record, an array, or a Meta-style `{ "data": [...] }` envelope:

```bash
adoracle analyze examples/glowbrew_meta.json
```

```
GlowBrew Coffee — 310000000000001 (meta, image, active, 142d)
  Headline: Still drinking bitter coffee?
  Landing:  glowbrew.example
  Score: 100/100
    hook         1.00 x 30 =  30.0  question hook ("Still drinking bitter coffee?") plus 2 more
    specificity  1.00 x 20 =  20.0  3 concrete figure(s) in 38 words
    cta          1.00 x 15 =  15.0  strong action CTA ("Shop now")
    length       1.00 x 15 =  15.0  38 words
    readability  1.00 x 10 =  10.0  ~5 words/sentence, 5.37 chars/word
    repetition   1.00 x 10 =  10.0  26/27 distinct content words
  Hooks:
    question      0.90  "Still drinking bitter coffee?" [headline]
    pain_point    0.85  "Tired of" [body]
    stat          0.60  "48" [body]
  Angles:
    speed         0.70  "within 48 hours", "fast"
    price         0.60  "20% off"
    quality       0.60  "small-batch"

3 ad(s) | avg score 87.3
```

### `adoracle report <dir>`

Aggregates every `*.json` file in a directory into a per-advertiser report. Longevity is the closest public proxy for "this creative converts" — nobody keeps paying for a loser for 241 days:

```bash
adoracle report examples
```

```
Ad library report
  Ads: 7 | Advertisers: 3 | Avg score: 89.3

GlowBrew Coffee (3 ads, 2 active, avg 87.3)
  Longest running:
    1. 310000000000002   241d  active    score 74  "The secret to cafe-quality espresso at home"
    2. 310000000000001   142d  active    score 100  "Still drinking bitter coffee?"
    3. 310000000000003    23d  inactive  score 88  "Last chance: holiday roast ends Sunday"
  Hook mix:  stat 2, curiosity_gap 1, pain_point 1, question 1, urgency 1
  Angle mix: price 2, quality 2, speed 2, fomo 1, trust 1

PeakForm Fitness (2 ads, 1 active, avg 94)
  Longest running:
    1. pf-0001   289d  active    score 97  "The secret to a 20-minute full-body workout"
    2. pf-0002    41d  inactive  score 91  "Why do most home workout plans fail?"
  Hook mix:  stat 2, curiosity_gap 1, question 1
  Angle mix: price 1, speed 1, transformation 1
...
```

Both commands take `--json` for machine-readable output.

## Library

```ts
import { normalizeRecords, analyzeAd, buildReport } from 'adoracle';

const ads = normalizeRecords(JSON.parse(rawAdLibraryJson));

const analysis = analyzeAd(ads[0]);
analysis.hooks[0];        // { type: 'question', confidence: 0.9, evidence: { field: 'headline', start: 0, end: 29, text: '...' } }
analysis.angles[0].type;  // 'speed'
analysis.score.total;     // 100
analysis.score.factors;   // full weighted breakdown, always sums to the total

const report = buildReport(ads);
report.advertisers[0].longestRunning;    // what's been converting for months
report.advertisers[0].hookDistribution;  // { question: 1, stat: 2, ... }
```

## What it detects

**Opening hooks** — how the ad stops the scroll. Only the headline and the first two sentences of the body count; a pain-point phrase buried in paragraph three is copy, not a hook.

| Hook | Trigger example |
|---|---|
| `question` | "Still drinking bitter coffee?" |
| `stat` | "87% of home brewers never…" |
| `pain_point` | "Tired of stale supermarket beans?" |
| `social_proof` | "Join 12,000+ happy brewers" |
| `urgency` | "Last chance: sale ends tonight" |
| `curiosity_gap` | "The secret to cafe-quality espresso" |
| `direct_offer` | "Get 20% off your first bag" |

**Persuasion angles** — what argument the ad makes, anywhere in the creative. Multi-label, because good ads stack them: `price`, `quality`, `speed`, `trust`, `fomo`, `transformation`.

## How scoring works

Six normalized signals, weights summing to exactly 100, no randomness:

| Factor | Weight | What it measures |
|---|---|---|
| `hook` | 30 | Best opening-hook confidence, small bonus per extra hook type |
| `specificity` | 20 | Concrete figures (numbers, prices, percentages) per 100 words |
| `cta` | 15 | Strong action CTA > generic "Learn more" > buried in copy > none |
| `length` | 15 | Word-count band; 15–150 words is the sweet spot |
| `readability` | 10 | Words per sentence and characters per word |
| `repetition` | 10 | Penalty when distinct content words drop below an allowance |

The whole heuristic lives in [`src/score.ts`](src/score.ts) and is deliberately readable. It is not trying to out-judge a human reviewer — it is a *transparent, reproducible baseline* that ranks thousands of creatives for the expensive analysis (human or LLM) to start from.

## The evidence-span philosophy

Every detection in adoracle carries a span:

```json
{
  "type": "urgency",
  "confidence": 0.85,
  "evidence": { "field": "headline", "start": 0, "end": 11, "text": "Last chance" }
}
```

with the hard invariant `ad[field].slice(start, end) === text` (enforced by tests). This is the design decision everything else hangs on:

- **Auditable** — a label you can't trace to words is an opinion, not data.
- **Debuggable** — false positive? The span shows you exactly which rule fired and where.
- **Composable** — downstream UIs can highlight the matched text; LLM layers can be prompted with the evidence instead of re-reading the whole ad.
- **Honest** — confidences are capped below 1.0 because a regex match is a strong hint, never proof.

## Design principles

1. **Zero runtime dependencies.** `npm install` pulls two dev-only packages. The engine itself runs on bare Node >= 18.
2. **Deterministic by construction.** Same input, same output: injectable clock for `daysActive`, stable sorts with explicit tie-breaks, integer-safe rounding. Diffs of analysis output are meaningful.
3. **Rules are data.** `HOOK_RULES` and `ANGLE_RULES` are exported arrays; both detectors accept a custom pack, so vertical- or language-specific tuning never forks the core.
4. **Normalize once, analyze everywhere.** Only `normalize.ts` knows about source formats. Everything downstream sees one canonical `Ad`.
5. **Synthetic fixtures only.** Example data uses fictional brands (`GlowBrew Coffee`, `PeakForm Fitness`, `Sundial Skincare`) on reserved `.example` domains — no scraped data, no real advertisers.

## Relationship to the production system

The private Adoracle SaaS adds: multi-source scraping and ingestion pipelines, media/OCR/transcription enrichment, LLM-based deep creative analysis, a Postgres-backed insights store, and a Next.js dashboard. This repository is the reference implementation of the deterministic analysis layer those systems are built around — kept open because the ideas (canonical ad model, evidence spans, transparent scoring) are more useful shared than hidden.

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Run the suite with `npm run build && npm test`.

## Demo script

A short demo plan for launch screenshots and GIFs lives in [docs/DEMO.md](docs/DEMO.md).

## Star this repo if

- You build in this niche and want a small reference engine instead of a black-box demo.
- You want synthetic examples that run locally.
- You care about readable implementation details, not just screenshots.

Launch notes and topic suggestions live in [docs/LAUNCH_PACK.md](docs/LAUNCH_PACK.md).

## Repository health

This repo now includes GitHub issue templates, a PR checklist, Dependabot checks for GitHub Actions, and a public boundary checklist in [docs/REPO_HEALTH.md](docs/REPO_HEALTH.md).

## License

[MIT](LICENSE) © Denis Redzic

---

Part of the work of [Denis Redzic](https://denis.denisai.online).
