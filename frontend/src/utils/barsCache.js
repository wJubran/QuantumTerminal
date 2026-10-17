// version: v1
// barsCache.js — session-only in-memory cache for /api/bars responses.
//
// Purpose: eliminate the "re-download bars on every TF switch" wait that
// showed up as the universe of tickers grew. First fetch per (ticker, tf)
// hits the network; every subsequent request in the same browser session
// is served from the Map below.
//
// Cache policy:
//   - Key:   `${ticker}:${tf}` (count excluded; one entry holds the largest
//            bar array ever fetched for that pair; smaller requests are
//            served by slicing the tail).
//   - Value: { bars: [...], ts }  — raw bars array as returned by the API.
//   - Lifetime: until page reload. No persistence — deliberately simple.
//   - Invalidation: implicit (reload refetches). clearBarsCache() exposed
//     for manual bust if a future "refresh" button wants it.
//
// In-flight dedupe: if two callers race for the same (ticker, tf), the
// second awaits the first's promise instead of issuing a duplicate GET.
//
// Return shape matches /api/bars/ — { ticker, timeframe, count, bars } —
// so callers can drop-in replace `apiFetch('/api/bars/...')`.

const cache    = new Map();   // key -> { bars, ts }
const inflight = new Map();   // key -> Promise<data|null>

function buildResponse(ticker, tf, bars, count, cached) {
  const sliced = bars.length > count ? bars.slice(-count) : bars;
  return { ticker, timeframe: tf, count: sliced.length, bars: sliced, cached };
}

export async function fetchBarsCached(ticker, tf, count) {
  if (!ticker || !tf) return null;
  const key = `${ticker}:${tf}`;

  // Hit: cached covers the request.
  const hit = cache.get(key);
  if (hit && hit.bars.length >= count) {
    return buildResponse(ticker, tf, hit.bars, count, true);
  }

  // In-flight: reuse the pending fetch if it will cover the request.
  if (inflight.has(key)) {
    const data = await inflight.get(key);
    if (data?.bars?.length >= count) {
      return buildResponse(ticker, tf, data.bars, count, true);
    }
    // Fall through — in-flight result was too small; start a larger fetch.
  }

  // Miss — fetch the max of (requested, previously cached) so we never shrink.
  const fetchCount = Math.max(count, hit?.bars?.length || 0);
  const url = `/api/bars/${encodeURIComponent(ticker)}?timeframe=${encodeURIComponent(tf)}&count=${fetchCount}`;

  const p = (async () => {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const data = await r.json();
      if (!data?.bars) return null;
      cache.set(key, { bars: data.bars, ts: Date.now() });
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);

  const data = await p;
  if (!data) return null;
  return buildResponse(ticker, tf, data.bars, count, false);
}

export function clearBarsCache(ticker) {
  if (!ticker) { cache.clear(); return; }
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(`${ticker}:`)) cache.delete(k);
  }
}
