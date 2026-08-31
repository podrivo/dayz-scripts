import fs from 'node:fs';
import path from 'node:path';

const redirects = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'site', 'doxygen-redirects.json'), 'utf8')
);

export async function handler(event) {
  const target = redirects[`/${event.queryStringParameters?.path || ''}`];
  if (!target) return { statusCode: 404, body: 'Not found' };
  return {
    statusCode: 301,
    headers: {
      location: target,
      'cache-control': 'public, max-age=31536000, immutable',
    },
    body: '',
  };
}
