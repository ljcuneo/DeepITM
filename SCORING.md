# DeepITM Scoring Model

## How Options Are Analyzed and Ranked

DeepITM uses a quantitative scoring model to rank options plays from 0-100. The score is a weighted composite of five components drawn from options pricing theory, plus safety filters and a DTE multiplier.

---

## Data Source

All data comes from Yahoo Finance options chains via a local proxy server. For each contract, we have:

- **Strike price**
- **Bid / Ask / Last / Mid price** (mid = (bid + ask) / 2)
- **Implied Volatility (IV)** — market's expectation of future price movement
- **Volume** — contracts traded today
- **Open Interest (OI)** — total open contracts
- **Expiration date** (used to calculate DTE)

Delta and other Greeks are calculated client-side using Black-Scholes.

---

## Scoring Components

### 1. Expected Value (30% weight)

The mathematical expectation of profit or loss, using delta as the probability of finishing in-the-money.

```
Target Price = Stock Price × 1.10  (for calls)
             = Stock Price × 0.90  (for puts)

Profit at Target = Intrinsic Value at Target - Premium Paid
EV = Delta × max(Profit, 0) - (1 - Delta) × Premium

Normalized to 0-1 scale: (EV / Premium + 1) / 2
```

**What it measures:** Whether the option has a positive expected return. A positive EV means the potential gains, weighted by their probability, exceed the expected losses.

### 2. Risk-Reward Ratio (25% weight)

How much you stand to gain versus how much you risk, assuming a 10% favorable stock move.

```
Potential Gain = Intrinsic Value at 10% Move - Premium
Max Risk = Premium (100% loss)
R:R Ratio = Potential Gain / Max Risk

Normalized against a 3:1 target (capped at 1.0)
```

**What it measures:** Capital efficiency. A 3:1 ratio means you make $3 for every $1 risked. Higher is better, but extremely high ratios usually mean low probability (far OTM).

### 3. Probability of Profit (20% weight)

The likelihood that the stock reaches your breakeven price before expiration. More accurate than raw delta because it accounts for the premium paid.

```
Breakeven = Strike + Premium  (for calls)
          = Strike - Premium  (for puts)

Signed Move = (Breakeven - Stock Price) / Stock Price  (calls)
            = (Stock Price - Breakeven) / Stock Price  (puts)

Period Volatility = IV × sqrt(DTE / 365)
POP = N(-Signed Move / Period Volatility)
```

Where N() is the standard normal cumulative distribution function.

**What it measures:** Your actual chance of making money, not just finishing ITM. An ATM call with a $3 premium needs the stock to rise past strike + $3 to profit, not just past the strike.

### 4. Liquidity (15% weight)

How easily you can enter and exit the position without slippage.

```
Volume < 10 AND Open Interest < 50  → Rejected (untradeable)

Volume penalties:
  < 50:   × 0.30
  < 100:  × 0.50
  < 500:  × 0.75
  < 1000: × 0.90
  1000+:  no penalty

Open Interest penalties:
  < 100:  × 0.40
  < 500:  × 0.70
  < 1000: × 0.85
  1000+:  no penalty

Penalties multiply together.
```

**What it measures:** Whether you can actually trade this option at a fair price. Low-volume options have wide spreads and you may not find a buyer when you need to exit.

### 5. Spread Efficiency (10% weight)

The cost of crossing the bid-ask spread relative to the premium.

```
Spread Ratio = (Ask - Bid) / Mid Price
Spread Score = max(0, 1 - Spread Ratio)

If market is closed (no bid/ask): neutral score of 0.5
```

**What it measures:** Hidden transaction costs. A $2.00 option with a $0.50 spread costs you 25% just to enter and exit. Tighter spreads mean more of your money goes to the actual trade.

---

## DTE Safety Multiplier

Applied after the composite score to penalize short-dated options where theta decay accelerates exponentially.

```
< 14 DTE:  score × 0.30  (danger zone)
< 21 DTE:  score × 0.60  (high risk)
< 30 DTE:  score × 0.85  (caution)
  30+ DTE: no penalty
```

This is not a scoring component — it's a safety brake. A perfectly scored option at 7 DTE gets cut to 30% of its score because the math says theta will likely eat your premium before the stock moves enough.

---

## Hard Filters (Instant Rejection)

Options are rejected before scoring if any of these are true:

| Condition | Reason |
|-----------|--------|
| Premium < $0.05 | Too cheap to trade meaningfully |
| Cost > Budget | Can't afford it |
| Volume < 10 AND OI < 50 | Untradeable — no market |

---

## Final Score

```
Raw Score = (EV × 0.30 + R:R × 0.25 + POP × 0.20 + Liquidity × 0.15 + Spread × 0.10) × 100
Final Score = Raw Score × DTE Multiplier
Clamped to 0-100
```

---

## Position Sizing: Kelly Criterion

When viewing a specific play's detail, DeepITM shows a Half-Kelly position size recommendation.

```
Full Kelly = P(win) - (1 - P(win)) / Win-Loss Ratio
Half Kelly = Full Kelly × 0.50

Where:
  P(win) = |Delta|
  Win = Profit at 10% favorable move
  Loss = Premium (max loss)
```

Half-Kelly is used because full Kelly is too aggressive for retail accounts. Half-Kelly captures ~75% of optimal growth with ~50% less drawdown.

---

## What the Model Favors

- **ATM to slightly ITM options** — higher delta, higher POP
- **30-60 DTE** — enough time for the thesis to play out without theta destroying value
- **Liquid contracts** — volume > 100, open interest > 500
- **Tight spreads** — less than 10% of premium
- **Positive expected value** — the math says this trade makes money over many repetitions

## What the Model Penalizes

- **Far OTM options** — low delta, low POP, negative EV (lottery tickets)
- **Short-dated options** — < 21 DTE gets heavily penalized
- **Illiquid options** — can't exit when you need to
- **Wide spreads** — hidden cost that eats your profit
- **Expensive options relative to budget** — poor capital efficiency

## Limitations

- **IV Percentile not tracked** — the model doesn't know if current IV is high or low relative to history. High IV means expensive premiums, which hurts long option buyers.
- **No earnings awareness** — doesn't know if an earnings report is coming, which causes IV crush.
- **Delta as probability** — uses risk-neutral probability (from Black-Scholes), not real-world probability. Close enough for ranking, but not exact.
- **Static target** — uses a fixed 10% move for EV and R:R calculations. Doesn't adapt to the stock's actual expected move.
- **Weekend/after-hours data** — bid/ask goes to $0 when the market is closed. Scores are less reliable outside market hours.
