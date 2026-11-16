// Mae Murray Foundation Christmas Raffle 2026: shared rules for the tree.
import { createHash } from 'node:crypto';

export const CAMPAIGN = 'christmas_raffle_2026';
export const PRICE_PENCE = 500;
export const STORE = 'christmas-raffle';

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

// Tidy text typed by a buyer or a member of staff: one line, no control characters, capped.
const CONTROL = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127, 0x2028, 0x2029) + ']+', 'g');
export function clean(s, max) {
  return [...String(s ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
}

// The page sends the name and wish inside the payment reference: d_<decoration>__<base64url of "name\nwish">
function fromReference(ref) {
  const i = ref.indexOf('__');
  if (i < 0) return { n: '', m: '' };
  try {
    const text = Buffer.from(ref.slice(i + 2), 'base64url').toString('utf8');
    const j = text.indexOf('\n');
    return { n: clean(j < 0 ? text : text.slice(0, j), 30), m: clean(j < 0 ? '' : text.slice(j + 1), 80) };
  } catch { return { n: '', m: '' }; }
}

// The optional "Longer message for the tree" box at the Stripe checkout
function longerMessage(s) {
  for (const f of Array.isArray(s.custom_fields) ? s.custom_fields : []) {
    if (f && f.type === 'text' && f.text && f.text.value) return clean(f.text.value, 255);
  }
  return '';
}

// A paid Stripe checkout session -> a record: hashed session id, time, ticket count, the decoration picked,
// and the name and wish the buyer asked to show on the tree. No email, phone or payment details are kept.
// s is the approval status: 'p' waiting for MMF, 'a' approved, 'x' not shown. Only 'a' is ever made public.
export function recordFromSession(s) {
  const md = s.metadata || {};
  let q = parseInt(md.tickets, 10);
  if (!q) q = Math.round((s.amount_subtotal ?? s.amount_total ?? 0) / PRICE_PENCE);
  const ref = String(s.client_reference_id || '');
  const m = ref.split('__')[0].match(/^d_([a-z_]+)$/);
  const d = allowedDecoration(m ? m[1] : 'bauble_red', q);
  const rec = { id: shortHash(s.id), pi: s.payment_intent ? shortHash(s.payment_intent) : null, t: s.created, q, d, v: false };
  const typed = fromReference(ref);
  const wish = longerMessage(s) || typed.m;
  if (typed.n || wish) { rec.n = typed.n; rec.m = wish; rec.s = 'p'; }
  return rec;
}

// Read, change and save the list of records, retrying if two changes land at once.
export async function update(store, change) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const cur = await store.getWithMetadata('index', { type: 'json', consistency: 'strong' });
    const records = (cur && cur.data && cur.data.records) || [];
    const next = change(records);
    if (!next) return 'unchanged';
    const opts = cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true };
    const res = await store.setJSON('index', { records: next }, opts);
    if (res.modified) return 'saved';
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
  }
  throw new Error('could not save after retries');
}
