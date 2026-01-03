# ⚖️ IronLedger

**Trading Discipline Enforcement System**

---

## 📋 Overview

IronLedger is a **frontend-only** trading discipline console designed for experienced intraday crypto futures traders. It does **NOT**:
- Generate trading signals
- Connect to exchanges
- Automate trade execution

Instead, IronLedger acts as a **strict risk manager and judge**, enforcing professional trading rules and blocking violations before they happen.

---

## 🎯 Purpose

The system is built to solve one critical problem: **impulsive trading and rule violations**.

By requiring explicit confirmation of structure, delta, and risk parameters—and by mechanically enforcing session, limit, and cooldown rules—IronLedger transforms discretionary chaos into systematic discipline.

---

## 🛠️ Technology Stack

- **Vanilla JavaScript (ES6+)** - No frameworks
- **HTML5** - Semantic structure
- **TailwindCSS** - Utility-first styling (CDN)
- **LocalStorage** - Client-side persistence

**No backend. No APIs. No dependencies.**

---

## ⚡ Quick Start

1. Open `index.html` in a modern web browser
2. Complete **Pre-Market Setup** (required before trading)
3. Monitor **Trade Status** during the session
4. Use **Trade Confirmation** to validate setups
5. Log trades in **Post-Trade Log** after exit
6. Review performance in **Review Dashboard**

---

## 📐 Core Trading Rules (ENFORCED)

### Session Rules
- **London**: 08:00–12:00 UTC
- **New York**: 13:00–17:00 UTC
- **Only ONE session allowed per day**
- Trading outside session hours is **blocked**

### Trade Limits
- **Max 2 trades per day**
- **Max 8 trades per week**
- **2-hour cooldown** between trades (strictly enforced)

### Bias Rules
- Must be set in **Pre-Market Setup**
- Options: **Bullish**, **Bearish**, or **Neutral**
- If bias = **Neutral**, all trading is **disabled**
- Bias **cannot be changed** once locked

### Risk Rules
- **Max leverage**: 10x
- **Max stop distance**: 2% (hard block)
- **Risk per trade**: Configurable (default 1%)
- All risk parameters validated before trade confirmation

### Structure Requirements
All of the following must be confirmed via checkbox:
- ✅ 15M bias aligns with trade direction
- ✅ Liquidity sweep occurred
- ✅ Sweep depth between 0.2% and 1%
- ✅ Price closed back inside range
- ✅ Volume spike visible
- ✅ 5M break of structure ≥0.3%
- ✅ Imbalance (FVG) created
- ✅ Entry is first pullback only

### Delta Requirements
- BOS candle delta must be recorded
- Pullback delta retrace must be <30% (hard block)
- Delta divergence must be confirmed
- No aggressive opposing delta

---

## 📱 Application Screens

### 1. Pre-Market Setup
**Purpose**: Lock bias and structure before trading

**Required Inputs**:
- Session selection (London or New York)
- 15M Bias (Bullish/Bearish/Neutral)
- Key levels (yesterday high/low/close, Asian session, weekly levels)
- Liquidity pools (equal highs/lows, psychological levels)
- Market context (funding rate, open interest, volume)

**Enforcement**:
- Once confirmed, setup is **locked for the day**
- Cannot be changed or edited
- Resets automatically at midnight UTC

### 2. Trade Eligibility Status
**Purpose**: Real-time monitoring of trading permissions

**Displays**:
- Current UTC time
- Session status (allowed/blocked)
- Trades taken today and this week
- Cooldown timer
- Active bias
- Lock or suspension status

**Lock Conditions**:
- No setup completed
- Bias is Neutral
- Outside trading hours
- Daily limit reached (2 trades)
- Weekly limit reached (8 trades)
- Cooldown active
- Account suspended

### 3. Trade Confirmation Checklist
**Purpose**: Validate setup before execution

**Four Validation Sections**:

**A. Structure Confirmation**
- 8 required checkboxes
- All must be checked to proceed

**B. Delta Confirmation**
- Manual delta inputs
- 4 required confirmations
- Pullback retrace auto-validated (<30%)

**C. Risk & Position Calculator**
- Input: Account size, risk %, direction, entry, sweep levels
- Output: Stop loss, stop distance, position size, leverage
- **Hard blocks**: Stop >2%, leverage >10x

**D. Execution Confirmation**
- TP1 at 1.5R
- TP2 at opposing structure
- Emotional state rating
- Setup quality (A/B/C)
- Mechanical stop confirmation

**On Confirmation**:
- Trade is logged with full details
- Trade count increments immediately
- 2-hour cooldown timer starts
- Trade becomes active

### 4. Post-Trade Log
**Purpose**: Mandatory post-trade review

**Required After Trade Exit**:
- Outcome (Win/Loss/Breakeven)
- P&L in dollars
- Execution ratings (entry, stop, exit) 1-5
- Screenshot upload (optional)
- Emotional notes and observations

**Enforcement**:
- Trade is not considered "complete" until logged
- Incomplete trades remain in active list

### 5. Review Dashboard
**Purpose**: Performance analysis and pattern recognition

**Daily Metrics**:
- Trades taken
- Rule compliance %
- P&L today
- Active locks

**Weekly Metrics**:
- Win rate
- Average win/loss
- Expectancy
- Risk/reward ratio
- Session performance (London vs NY)
- Most violated rule

**Trade Log Table**:
- Last 10 completed trades
- Sortable by date, session, outcome

---

## 🔒 Enforcement Mechanisms

### Hard Blocks
These conditions **prevent** trade confirmation entirely:
- No pre-market setup
- Bias = Neutral
- Outside session hours
- Daily limit reached
- Weekly limit reached
- Cooldown active
- Stop distance >2%
- Leverage >10x
- Pullback retrace ≥30%
- Required checkboxes unchecked

### Cooldown System
- **Triggered**: Immediately after trade confirmation
- **Duration**: 2 hours
- **Effect**: All trade confirmations blocked
- **Display**: Countdown timer in minutes

### Suspension System
- **Triggered**: (Future implementation for repeated violations)
- **Duration**: Variable
- **Effect**: All trading blocked

---

## 💾 Data Persistence

All data is stored in **browser LocalStorage**:

```javascript
{
  sessions: {
    "2025-01-15": {
      date: "2025-01-15",
      session: "london",
      bias: "bullish",
      levels: {...},
      liquidity: {...},
      context: {...},
      lockedAt: 1705315200000
    }
  },
  trades: [
    {
      id: "trade_1705315200000",
      timestamp: 1705315200000,
      date: "2025-01-15",
      session: "london",
      bias: "bullish",
      structure: {...},
      delta: {...},
      entry: 42000,
      stopLoss: 41800,
      direction: "long",
      status: "confirmed",
      completed: true,
      outcome: "win",
      pnl: 150.00
    }
  ],
  limits: {
    tradesToday: 1,
    tradesWeek: 3,
    cooldownUntil: 1705322400000,
    suspensionUntil: null
  }
}
```

### Data Retention
- **Automatic cleanup**: Data older than 30 days is automatically removed
- **Manual reset**: Clear browser LocalStorage to reset completely

---

## 🧪 Testing Scenarios

### Test 1: Pre-Market Setup Lock
1. Open application
2. Fill out setup form with bias = "Bullish"
3. Click "LOCK SETUP"
4. ✅ Form should disappear
5. ✅ "Setup Locked for Today" message appears
6. ✅ Cannot change bias or session

### Test 2: Trade Limit Enforcement
1. Confirm 2 trades in one day
2. Try to access Trade Confirmation screen
3. ✅ Should display "Daily limit reached" lock alert
4. ✅ Confirm button should be disabled

### Test 3: Cooldown Timer
1. Confirm a trade
2. Check Trade Status screen
3. ✅ Cooldown timer shows "120m" or similar
4. ✅ Try to confirm another trade immediately
5. ✅ Should be blocked with "Cooldown active" message

### Test 4: Risk Calculator Hard Blocks
1. Navigate to Trade Confirmation
2. Fill risk calculator with:
   - Entry: 42000
   - Sweep Low: 41000 (>2% stop distance)
3. Click "Calculate Position"
4. ✅ Should display "BLOCKED: Stop distance exceeds max 2%"
5. ✅ Trade confirmation should remain disabled

### Test 5: Neutral Bias Block
1. Set bias to "Neutral" in Pre-Market Setup
2. Lock setup
3. Navigate to Trade Confirmation
4. ✅ Should display "Bias is Neutral - trading disabled"
5. ✅ All trade actions blocked

---

## 🎨 UI/UX Features

### Color Coding
- **Green**: Allowed, active, winning
- **Red**: Blocked, violations, losing
- **Yellow**: Warning, pending, neutral
- **Blue**: Information, headers, navigation
- **Gray**: Inactive, disabled, background

### Visual Feedback
- **Pulsing red alert**: Active trading locks
- **Disabled buttons**: Grayed out when rules violated
- **Real-time updates**: Status updates every second
- **Countdown timers**: Clear visibility of cooldown periods

### Responsive Design
- Mobile-friendly grid layouts
- Collapsible sections
- Horizontal scroll for tables
- Touch-friendly buttons

---

## 🚀 Deployment

### Local Development
Simply open `index.html` in a browser. No build step required.

### Production Hosting
Host on any static file server:
- GitHub Pages
- Netlify
- Vercel
- AWS S3 + CloudFront
- Any web server

**No backend required.**

---

## 📡 Market Context Fetch (Optional Feature)

### Overview
IronLedger includes an **optional** market context fetch feature that retrieves live data from Binance Futures API. This feature is:
- **Informational only** - does NOT affect trade enforcement
- **Completely optional** - manual input always available
- **Non-blocking** - fetch failures do not prevent trading

### CORS Issue & Solution

**Problem**: Binance API does not enable CORS (Cross-Origin Resource Sharing) for direct browser requests. This is a browser security restriction.

**Why it works in Insomnia/Postman**: API testing tools don't enforce CORS policies that browsers do.

**Solution Implemented**: The app uses a **CORS proxy** by default:
```javascript
// In app.js line 972
const useCorsProxy = true;
const corsProxy = 'https://api.allorigins.win/raw?url=';
```

### CORS Proxy Options

**Current (Default): AllOrigins**
- URL: `https://api.allorigins.win/raw?url=`
- Free, open-source, rate-limited
- Works immediately in browser
- Best for: Development, testing, personal use

**Alternative Proxies**:
1. **corsproxy.io**: `https://corsproxy.io/?`
2. **cors-anywhere**: Self-hosted option
3. **Cloudflare Workers**: Custom serverless proxy (recommended for production)

### Production Deployment Options

For production use, consider these approaches:

**Option 1: Vercel Serverless Function (RECOMMENDED - Already Included!)**

The project includes a Vercel serverless function at `/api/binance-proxy.js`.

**Automatic Setup:**
1. Deploy to Vercel (it will auto-detect the `/api` folder)
2. The app automatically tries the serverless function first
3. Falls back to public proxies if function unavailable

**Manual Test:**
```bash
# After deploying to Vercel, test the endpoint:
curl "https://your-app.vercel.app/api/binance-proxy?endpoint=/fapi/v1/premiumIndex?symbol=BTCUSDT"
```

**Benefits:**
- ✅ Fast (same region as your app)
- ✅ Reliable (100% uptime)
- ✅ No rate limits (your Vercel account limits)
- ✅ No external dependencies
- ✅ Free tier: 100GB bandwidth, 100k requests/month

**Files Included:**
- `/api/binance-proxy.js` - Serverless function
- `/vercel.json` - Vercel configuration with CORS headers

**Option 2: Netlify Functions**
Similar to Vercel, rename `/api` to `/netlify/functions`:
```bash
mv api netlify/functions
```

**Option 3: Cloudflare Workers**
```javascript
// Example Cloudflare Worker
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const endpoint = url.searchParams.get('endpoint');
    const binanceUrl = `https://fapi.binance.com${endpoint}`;
    const response = await fetch(binanceUrl);
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
  }
}
```

**Option 4: Disable Fetch (Manual Only)**
Simply don't use the fetch button. Manual input fields work independently.

### Configuration

The app uses a **smart multi-proxy fallback system** (app.js lines 967-1040):

**Fetch Strategy (Automatic):**
1. ✅ Try local serverless function (`/api/binance-proxy`)
2. ⚠️ Fallback to `corsproxy.io` if (1) fails
3. ⚠️ Fallback to `allorigins.win` if (2) fails
4. ⚠️ Fallback to `codetabs.com` if (3) fails
5. ❌ Show error if all fail

**To customize proxy order:**
```javascript
// In app.js line 999, edit the corsProxies array:
const corsProxies = [
    'https://corsproxy.io/?',                    // Your preferred proxy
    'https://your-custom-proxy.com/?url=',       // Add custom proxies
    'https://api.allorigins.win/raw?url='
];
```

**To disable fallback proxies (serverless only):**
```javascript
// In app.js line 999, set empty array:
const corsProxies = [];
// This will only use serverless function, no fallback
```

### Rate Limits

**Vercel Serverless Function (Recommended):**
- Free tier: 100GB bandwidth, 100k serverless invocations/month
- No shared rate limits
- Binance API limit: 1200 requests/minute per IP

**Fallback Public Proxies:**
- **corsproxy.io**: ~60 requests/minute (shared)
- **AllOrigins**: ~10 requests/second (shared)
- **CodeTabs**: ~10 requests/minute (shared)

**App Usage:**
- Manual fetch only (click-triggered)
- No auto-polling or background refresh
- Typical usage: 1-3 fetches per trading day

### Troubleshooting

**Error: "Data unavailable" / "All proxies failed"**

The app tries multiple proxies automatically. Check browser console to see which failed:

1. **Open DevTools** (F12) → Console tab
2. **Look for logs:**
   ```
   🔄 Trying local serverless function...
   ❌ Serverless function not available
   🔄 Trying CORS proxy 1/3: https://corsproxy.io...
   ❌ CORS proxy 1 failed: [error]
   ```

3. **Solutions:**
   - **If deployed on Vercel:** Verify `/api/binance-proxy.js` exists and redeploy
   - **If all proxies fail:** Check internet connection, try again in 1 minute (rate limits)
   - **Always works:** Use manual input fields (no fetch required)

**Slow Response (5+ seconds)**
- **Using public proxies:** Normal latency is 1-3 seconds
- **Using serverless:** Should be <1 second
- **Check console:** See which proxy succeeded
- **Solution:** Deploy serverless function for faster response

**Specific Symbol Fails**
- **Check symbol spelling:** Must be exact (e.g., `BTCUSDT` not `BTC-USDT`)
- **Verify on Binance:** Symbol must exist on Binance Futures
- **Try BTCUSDT:** Most reliable test symbol

**CORS Errors in Console**
- **Expected if using public proxies:** Some will fail, app tries next one
- **Not expected if using serverless:** Check Vercel deployment logs
- **Verify:** `vercel.json` is included in repository

---

## 🔐 Security Notes

- All data stored locally in browser
- Optional external API calls (Binance Futures via CORS proxy)
  - Only fetches public market data
  - No authentication required
  - No trading credentials involved
- No user authentication (single-user application)
- No sensitive data transmission
- Screenshots stored as base64 in LocalStorage (consider size limits)

---

## 📊 Future Enhancements (Optional)

- CSV export of trade data
- Advanced analytics (Sharpe ratio, drawdown, etc.)
- Multi-timeframe bias tracking
- Screenshot cloud storage integration
- Mobile app (React Native or PWA)
- Multi-user support with backend
- Violation penalty system
- Advanced pattern recognition

---

## 🛡️ Philosophy

IronLedger is built on a simple premise:

**Trading rules are non-negotiable. If they can be bent, they will be broken.**

By removing discretion and enforcing mechanical compliance, IronLedger transforms trading from an emotional battle into a systematic process.

The system doesn't judge the quality of your strategy—it only ensures you follow it.

---

## 📝 License

This is a custom-built discipline system. Use at your own discretion.

**Disclaimer**: This software does not provide financial advice. All trading decisions are the user's responsibility. Past performance does not guarantee future results.

---

## 🤝 Support

For issues or questions:
1. Check browser console for errors
2. Verify LocalStorage is enabled
3. Test in incognito mode (clean state)
4. Clear LocalStorage if needed: `localStorage.clear()`

---

**Built with discipline. Enforced with code.** ⚖️
