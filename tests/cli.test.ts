import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const EXAMPLES = fileURLToPath(new URL('../../examples', import.meta.url));
const GLOWBREW = fileURLToPath(new URL('../../examples/glowbrew_meta.json', import.meta.url));

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function run(...args: string[]): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

test('analyze --json emits one analysis per ad', () => {
  const result = run('analyze', GLOWBREW, '--json');
  assert.equal(result.status, 0);
  const analyses = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(analyses) && analyses.length >= 2);
  for (const analysis of analyses) {
    assert.ok(analysis.ad);
    assert.ok(Array.isArray(analysis.hooks));
    assert.ok(Array.isArray(analysis.angles));
    assert.ok(typeof (analysis.score as { total: number }).total === 'number');
  }
});

test('analyze renders human-readable text by default', () => {
  const result = run('analyze', GLOWBREW);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /GlowBrew Coffee/);
  assert.match(result.stdout, /Score: \d+\/100/);
  assert.match(result.stdout, /avg score/);
});

test('report --json aggregates every JSON file in a directory', () => {
  const result = run('report', EXAMPLES, '--json');
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout) as {
    adCount: number;
    advertiserCount: number;
    advertisers: Array<{ advertiser: string }>;
  };
  assert.ok(report.adCount >= 5);
  assert.ok(report.advertiserCount >= 3);
  assert.ok(report.advertisers.some((a) => a.advertiser === 'GlowBrew Coffee'));
});

test('missing files exit non-zero with a message on stderr', () => {
  const result = run('analyze', 'no-such-file.json');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no such file/i);
});

test('unknown commands and bare invocations exit non-zero with usage', () => {
  const bare = run();
  assert.equal(bare.status, 1);
  assert.match(bare.stderr, /Usage:/);
  const unknown = run('frobnicate');
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown command/);
});

test('--help exits zero and prints usage', () => {
  const result = run('--help');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /adoracle analyze/);
});
