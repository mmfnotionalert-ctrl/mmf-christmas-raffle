// Tells the tree page how many tickets are sold and which decorations to hang.
// Public, and contains no personal data. Names and wishes come from data.json once approved.
import { getStore } from '@netlify/blobs';

export const config = { path: '/api/tree' };

export default async () => {
  let records = [];
  try {
    const store = getStore('christmas-raffle');
    const idx = await store.get('index', { type: 'json' });
    records = (idx && idx.records) || [];
  } catch (e) {
    // no purchases yet, or Blobs unavailable: show an empty tree
  }
  const live = records.filter((r) => r && !r.v).sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : 1));
  const sold = live.reduce((n, r) => n + (r.q || 0), 0);
  const decorations = live.map((r) => ({ id: r.id, d: r.d }));
  return new Response(JSON.stringify({ sold, decorations, webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET) }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=0, must-revalidate',
      'netlify-cdn-cache-control': 'public, s-maxage=15, stale-while-revalidate=60',
    },
  });
};
