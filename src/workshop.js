// DayZ Steam Workshop snapshot for /api/workshop. The Community page fetches
// this when it opens; the key stays here, never in the page.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './util.js';

const CATALOG = path.join(ROOT, 'site', 'workshop.json');
const workshopHref = (id) => `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;

function catalogMod(it) {
  const id = String(it.id);
  return {
    name: it.title,
    id,
    url: it.url || workshopHref(id),
    description: it.description || '',
    tags: it.tags || [],
    preview: it.preview || '',
    created: it.created || '',
    updated: it.updated || '',
  };
}

function fillMod(existing, it) {
  const extra = catalogMod(it);
  let changed = false;
  const next = { ...existing };
  for (const [k, v] of Object.entries(extra)) {
    if (v === '' || (Array.isArray(v) && !v.length)) continue;
    if (next[k] === undefined || next[k] === '') {
      next[k] = v;
      changed = true;
    }
  }
  return changed ? next : existing;
}

function growCatalog(items) {
  if (process.env.NETLIFY || process.env.CI || !items.length) return;
  let catalog;
  try {
    catalog = readJson(CATALOG);
  } catch {
    return;
  }
  const mapIds = new Set((catalog.maps || []).map((m) => m.id && String(m.id)).filter(Boolean));
  const byId = new Map((catalog.mods || []).map((m) => [String(m.id), m]));
  const added = [];
  let filled = 0;
  for (const it of items) {
    const id = String(it.id);
    if (!id || mapIds.has(id)) continue;
    const prev = byId.get(id);
    if (!prev) {
      const entry = catalogMod(it);
      byId.set(id, entry);
      added.push(entry);
      continue;
    }
    const next = fillMod(prev, it);
    if (next !== prev) {
      byId.set(id, next);
      filled++;
    }
  }
  if (!added.length && !filled) return;
  catalog.mods = [...byId.values()];
  fs.writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);
  const bits = [];
  if (added.length) bits.push(`added ${added.map((m) => m.name).join(', ')}`);
  if (filled) bits.push(`filled ${filled}`);
  console.log(`workshop.json: ${bits.join('; ')}`);
}

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);
  else {
    for (const raw of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const name = line.slice(0, eq).trim();
      if (process.env[name] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (/^["']/.test(value) && value[0] === value.at(-1)) value = value.slice(1, -1);
      process.env[name] = value;
    }
  }
}

const APPID = 221100;
const COUNT = 9;
const TTL_MS = 10 * 60 * 1000;
const STEAM = 'https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/';
const PLAYERS = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${APPID}`;

let cache = null;

function steamError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function catalogBody() {
  try {
    const items = (readJson(CATALOG).mods || [])
      .filter((it) => it.id && it.name)
      .slice(0, COUNT)
      .map((it) => ({
        id: String(it.id),
        title: it.name,
        subscriptions: Number(it.subscriptions || 0),
        url: it.url || workshopHref(it.id),
        description: it.description || '',
        tags: it.tags || [],
        preview: it.preview || '',
        created: it.created || '',
        updated: it.updated || '',
      }));
    return items.length ? { total: 0, collections: 0, players: 0, items } : null;
  } catch {
    return null;
  }
}

async function queryFiles(key, input) {
  const url = new URL(STEAM);
  url.searchParams.set('key', key);
  url.searchParams.set('input_json', JSON.stringify({ appid: APPID, creator_appid: APPID, ...input }));
  const res = await fetch(url);
  if (!res.ok) throw steamError(502, `steam ${res.status}`);
  return res.json();
}

export async function workshopPayload() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.body;
  const fallback = (err) => {
    const body = catalogBody();
    if (body) return body;
    throw err;
  };
  const key = process.env.STEAM_API_KEY;
  if (!key) return fallback(steamError(503, 'missing key'));

  try {
    const [listed, collections, players] = await Promise.all([
      queryFiles(key, {
        query_type: 9,
        numperpage: COUNT,
        cursor: '*',
        filetype: 0,
        return_short_description: true,
        return_tags: true,
      }),
      queryFiles(key, { query_type: 9, numperpage: 1, cursor: '*', filetype: 1, totalonly: true }).catch(() => null),
      fetch(PLAYERS)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const details = listed.response?.publishedfiledetails || [];
    const body = {
      total: listed.response?.total ?? details.length,
      collections: collections?.response?.total ?? 0,
      players: players?.response?.player_count ?? 0,
      items: details
        .filter((it) => it?.publishedfileid && it.title && !Number(it.banned))
        .map((it) => ({
          id: String(it.publishedfileid),
          title: it.title,
          subscriptions: Number(it.subscriptions || it.lifetime_subscriptions || 0),
          url: workshopHref(it.publishedfileid),
          description: (it.short_description || '').replace(/\s+/g, ' ').trim().slice(0, 280),
          tags: (it.tags || []).map((t) => t.tag).filter(Boolean),
          preview: it.preview_url || '',
          created: it.time_created ? new Date(it.time_created * 1000).toISOString().slice(0, 10) : '',
          updated: it.time_updated ? new Date(it.time_updated * 1000).toISOString().slice(0, 10) : '',
        })),
    };
    if (body.items.length) {
      cache = { at: Date.now(), body };
      growCatalog(body.items);
      return body;
    }
    return catalogBody() || body;
  } catch (err) {
    return fallback(err);
  }
}

export function sendWorkshop(res) {
  return workshopPayload()
    .then((body) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300',
      });
      res.end(JSON.stringify(body));
    })
    .catch((err) => {
      res.writeHead(err.status || 502, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify({ error: 'Workshop could not be loaded' }));
    });
}
