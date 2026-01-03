# IronLedger - Quick Start Guide

## Daily Workflow (5 Simple Steps)

### Step 1: Pre-Market Setup (Before Session Starts)
1. Open the app
2. Select your session (London or New York)
3. Set your bias:
   - **Bullish** = Looking for longs only
   - **Bearish** = Looking for shorts only
   - **Neutral** = Not trading today
4. Enter your initial balance (optional)
5. **Select symbol** (e.g., BTCUSDT) - data auto-fetches
6. Click **"LOCK SETUP"**

**That's it. Setup locked. Can't change it.**

---

### Step 2: Watch the Market
- Go to your exchange (Binance, Bybit, etc.)
- Watch the 5-minute chart
- Look for:
  - Price sweeps above/below recent highs/lows
  - Price comes back inside
  - Volume spike shows up

**When you see this happen, go to Step 3.**

---

### Step 3: Check If You Can Trade
Before doing anything, check **Trade Status** screen:

- ✅ Green = You can trade
- 🔴 Red = Blocked (cooldown, limit reached, or outside hours)

**If blocked, you cannot trade. Period.**

---

### Step 4: Confirm Trade Setup
1. Go to **Trade Confirmation** screen
2. **Structure Section**: Check all 8 boxes (only if true!)
   - If you can't check them all honestly, don't trade
3. **Delta Section**: Look at the order book deltas
   - Enter the numbers you see
   - System checks if valid (<30% retrace)
4. **Risk Calculator**:
   - Enter account size
   - Enter your entry price
   - Enter the sweep low/high (your stop)
   - Click **Calculate Position**
5. **Final Section**:
   - Confirm target levels
   - Rate your emotional state (1-5)
   - Rate setup quality (A/B/C)
6. Click **"CONFIRM TRADE"**

**Trade is now logged. 2-hour cooldown starts.**

---

### Step 5: After Trade Exit
1. Go to **Post-Trade Log** screen
2. Select the trade from dropdown
3. Enter:
   - Outcome (Win/Loss/Breakeven)
   - P&L amount
   - Rate your execution (1-5)
   - Write what happened
4. Click **"SUBMIT LOG"**

**Trade complete. Data saved.**

---

## Simple Rules You Must Follow

| Rule | What It Means |
|------|---------------|
| **Max 2 trades/day** | After 2 trades, you're done for the day |
| **2-hour cooldown** | After confirming a trade, wait 2 hours before next one |
| **Only trade during session** | London: 08:00-12:00 UTC, NY: 13:00-17:00 UTC |
| **Bias must match direction** | If bias = Bullish, only long. If Bearish, only short |
| **If bias = Neutral** | You cannot trade at all |
| **Max 2% stop distance** | If stop is >2% from entry, trade blocked |
| **Max 10x leverage** | System calculates this, will block if >10x |

---

## What Each Screen Does

### 1. Pre-Market Setup
**When**: Before session starts
**Purpose**: Lock your bias and levels
**Can I change it?**: No, locked for the day

### 2. Trade Status
**When**: Anytime during session
**Purpose**: Shows if you're allowed to trade right now
**What to look for**: Green = go, Red = stop

### 3. Trade Confirmation
**When**: When you have a setup
**Purpose**: Final validation before you execute on exchange
**What it does**: Checks all rules, calculates position size, starts cooldown

### 4. Post-Trade Log
**When**: After you exit the trade on exchange
**Purpose**: Record what happened
**What it does**: Saves outcome and P&L for review

### 5. Review Dashboard
**When**: End of day/week
**Purpose**: See your stats
**What to look for**: Win rate, P&L, rule compliance

---

## Symbol Selection Tips

**Popular Futures Symbols**:
- BTCUSDT (Bitcoin)
- ETHUSDT (Ethereum)
- SOLUSDT (Solana)
- BNBUSDT (Binance Coin)
- AVAXUSDT (Avalanche)

**Symbol must**:
- Be exact (case-sensitive)
- Exist on Binance Futures
- End with "USDT"

---

## Common Questions

**Q: How do I know if it's a good setup?**
A: If you can check all 8 structure boxes honestly, it's valid. Quality (A/B/C) is your judgment.

**Q: What if I want to take a 3rd trade today?**
A: You can't. System blocks it. Rule is 2 max.

**Q: Can I change my bias mid-session?**
A: No. Locked until tomorrow.

**Q: What if I'm in cooldown but see a perfect setup?**
A: You must wait. That's the point - cooldowns prevent overtrading.

**Q: Do I enter trades in this app?**
A: No. You execute on your exchange. This app just validates and logs.

**Q: What if the auto-fetch fails?**
A: Use manual input fields. All fields work independently.

---

## That's It

**The app is simple**:
1. Lock setup
2. Wait for structure
3. Confirm trade (if allowed)
4. Execute on exchange
5. Log outcome

**The app's job**: Block you from breaking rules
**Your job**: Follow the structure checklist honestly

No shortcuts. No exceptions. That's discipline.
