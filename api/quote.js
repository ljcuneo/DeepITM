// DeepITM — /api/quote Vercel Serverless Function
const https = require('https');

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', ...headers } };
    https.get(url, opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ data, status: res.statusCode }));
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const symbol = (req.query.symbol || '').toUpperCase().trim();
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const { data } = await httpsGet(url);
    const json = JSON.parse(data);
    const meta = json.chart.result[0].meta;
    const prev = meta.chartPreviousClose || meta.previousClose;

    res.json({
      symbol: meta.symbol,
      price: meta.regularMarketPrice,
      previousClose: prev,
      change: +(meta.regularMarketPrice - prev).toFixed(2),
      changePct: +(((meta.regularMarketPrice - prev) / prev) * 100).toFixed(2),
    });
  } catch (e) {
    res.status(500).json({ error: 'Quote fetch failed: ' + e.message });
  }
};
