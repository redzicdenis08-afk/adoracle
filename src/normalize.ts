/**
 * Normalizers: turn raw ad-library records into the canonical {@link Ad}.
 *
 * Two input shapes are supported out of the box:
 *  - Meta Ad Library records (the shape returned by the public ads_archive API)
 *  - a generic flat record with obvious field names
 *
 * `normalizeRecords` auto-detects the shape and also unwraps common envelopes
 * (`{ data: [...] }`, `{ ads: [...] }`, a bare array, or a single object).
 */

import type { Ad, MediaType, Platform } from './models.js';

/** Subset of the Meta Ad Library record shape that adoracle reads. */
export interface MetaAdLibraryRecord {
  id?: string | number;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_descriptions?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  publisher_platforms?: string[];
  languages?: string[];
  media_type?: string;
  cta_type?: string;
  link_url?: string;
}

/** A permissive flat shape for everything that is not Meta-shaped. */
export interface GenericAdRecord {
  id?: string | number;
  advertiser?: string;
  brand?: string;
  platform?: string;
  headline?: string;
  title?: string;
  body?: string;
  text?: string;
  description?: string;
  cta?: string;
  call_to_action?: string;
  landing_url?: string;
  landingUrl?: string;
  url?: string;
  media_type?: string;
  mediaType?: string;
  first_seen?: string;
  firstSeen?: string;
  start_date?: string;
  last_seen?: string;
  lastSeen?: string;
  end_date?: string;
  active?: boolean;
  languages?: string[];
}

export interface NormalizeOptions {
  /** Reference time for `daysActive` on still-running ads. Defaults to `new Date()`. */
  now?: Date;
}

const MS_PER_DAY = 86_400_000;

/** Deterministic FNV-1a hash, used to mint ids for records that lack one. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Extract a bare landing domain from a URL or display link.
 * Returns `undefined` for anything that does not look like a hostname.
 */
export function extractDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed || /\s/.test(trimmed)) return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const host = new URL(candidate).hostname.toLowerCase();
    if (!host.includes('.')) return undefined;
    return host.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** Turn `SHOP_NOW` / `sign_up` into `Shop now` / `Sign up`. */
export function humanizeCta(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/[_-]+/g, ' ').toLowerCase();
  if (!cleaned) return undefined;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function mapMediaType(raw: string | undefined): MediaType {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'video':
      return 'video';
    case 'image':
    case 'photo':
      return 'image';
    case 'carousel':
    case 'carousel_album':
    case 'dco':
      return 'carousel';
    case 'text':
      return 'text';
    default:
      return 'unknown';
  }
}

function mapPlatform(raw: string | undefined): Platform {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'meta':
    case 'facebook':
    case 'instagram':
      return 'meta';
    case 'tiktok':
      return 'tiktok';
    case 'youtube':
      return 'youtube';
    case 'linkedin':
      return 'linkedin';
    case 'pinterest':
      return 'pinterest';
    default:
      return 'other';
  }
}

function computeDaysActive(
  firstSeen: string | undefined,
  lastSeen: string | undefined,
  now: Date,
): number | undefined {
  if (!firstSeen) return undefined;
  const start = Date.parse(firstSeen);
  if (Number.isNaN(start)) return undefined;
  const endRaw = lastSeen ? Date.parse(lastSeen) : now.getTime();
  const end = Number.isNaN(endRaw) ? now.getTime() : endRaw;
  if (end <= start) return 1;
  return Math.max(1, Math.round((end - start) / MS_PER_DAY));
}

function first(values: string[] | undefined): string | undefined {
  const v = values?.find((s) => typeof s === 'string' && s.trim() !== '');
  return v?.trim();
}

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v === '' ? undefined : v;
}

/** Normalize one Meta Ad Library record. */
export function normalizeMetaAd(
  record: MetaAdLibraryRecord,
  options: NormalizeOptions = {},
): Ad {
  const now = options.now ?? new Date();
  const id =
    record.id != null && String(record.id).trim() !== ''
      ? String(record.id).trim()
      : `ad-${fnv1a(JSON.stringify(record))}`;
  const caption = first(record.ad_creative_link_captions);
  const firstSeen = clean(record.ad_delivery_start_time);
  const lastSeen = clean(record.ad_delivery_stop_time);
  return {
    id,
    advertiser: clean(record.page_name) ?? 'unknown',
    platform: 'meta',
    firstSeen,
    lastSeen,
    daysActive: computeDaysActive(firstSeen, lastSeen, now),
    active: !lastSeen,
    headline: first(record.ad_creative_link_titles),
    body: first(record.ad_creative_bodies),
    linkDescription: first(record.ad_creative_link_descriptions),
    cta: humanizeCta(record.cta_type),
    landingDomain: extractDomain(record.link_url) ?? extractDomain(caption),
    mediaType: mapMediaType(record.media_type),
    languages: record.languages ?? [],
  };
}

/** Normalize one generic flat record. */
export function normalizeGenericAd(
  record: GenericAdRecord,
  options: NormalizeOptions = {},
): Ad {
  const now = options.now ?? new Date();
  const id =
    record.id != null && String(record.id).trim() !== ''
      ? String(record.id).trim()
      : `ad-${fnv1a(JSON.stringify(record))}`;
  const firstSeen = clean(record.first_seen ?? record.firstSeen ?? record.start_date);
  const lastSeen = clean(record.last_seen ?? record.lastSeen ?? record.end_date);
  const active = record.active ?? !lastSeen;
  return {
    id,
    advertiser: clean(record.advertiser ?? record.brand) ?? 'unknown',
    platform: mapPlatform(record.platform),
    firstSeen,
    lastSeen,
    daysActive: computeDaysActive(active ? firstSeen : firstSeen, lastSeen, now),
    active,
    headline: clean(record.headline ?? record.title),
    body: clean(record.body ?? record.text),
    linkDescription: clean(record.description),
    cta: clean(record.cta ?? record.call_to_action),
    landingDomain: extractDomain(record.landing_url ?? record.landingUrl ?? record.url),
    mediaType: mapMediaType(record.media_type ?? record.mediaType),
    languages: record.languages ?? [],
  };
}

const META_MARKERS: readonly string[] = [
  'page_name',
  'ad_creative_bodies',
  'ad_creative_link_titles',
  'ad_delivery_start_time',
  'ad_snapshot_url',
];

/** True when a record looks like it came from the Meta Ad Library. */
export function isMetaRecord(record: unknown): record is MetaAdLibraryRecord {
  if (record === null || typeof record !== 'object') return false;
  return META_MARKERS.some((key) => key in (record as Record<string, unknown>));
}

/** Normalize a single record of either supported shape. */
export function normalizeAd(record: unknown, options: NormalizeOptions = {}): Ad {
  if (record === null || typeof record !== 'object') {
    throw new TypeError('Expected an ad record object');
  }
  return isMetaRecord(record)
    ? normalizeMetaAd(record, options)
    : normalizeGenericAd(record as GenericAdRecord, options);
}

/**
 * Normalize any reasonable JSON payload into `Ad[]`.
 * Accepts a single record, an array, or `{ data | ads | results: [...] }`.
 */
export function normalizeRecords(input: unknown, options: NormalizeOptions = {}): Ad[] {
  if (input === null || input === undefined) return [];
  if (Array.isArray(input)) {
    return input.map((record) => normalizeAd(record, options));
  }
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    for (const key of ['data', 'ads', 'results']) {
      if (Array.isArray(obj[key])) {
        return (obj[key] as unknown[]).map((record) => normalizeAd(record, options));
      }
    }
    return [normalizeAd(input, options)];
  }
  throw new TypeError('Expected an ad record, an array of records, or an envelope object');
}
