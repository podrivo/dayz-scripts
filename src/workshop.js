// DayZ Steam Workshop snapshot for /api/workshop. The Community page fetches
// this when it opens; the key stays here, never in the page.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './util.js';

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
  const key = process.env.STEAM_API_KEY;
  if (!key) throw steamError(503, 'missing key');

  const [listed, collections, players] = await Promise.all([
    queryFiles(key, {
      query_type: 9,
      numperpage: COUNT,
      cursor: '*',
      filetype: 0,
      return_short_description: true,
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
        url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${it.publishedfileid}`,
      })),
  };
  if (body.items.length) cache = { at: Date.now(), body };
  return body;
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
