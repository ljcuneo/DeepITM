#!/usr/bin/env node
// DeepITM — Local server
// Proxies Yahoo Finance for stock quotes + real options chain data
// Usage: node server.js → http://localhost:3900

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3900;
const DIR = __dirname;

// ── Yahoo Finance auth (crumb + cookie) ──
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

  // Step 1: Get cookie
  const r1 = await httpsGet('https://fc.yahoo.com');
  yahooCookie = r1.cookies;

  // Step 2: Get crumb using cookie
  const r2 = await httpsGet('https://query2.finance.yahoo.com/v1/test/getcrumb', { Cookie: yahooCookie });
  yahooCrumb = r2.data;
  crumbExpiry = Date.now() + 30 * 60 * 1000; // 30 min cache

  return { crumb: yahooCrumb, cookie: yahooCookie };
}

// ── Stock quote (no auth needed) ──
function fetchQuote(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    httpsGet(url).then(({ data }) => {
      try {
        const json = JSON.parse(data);
        const meta = json.chart.result[0].meta;
        const prev = meta.chartPreviousClose || meta.previousClose;
        resolve({
          symbol: meta.symbol,
          price: meta.regularMarketPrice,
          previousClose: prev,
          change: +(meta.regularMarketPrice - prev).toFixed(2),
          changePct: +(((meta.regularMarketPrice - prev) / prev) * 100).toFixed(2),
        });
      } catch (e) { reject(new Error('Quote parse error')); }
    }).catch(reject);
  });
}

// ── Options chain (needs crumb) ──
async function fetchOptionsChain(symbol, expirationDate) {
  const { crumb, cookie } = await getYahooCrumb();
  let url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(crumb)}`;
  if (expirationDate) url += `&date=${expirationDate}`;

  const { data } = await httpsGet(url, { Cookie: cookie });
  const json = JSON.parse(data);

  if (json.finance?.error) throw new Error(json.finance.error.description || 'Yahoo API error');

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

  return {
    symbol: quote.symbol,
    price: quote.regularMarketPrice,
    name: quote.shortName || quote.longName || symbol,
    expirations: expirations,
    calls: opts.calls.map(mapContract),
    puts: opts.puts.map(mapContract),
  };
}

// ── HTTP Server ──
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // /api/quote?symbol=LUNR
  if (url.pathname === '/api/quote') {
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim();
    if (!symbol) return json400(res, 'Missing symbol');
    try {
      const quote = await fetchQuote(symbol);
      json200(res, quote);
    } catch (e) { json500(res, e.message); }
    return;
  }

  // /api/options?symbol=LUNR
  // /api/options?symbol=LUNR&date=1781740800  (specific expiration)
  if (url.pathname === '/api/options') {
    const symbol = (url.searchParams.get('symbol') || '').toUpperCase().trim();
    const date = url.searchParams.get('date') || null;
    if (!symbol) return json400(res, 'Missing symbol');
    try {
      const chain = await fetchOptionsChain(symbol, date);
      json200(res, chain);
    } catch (e) { json500(res, e.message); }
    return;
  }

  // Static files — resolve and verify path stays within project directory
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.resolve(DIR, '.' + filePath);
  if (!filePath.startsWith(DIR + path.sep) && filePath !== DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  const ext = path.extname(filePath);
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

function json200(res, data) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); }
function json400(res, msg) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: msg })); }
function json500(res, msg) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: msg })); }

server.listen(PORT, () => {
  console.log(`\n  DeepITM running at:\n`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  API:`);
  console.log(`    /api/quote?symbol=LUNR`);
  console.log(`    /api/options?symbol=LUNR`);
  console.log(`    /api/options?symbol=LUNR&date=1781740800\n`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
