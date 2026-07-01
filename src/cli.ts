#!/usr/bin/env node
/**
 * adoracle CLI.
 *
 *   adoracle analyze <file> [--json]   analyze every ad in one JSON file
 *   adoracle report <dir> [--json]     aggregate every *.json file in a directory
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { normalizeRecords } from './normalize.js';
import { analyzeAd, buildReport, renderAnalysis, renderReport } from './report.js';
import type { Ad } from './models.js';

const USAGE = `adoracle — ad intelligence engine

Usage:
  adoracle analyze <file> [--json]   Analyze ads in a JSON file (single record,
                                     array, or { "data": [...] } envelope)
  adoracle report <dir> [--json]     Aggregate every *.json file in a directory
                                     into a per-advertiser report
  adoracle --help                    Show this help

Options:
  --json   Emit machine-readable JSON instead of text
`;

function fail(message: string): number {
  process.stderr.write(`adoracle: ${message}\n`);
  return 1;
}

function loadAdsFromFile(file: string): Ad[] {
  const raw = readFileSync(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${(error as Error).message}`);
  }
  return normalizeRecords(parsed);
}

function runAnalyze(target: string, json: boolean): number {
  const file = resolve(target);
  const ads = loadAdsFromFile(file);
  if (ads.length === 0) return fail(`no ads found in ${target}`);
  const analyses = ads.map(analyzeAd);
  if (json) {
    process.stdout.write(`${JSON.stringify(analyses, null, 2)}\n`);
    return 0;
  }
  const rendered = analyses.map(renderAnalysis).join('\n\n');
  const average =
    Math.round(
      (analyses.reduce((sum, a) => sum + a.score.total, 0) / analyses.length) * 10,
    ) / 10;
  process.stdout.write(`${rendered}\n\n${analyses.length} ad(s) | avg score ${average}\n`);
  return 0;
}

function runReport(target: string, json: boolean): number {
  const dir = resolve(target);
  if (!statSync(dir).isDirectory()) {
    return fail(`${target} is not a directory (use "analyze" for single files)`);
  }
  const files = readdirSync(dir)
    .filter((name) => extname(name).toLowerCase() === '.json')
    .sort()
    .map((name) => join(dir, name));
  if (files.length === 0) return fail(`no .json files found in ${target}`);
  const ads = files.flatMap((file) => loadAdsFromFile(file));
  if (ads.length === 0) return fail(`no ads found in ${target}`);
  const report = buildReport(ads);
  process.stdout.write(
    json ? `${JSON.stringify(report, null, 2)}\n` : `${renderReport(report)}\n`,
  );
  return 0;
}

function main(argv: string[]): number {
  const json = argv.includes('--json');
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const [command, target] = positional;

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!command) {
    process.stderr.write(USAGE);
    return 1;
  }

  try {
    switch (command) {
      case 'analyze':
        if (!target) return fail('analyze requires a file path');
        return runAnalyze(target, json);
      case 'report':
        if (!target) return fail('report requires a directory path');
        return runReport(target, json);
      default:
        return fail(`unknown command "${command}"\n\n${USAGE}`);
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return fail(`no such file or directory: ${target}`);
    return fail(err.message);
  }
}

process.exit(main(process.argv.slice(2)));
