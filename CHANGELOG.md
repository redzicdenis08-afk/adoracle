# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Planned
- Apify integration for live ad scraping
- Hook saturation score: detect when a hook angle is overused in a niche
- Export to Airtable

## [0.2.0] - 2026-07-08

### Added
- examples/ directory with sample ad data and expected scoring output
- docs/SCORING.md: engagement and hook strength scoring model
- docs/HOOKS.md: full reference of all five detected hook angles

## [0.1.0] - 2026-06-24

### Added
- Ad creative ingestion from JSON
- Hook angle detection: pain, transformation, social proof, scarcity, authority
- Engagement score normalization
- Report formatter: CSV and JSON
- CLI: adoracle score, adoracle batch
- Test suite and CI
