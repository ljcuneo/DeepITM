// DeepITM — /api/options Vercel Serverless Function
const https = require('https');

let yahooCrumb = null;
let yahooCookie = null;
let crumbExpiry = 0;

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', ...headers } };
    https.get(url, opts, res => {
      let data = '';
      const cookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ data, cookies, status: res.statusCode }));
    }).on('error', reject);
  });
}

async function getYahooCrumb() {
  if (yahooCrumb && Date.now() < crumbExpiry) return { crumb: yahooCrumb, cookie: yahooCookie };

  const r1 = await httpsGet('https://fc.yahoo.com');
  yahooCookie = r1.cookies;

  const r2 = await httpsGet('https://query2.finance.yahoo.com/v1/test/getcrumb', { Cookie: yahooCookie });
  yahooCrumb = r2.data;
  crumbExpiry = Date.now() + 25 * 60 * 1000;

  return { crumb: yahooCrumb, cookie: yahooCookie };
}

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const symbol = (req.query.symbol || '').toUpperCase().trim();
  const date = req.query.date || null;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  try {
    const { crumb, cookie } = await getYahooCrumb();
    let url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(crumb)}`;
    if (date) url += `&date=${date}`;

    const { data } = await httpsGet(url, { Cookie: cookie });
    const json = JSON.parse(data);

    if (json.finance?.error) throw new Error(json.finance.error.description || 'Yahoo API error');

    const result = json.optionChain.result[0];
    const quote = result.quote;
    const expirations = result.expirationDates || [];
    const opts = result.options[0] || { calls: [], puts: [] };

    res.json({
      symbol: quote.symbol,
      price: quote.regularMarketPrice,
      name: quote.shortName || quote.longName || symbol,
      expirations,
      calls: opts.calls.map(mapContract),
      puts: opts.puts.map(mapContract),
    });
  } catch (e) {
    yahooCrumb = null;
    crumbExpiry = 0;
    res.status(500).json({ error: 'Options fetch failed: ' + e.message });
  }
};
