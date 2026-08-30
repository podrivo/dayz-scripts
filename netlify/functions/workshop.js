import { workshopPayload } from '../../src/workshop.js';

export async function handler() {
  try {
    const body = await workshopPayload();
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300',
      },
      body: JSON.stringify(body),
    };
  } catch (err) {
    return {
      statusCode: err.status || 502,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
      body: JSON.stringify({ error: 'Workshop could not be loaded' }),
    };
  }
}
