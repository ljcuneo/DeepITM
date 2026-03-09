// DeepITM — /api/quote Cloudflare Pages Function
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim();

  if (!symbol) {
    return jsonResponse({ error: 'Missing symbol' }, 400);
  }

  try {
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetch(chartUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    const json = await res.json();
    const meta = json.chart.result[0].meta;
    const prev = meta.chartPreviousClose || meta.previousClose;

    return jsonResponse({
      symbol: meta.symbol,
      price: meta.regularMarketPrice,
      previousClose: prev,
      change: +(meta.regularMarketPrice - prev).toFixed(2),
      changePct: +(((meta.regularMarketPrice - prev) / prev) * 100).toFixed(2),
    });
  } catch (e) {
    return jsonResponse({ error: 'Quote fetch failed: ' + e.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
