// Staff only: lists the names, wishes and photos waiting for approval and saves MMF's decisions.
// Protected by the APPROVE_PASSPHRASE environment variable, which staff type on the /approve page.
import { createHash, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { STORE, clean, update } from '../lib/tree.mjs';
import { jpegFromDataUrl } from './photo.mjs';

export const config = { path: '/api/approve' };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const digest = (s) => createHash('sha256').update(String(s)).digest();

export default async (req) => {
  const pass = process.env.APPROVE_PASSPHRASE;
  if (!pass || pass.length < 8) return json({ error: 'not-set-up' }, 503);
  const given = req.headers.get('x-passphrase') || '';
  if (!timingSafeEqual(digest(given), digest(pass))) {
    await new Promise((r) => setTimeout(r, 600)); // slows down guessing
    return json({ error: 'wrong-passphrase' }, 401);
  }
  const store = getStore({ name: STORE, consistency: 'strong' });

  if (req.method === 'GET') {
    const idx = await store.get('index', { type: 'json', consistency: 'strong' });
    const items = ((idx && idx.records) || [])
      .filter((r) => r && !r.v && r.s)
      .sort((a, b) => b.t - a.t)
      .map((r) => ({ id: r.id, t: r.t, q: r.q, d: r.d, n: r.n || '', m: r.m || '', s: r.s, ph: r.ph || '', po: Boolean(r.po) }));
    // Send each uploaded photo with its entry, so staff can see it before deciding.
    await Promise.all(items.map(async (it) => {
      const ref = it.ph; delete it.ph;
      if (!ref) return;
      const img = await store.get('photo/' + ref, { type: 'text' });
      if (jpegFromDataUrl(img)) it.img = img;
    }));
    return json({ items });
  }

  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad-request' }, 400); }
    const id = String(body.id || '');
    const s = { approve: 'a', decline: 'x', pending: 'p' }[body.action];
    if (!/^[0-9a-f]{16}$/.test(id) || !s) return json({ error: 'bad-request' }, 400);
    const n = clean(body.n, 30), m = clean(body.m, 255);
    let found = false;
    const result = await update(store, (records) => {
      found = records.some((r) => r.id === id && r.s);
      if (!found) return null;
      // The photo only goes public when the entry is approved and staff left "show the photo" ticked.
      return records.map((r) => (r.id === id ? { ...r, n, m, s, ...(r.ph ? { po: s === 'a' && body.photo !== false } : {}) } : r));
    });
    return found ? json({ ok: true, result }) : json({ error: 'not-found' }, 404);
  }

  return json({ error: 'method-not-allowed' }, 405);
};
