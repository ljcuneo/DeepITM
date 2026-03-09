// DeepITM — /api/options Cloudflare Pages Function
// Yahoo Finance crumb+cookie auth for options chain data

let yahooCrumb = null;
let yahooCookie = null;
let crumbExpiry = 0;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

async function getYahooCrumb() {
  if (yahooCrumb && Date.now() < crumbExpiry) {
    return { crumb: yahooCrumb, cookie: yahooCookie };
  }

  // Step 1: Get cookie from fc.yahoo.com
  const r1 = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA },
    redirect: 'manual',
  });
  const setCookies = r1.headers.getAll?.('set-cookie') || [r1.headers.get('set-cookie')].filter(Boolean);
  yahooCookie = setCookies.map(c => c.split(';')[0]).join('; ');

  // Step 2: Get crumb using cookie
  const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: yahooCookie },
  });
  yahooCrumb = await r2.text();
  crumbExpiry = Date.now() + 25 * 60 * 1000; // 25 min cache

  return { crumb: yahooCrumb, cookie: yahooCookie };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim();
  const date = url.searchParams.get('date') || null;

  if (!symbol) {
    return jsonResponse({ error: 'Missing symbol' }, 400);
  }

  try {
    const { crumb, cookie } = await getYahooCrumb();
    let optUrl = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(crumb)}`;
    if (date) optUrl += `&date=${date}`;

    const res = await fetch(optUrl, {
      headers: { 'User-Agent': UA, Cookie: cookie },
    });
    const json = await res.json();

    if (json.finance?.error) {
      throw new Error(json.finance.error.description || 'Yahoo API error');
    }

    const result = json.optionChain.result[0];
    const quote = result.quote;
    const expirations = result.expirationDates || [];
    const opts = result.options[0] || { calls: [], puts: [] };

    const mapContract = c => ({
      strike: c.strike,
      bid: c.bid || 0,
      ask: c.ask || 0,
      last: c.lastPrice || 0,
      mid: c.bid && c.ask ? +((c.bid + c.ask) / 2).toFixed(2) : c.lastPrice || 0,
      iv: c.impliedVolatility ? +(c.impliedVolatility * 100).toFixed(1) : null,
      volume: c.volume || 0,
      openInterest: c.openInterest || 0,
      inTheMoney: c.inTheMoney || false,
      expiration: c.expiration,
      contractSymbol: c.contractSymbol,
    });

    return jsonResponse({
      symbol: quote.symbol,
      price: quote.regularMarketPrice,
      name: quote.shortName || quote.longName || symbol,
      expirations,
      calls: opts.calls.map(mapContract),
      puts: opts.puts.map(mapContract),
    });
  } catch (e) {
    // Reset crumb on auth failure so next request retries
    yahooCrumb = null;
    crumbExpiry = 0;
    return jsonResponse({ error: 'Options fetch failed: ' + e.message }, 500);
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
