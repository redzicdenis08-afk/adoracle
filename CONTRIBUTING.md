# Contributing to adoracle

Thanks for considering a contribution. This project aims to stay small, deterministic, and dependency-free at runtime.

## Development setup

```bash
git clone https://github.com/redzicdenis08-afk/adoracle
cd adoracle
npm install        # devDependencies only: typescript + @types/node
npm run build
npm test
```

Tests run on the compiled output with the built-in `node:test` runner — no test framework to install.

## Guidelines

- **Zero runtime dependencies.** The engine must keep working with nothing but Node >= 18. New capabilities that need external services belong behind an optional integration, not in the core.
- **Every detection needs evidence.** If you add a hook or angle rule, the detection must carry a `Span` that satisfies `field.slice(start, end) === text`. Claims without receipts don't ship.
- **Determinism is a feature.** Same input, same output. No randomness, no clock reads without an injectable `now`, stable sort orders with explicit tie-breaks.
- **Add a test for any new rule, normalizer, or score factor.** Synthetic, fictional brands only in fixtures (`GlowBrew Coffee`, not a real advertiser).
- One focused change per PR, with the before/after behavior in the description.

## Adding a new input format

1. Add a `normalize<Source>Ad` function in `src/normalize.ts` that returns the canonical `Ad`.
2. Wire it into `normalizeAd` / `normalizeRecords` detection.
3. Drop a synthetic sample under `examples/` and add tests in `tests/normalize.test.ts`.

## Tuning detection

Hook rules live in `src/hooks.ts` (`HOOK_RULES`) and angle rules in `src/angles.ts` (`ANGLE_RULES`). Both detectors accept a custom rule pack as a second argument, so vertical- or language-specific tuning can happen without touching the defaults. If you believe a pattern belongs in the defaults, open an issue with a few example creatives (fictional or paraphrased) that motivate it.
