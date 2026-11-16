// Mae Murray Foundation Christmas Raffle 2026: shared rules for the tree.
import { createHash } from 'node:crypto';

export const CAMPAIGN = 'christmas_raffle_2026';
export const PRICE_PENCE = 500;

// Which decorations each number of tickets unlocks. Must match the page.
const CLASSIC = ['bauble_red', 'bauble_gold', 'cane', 'snow'];
const PREMIUM = ['gstar', 'robin', 'angel'];
const SPECIAL = ['mmf', 'nutcracker', 'photo'];

export const shortHash = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

export function allowedDecoration(d, q) {
  if (CLASSIC.includes(d)) return d;
  if (PREMIUM.includes(d) && q >= 5) return d;
  if (SPECIAL.includes(d) && q >= 10) return d;
  return 'bauble_red';
}

// A paid Stripe checkout session -> a record with no personal data:
// hashed session id, time, ticket count and the decoration picked.
export function recordFromSession(s) {
  const md = s.metadata || {};
  let q = parseInt(md.tickets, 10);
  if (!q) q = Math.round((s.amount_subtotal ?? s.amount_total ?? 0) / PRICE_PENCE);
  const m = String(s.client_reference_id || '').match(/^d_([a-z_]+)$/);
  const d = allowedDecoration(m ? m[1] : 'bauble_red', q);
  return { id: shortHash(s.id), pi: s.payment_intent ? shortHash(s.payment_intent) : null, t: s.created, q, d, v: false };
}
