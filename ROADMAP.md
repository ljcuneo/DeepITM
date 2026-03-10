# DeepITM Roadmap

## Phase 0: Foundation (Week 1-2)
Split the monolithic index.html, consolidate duplicate server code, add API response caching.

- [ ] Extract CSS → `style.css`, JS → `app.js`
- [ ] Consolidate `server.js` / `api/*.js` / `functions/api/*.js` into shared module
- [ ] Add in-memory response cache (60s quotes, 5min options chains)

## Phase 1: Smarter Data (Week 2-4)
Fix the top 3 scoring limitations. This is where the model goes from "reasonable guess" to "actually useful."

- [ ] **Earnings awareness** — fetch next earnings date, warn when expiration straddles earnings, penalize score for IV crush risk
- [ ] **IV percentile** — calculate 30-day realized vol from 1yr price history, compare to current IV, show "IV RANK: HIGH/LOW" badge, adjust scoring
- [ ] **Adaptive move targets** — replace static 10% with stock-specific expected move based on historical volatility and selected timeframe

## Phase 2: Usability (Week 4-6)
Make the app self-explaining so no one needs to read SCORING.md.

- [ ] Tooltips on every metric (Score, EV, R:R, POP, Delta, Theta, IV, Kelly)
- [ ] Score breakdown visualization — show the 5 components as bars in detail view
- [ ] Scan history — save last 10 scans to localStorage, quick re-run
- [ ] Comparison mode — pin 2-3 cards side-by-side
- [ ] Market hours indicator in header

## Phase 3: Portfolio Tracking (Week 6-10)
Turn DeepITM from a scanner into a daily tool.

- [ ] "I bought this" button — save positions to localStorage with entry price, date, contracts
- [ ] Portfolio tab — open positions with live P/L, days to exit checkpoints, theta burn rate
- [ ] Exit reminders — browser notifications at 21 DTE, 14 DTE, profit target, stop loss
- [ ] Sector concentration warnings — flag when adding to an already-held sector
- [ ] Performance dashboard — win rate, avg P/L, total return over time

## Phase 4: Polish (Week 10-12)
Make it feel native on mobile.

- [ ] PWA — manifest.json, service worker, "Add to Home Screen"
- [ ] Parallel Discover fetches — 5 at a time instead of sequential (3s vs 15s)
- [ ] Error resilience — auto retry on crumb expiry, request timeouts, partial results
- [ ] Mobile gestures — swipe tabs, pull to refresh, bigger touch targets

## Phase 5: Growth (Week 12-14)
Let users share what they find.

- [ ] Share a trade — URL with query params that renders the analysis for anyone
- [ ] Export to image — PNG screenshot of analysis card for social media
- [ ] Watchlist sharing — import/export codes

## Phase 6: Monetization (Week 14+)
Only after the product is sticky.

- [ ] Affiliate broker links (Webull, Tastytrade referral programs)
- [ ] Premium tier ($5-10/mo) — unlimited scans, IV rank, synced portfolios
- [ ] API as a product — expose scoring model as an endpoint for developers

---

## Why This Order

1. **Foundation first** — 86KB single file becomes untenable. Every future feature is cheaper after the split.
2. **Data before UX** — better data makes every score better. Polishing UI on flawed scores is wasted effort.
3. **UX before portfolio** — users need to trust the scoring before they'll journal trades in the app.
4. **Portfolio is the retention hook** — without it, DeepITM is "scan and leave." With it, users return daily.
5. **Polish after retention** — PWA matters once people use it daily.
6. **Growth after polish** — sharing only matters when the analysis is good enough to share.
7. **Money last** — premature monetization kills small tools. Build the habit first.
