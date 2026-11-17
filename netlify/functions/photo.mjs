// Photos for photo baubles.
// POST: a buyer's browser sends a small square JPEG before they pay. It is kept privately and gets a random reference.
// GET ?id=<decoration id>: returns the photo, but only once a member of the MMF team has approved it.
import { randomBytes } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { STORE } from '../lib/tree.mjs';

export const config = { path: '/api/photo' };

const MAX_BYTES = 90 * 1024;
const PREFIX = 'data:image/jpeg;base64,';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Returns the JPEG bytes of a data URL, or null if it is not a small JPEG.
export function jpegFromDataUrl(s) {
  if (typeof s !== 'string' || !s.startsWith(PREFIX) || s.length > MAX_BYTES * 1.4 + PREFIX.length) return null;
  const b64 = s.slice(PREFIX.length);
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return null;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 200 || buf.length > MAX_BYTES) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  return buf;
}

export default async (req) => {
  const store = getStore({ name: STORE, consistency: 'strong' });

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad-request' }, 400); }
    if (!jpegFromDataUrl(body && body.img)) return json({ error: 'bad-photo' }, 400);
    const ref = randomBytes(6).toString('hex');
    await store.set('photo/' + ref, body.img, { metadata: { t: Math.floor(Date.now() / 1000) } });
    return json({ ref });
  }

  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!/^[0-9a-f]{16}$/.test(id)) return new Response('Not found', { status: 404 });
    const idx = await store.get('index', { type: 'json' });
    const rec = ((idx && idx.records) || []).find((r) => r.id === id);
    if (!rec || rec.v || rec.s !== 'a' || !rec.ph || !rec.po) return new Response('Not found', { status: 404 });
    const buf = jpegFromDataUrl(await store.get('photo/' + rec.ph, { type: 'text' }));
    if (!buf) return new Response('Not found', { status: 404 });
    return new Response(buf, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
  }

  return new Response('Method not allowed', { status: 405 });
};
