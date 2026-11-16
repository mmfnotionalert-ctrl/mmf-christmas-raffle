// Stripe calls this the moment a raffle payment goes through. It adds the buyer's tickets
// to the count and hangs their decoration on the tree. It keeps a hashed reference, the time,
// the ticket count, the decoration picked, and the name and wish the buyer asked to show on the
// tree. It keeps no emails, phone numbers or payment details. Names and wishes stay private
// until a member of the MMF team approves them on the /approve page.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { CAMPAIGN, STORE, recordFromSession, shortHash, update } from '../lib/tree.mjs';

export const config = { path: '/api/stripe-webhook' };

const TOLERANCE = 300; // seconds

function verify(body, header, secret) {
  if (!header) return false;
  const parts = Object.create(null);
  const v1 = [];
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i < 0) continue;
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    if (k === 'v1') v1.push(v); else parts[k] = v;
  }
  const t = parseInt(parts.t, 10);
  if (!t || Math.abs(Date.now() / 1000 - t) > TOLERANCE) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  return v1.some((sig) => {
    const b = Buffer.from(sig);
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) { console.log('webhook: STRIPE_WEBHOOK_SECRET is not set'); return new Response('Not configured', { status: 500 }); }
  const body = await req.text();
  if (!verify(body, req.headers.get('stripe-signature'), secret)) { console.log('webhook: signature check failed'); return new Response('Bad signature', { status: 400 }); }

  let event;
  try { event = JSON.parse(body); } catch { return new Response('Bad JSON', { status: 400 }); }
  const obj = (event.data && event.data.object) || {};
  const store = getStore({ name: STORE, consistency: 'strong' });

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (obj.payment_status !== 'paid' || (obj.metadata || {}).campaign !== CAMPAIGN) return new Response('Ignored', { status: 200 });
    const rec = recordFromSession(obj);
    const result = await update(store, (records) => (records.some((r) => r.id === rec.id) ? null : [...records, rec]));
    console.log(`webhook: purchase ${rec.id} (${rec.q} ticket(s), ${rec.d}) ${result}`);
    return new Response(result, { status: 200 });
  }

  if (event.type === 'charge.refunded' && obj.refunded && obj.payment_intent) {
    const pi = shortHash(obj.payment_intent);
    const result = await update(store, (records) => {
      if (!records.some((r) => r.pi === pi && !r.v)) return null;
      return records.map((r) => (r.pi === pi ? { ...r, v: true } : r));
    });
    return new Response(result, { status: 200 });
  }

  return new Response('Ignored', { status: 200 });
};
