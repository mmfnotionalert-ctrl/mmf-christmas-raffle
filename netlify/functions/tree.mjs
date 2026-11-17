// Tells the tree page how many tickets are sold and which decorations to hang.
// Public. Names and wishes are only included once MMF has approved them on the /approve page.
import { getStore } from '@netlify/blobs';

export const config = { path: '/api/tree' };

export default async (req) => {
  // A buyer just back from paying asks with ?fresh= so they are never shown an older saved copy.
  const fresh = new URL(req.url).searchParams.has('fresh');
  let records = [];
  try {
    const store = getStore(fresh ? { name: 'christmas-raffle', consistency: 'strong' } : 'christmas-raffle');
    const idx = await store.get('index', { type: 'json' });
    records = (idx && idx.records) || [];
  } catch (e) {
    // no purchases yet, or Blobs unavailable: show an empty tree
  }
  const live = records.filter((r) => r && !r.v).sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  const sold = live.reduce((n, r) => n + (r.q || 0), 0);
  // Names and wishes are only included once a member of the MMF team has approved them.
  const decorations = live.map((r) => {
    const out = { id: r.id, d: r.d };
    if (r.s === 'a' && (r.n || r.m)) { out.n = r.n || ''; out.m = r.m || ''; }
    if (r.s === 'a' && r.ph && r.po) out.p = 1; // an approved photo: the page fetches it from /api/photo
    return out;
  });
  // How many names, wishes or photos are waiting for the MMF team. A number only, so staff alerts know when to look.
  const waiting = live.filter((r) => r.s === 'p' && (r.n || r.m || r.ph)).length;
  return new Response(JSON.stringify({ sold, decorations, waiting, webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET) }), {
    headers: fresh
      ? { 'content-type': 'application/json', 'cache-control': 'no-store', 'netlify-cdn-cache-control': 'no-store' }
      : {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=0, must-revalidate',
          'netlify-cdn-cache-control': 'public, s-maxage=15, stale-while-revalidate=60',
        },
  });
};
