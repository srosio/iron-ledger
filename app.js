/**
 * IronLedger - Trading Discipline Enforcement System
 *
 * This system enforces strict trading rules for intraday crypto futures trading.
 * It does NOT generate signals, connect to exchanges, or automate execution.
 * Its sole purpose is to enforce discipline and log trades.
 */

const IronLedger = {
    // Application state
    state: {
        sessions: {},
        trades: [],
        limits: {
            tradesToday: 0,
            tradesWeek: 0,
            cooldownUntil: null,
            suspensionUntil: null
        },
        config: {
            maxTradesPerDay: 2,
            maxTradesPerWeek: 8,
            minTimeBetweenTrades: 2 * 60 * 60 * 1000, // 2 hours in ms
            maxLeverage: 10,
            defaultRiskPercent: 1,
            maxStopDistance: 2.0, // 2%
            initialBalance: 10000 // Default initial balance - configurable by user
        },
        currentScreen: 'setup',
        riskCalculated: false,
        activeTradeId: null,
        // Market context snapshot (fetched from Binance)
        // This data is INFORMATIONAL ONLY and does NOT affect trade enforcement
        marketContext: null,
        // OI history for tracking actual OI changes (per symbol)
        oiHistory: {},
        // Saved symbols for quick access in dropdown
        savedSymbols: [],
        // Hot coins cache (refreshed every 30 minutes)
        hotCoins: [],
        hotCoinsTimestamp: null
    },

    /**
     * Initialize the application
     */
    init() {
        console.log('🚀 IronLedger initializing...');
        this.loadState();
        this.populateSavedSymbols();
        this.setupEventListeners();
        this.startTimers();
        this.showScreen('trading');
        this.updateStatusBar();
        this.updateSessionTime(); // Show time immediately
        this.fetchHotCoins(); // Auto-load hot coins on startup
        console.log('✅ IronLedger ready');
    },

    /**
     * Load state from LocalStorage
     */
    loadState() {
        const saved = localStorage.getItem('ironledger_state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.state.sessions = parsed.sessions || {};
                this.state.trades = parsed.trades || [];
                this.state.limits = parsed.limits || this.state.limits;
                this.state.marketContext = parsed.marketContext || null;
                this.state.selectedSession = parsed.selectedSession || null;
                this.state.oiHistory = parsed.oiHistory || {};
                this.state.savedSymbols = parsed.savedSymbols || [];
                this.state.hotCoins = parsed.hotCoins || [];
                this.state.hotCoinsTimestamp = parsed.hotCoinsTimestamp || null;
                console.log('📂 State loaded from LocalStorage');
            } catch (e) {
                console.error('❌ Failed to load state:', e);
            }
        }
        this.cleanupOldData();
    },

    /**
     * Save state to LocalStorage
     */
    saveState() {
        const toSave = {
            sessions: this.state.sessions,
            trades: this.state.trades,
            limits: this.state.limits,
            marketContext: this.state.marketContext,
            selectedSession: this.state.selectedSession,
            oiHistory: this.state.oiHistory,
            savedSymbols: this.state.savedSymbols,
            hotCoins: this.state.hotCoins,
            hotCoinsTimestamp: this.state.hotCoinsTimestamp
        };
        localStorage.setItem('ironledger_state', JSON.stringify(toSave));
        console.log('💾 State saved');
    },

    /**
     * Populate saved symbols in datalist for autocomplete
     */
    populateSavedSymbols() {
        const datalist = document.getElementById('symbolSuggestions');

        // Get existing popular symbols (don't remove them)
        const popularSymbols = [
            'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
            'ADAUSDT', 'DOGEUSDT', 'MATICUSDT', 'DOTUSDT', 'AVAXUSDT',
            'LINKUSDT', 'UNIUSDT'
        ];

        // Clear existing options
        datalist.innerHTML = '';

        // Add popular symbols first
        popularSymbols.forEach(symbol => {
            const option = document.createElement('option');
            option.value = symbol;
            datalist.appendChild(option);
        });

        // Add user's saved symbols (avoid duplicates with popular)
        this.state.savedSymbols.forEach(symbol => {
            if (!popularSymbols.includes(symbol)) {
                const option = document.createElement('option');
                option.value = symbol;
                datalist.appendChild(option);
            }
        });

        console.log('📋 Symbol suggestions populated:',
            popularSymbols.length + this.state.savedSymbols.filter(s => !popularSymbols.includes(s)).length);
    },

    /**
     * Save symbol to saved list (called after successful fetch)
     */
    saveSymbol(symbol) {
        if (!symbol) return;

        // Add to saved symbols if not already there
        if (!this.state.savedSymbols.includes(symbol)) {
            this.state.savedSymbols.push(symbol);
            this.saveState();
            this.populateSavedSymbols();
            console.log('💾 Symbol saved:', symbol);
        }
    },

    /**
     * Fetch hot coins from Binance (top volume pairs)
     * Shows 1h and 24h price changes to identify current momentum
     * Caches results for 30 minutes to avoid excessive API calls
     */
    async fetchHotCoins() {
        const display = document.getElementById('hotCoinsDisplay');

        // Check cache - refresh if older than 30 minutes
        const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
        const now = Date.now();

        if (this.state.hotCoins.length > 0 &&
            this.state.hotCoinsTimestamp &&
            (now - this.state.hotCoinsTimestamp) < CACHE_DURATION) {
            // Use cached data
            console.log('🔥 Using cached hot coins');
            this.displayHotCoins(this.state.hotCoins);
            return;
        }

        // Fetch fresh data
        display.innerHTML = '<p class="text-xs text-gray-500">Loading hot coins...</p>';

        try {
            // Fetch all 24hr ticker data (FUTURES only - /fapi/)
            const tickers = await this.fetchBinance('/fapi/v1/ticker/24hr');

            // Filter for USDT perpetual futures pairs only (exclude BUSD, spot, quarterly futures)
            // Sort by quote volume (volume in USDT) descending
            const topPairs = tickers
                .filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('_'))
                .map(t => ({
                    symbol: t.symbol,
                    volume: parseFloat(t.quoteVolume),
                    priceChange24h: parseFloat(t.priceChangePercent),
                    lastPrice: parseFloat(t.lastPrice)
                }))
                .sort((a, b) => b.volume - a.volume)
                .slice(0, 15); // Top 15 by volume

            // Fetch 1h price change for each coin (to see recent momentum)
            // This helps identify coins moving RIGHT NOW vs just 24h volume
            console.log('🔥 Fetching 1h price changes for top 15 coins...');

            const coinsWithHourlyChange = await Promise.all(
                topPairs.map(async (coin) => {
                    try {
                        // Fetch last 2 candles of 1h timeframe
                        const klines = await this.fetchBinance(
                            `/fapi/v1/klines?symbol=${coin.symbol}&interval=1h&limit=2`
                        );

                        if (klines && klines.length >= 2) {
                            // kline format: [openTime, open, high, low, close, volume, ...]
                            const previousClose = parseFloat(klines[0][4]);
                            const currentClose = parseFloat(klines[1][4]);
                            const priceChange1h = ((currentClose - previousClose) / previousClose) * 100;

                            return {
                                ...coin,
                                priceChange1h: priceChange1h
                            };
                        } else {
                            // Fallback if kline data unavailable
                            return {
                                ...coin,
                                priceChange1h: 0
                            };
                        }
                    } catch (error) {
                        console.warn(`⚠️ Failed to fetch 1h data for ${coin.symbol}:`, error);
                        return {
                            ...coin,
                            priceChange1h: 0
                        };
                    }
                })
            );

            // Cache the results
            this.state.hotCoins = coinsWithHourlyChange;
            this.state.hotCoinsTimestamp = now;
            this.saveState();

            // Display
            this.displayHotCoins(coinsWithHourlyChange);

            console.log('🔥 Hot coins fetched:', coinsWithHourlyChange.length);

        } catch (error) {
            console.error('❌ Hot coins fetch failed:', error);
            display.innerHTML = '<p class="text-xs text-red-400">Failed to load hot coins</p>';
        }
    },

    /**
     * Display hot coins as clickable buttons
     * Shows 1h change (primary) and 24h change (secondary)
     */
    displayHotCoins(coins) {
        const display = document.getElementById('hotCoinsDisplay');

        if (!coins || coins.length === 0) {
            display.innerHTML = '<p class="text-xs text-gray-500">No hot coins available</p>';
            return;
        }

        // Check if cache has old format (missing priceChange1h/priceChange24h)
        // If so, invalidate cache and trigger fresh fetch
        if (coins.length > 0 && (coins[0].priceChange1h === undefined || coins[0].priceChange24h === undefined)) {
            console.log('⚠️ Old cache format detected - refreshing hot coins...');
            this.state.hotCoins = [];
            this.state.hotCoinsTimestamp = null;
            this.saveState();
            this.fetchHotCoins();
            return;
        }

        // Create button for each hot coin
        display.innerHTML = coins.map(coin => {
            // Defensive: Use fallback values if properties missing
            const change1h = coin.priceChange1h ?? 0;
            const change24h = coin.priceChange24h ?? 0;

            // 1h change styling (primary indicator)
            const change1hClass = change1h >= 0 ? 'text-green-400' : 'text-red-400';
            const change1hIcon = change1h >= 0 ? '📈' : '📉';

            // 24h change styling (secondary context)
            const change24hClass = change24h >= 0 ? 'text-green-300' : 'text-red-300';

            return `
                <button type="button"
                        onclick="IronLedger.selectHotCoin('${coin.symbol}')"
                        class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded transition text-left">
                    <div class="text-sm font-bold text-white">${coin.symbol.replace('USDT', '')}</div>
                    <div class="text-xs ${change1hClass} font-semibold">
                        1h: ${change1h >= 0 ? '+' : ''}${change1h.toFixed(2)}% ${change1hIcon}
                    </div>
                    <div class="text-xs ${change24hClass} opacity-75">
                        24h: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(1)}%
                    </div>
                </button>
            `;
        }).join('');
    },

    /**
     * Select a hot coin and auto-fetch its data
     */
    selectHotCoin(symbol) {
        // Set the symbol in input field
        document.getElementById('marketSymbol').value = symbol;

        // Auto-fetch market data
        this.fetchMarketData();

        console.log('🔥 Hot coin selected:', symbol);
    },

    /**
     * Clean up old data (older than 30 days)
     */
    cleanupOldData() {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

        // Clean old sessions
        for (const date in this.state.sessions) {
            if (new Date(date).getTime() < thirtyDaysAgo) {
                delete this.state.sessions[date];
            }
        }

        // Clean old trades
        this.state.trades = this.state.trades.filter(t =>
            new Date(t.timestamp).getTime() >= thirtyDaysAgo
        );

        this.saveState();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Confirm form
        document.getElementById('confirmForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.confirmTrade();
        });

        // Log form
        document.getElementById('logForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.completeTrade();
        });

        // Log trade selector
        document.getElementById('logTradeSelect').addEventListener('change', (e) => {
            this.state.activeTradeId = e.target.value;
            this.updateLogForm();
        });
    },

    /**
     * Start background timers
     */
    startTimers() {
        // Auto-select session based on current UTC time if none selected
        if (!this.state.selectedSession) {
            const currentSession = this.getCurrentSession();
            if (currentSession) {
                this.selectSession(currentSession);
                console.log(`📍 Auto-selected ${currentSession} session based on current time`);
            }
        }

        // Update time and status every second
        setInterval(() => {
            this.updateStatusBar();
            this.updateSessionTime();
            // Update trading screen if it's the current screen
            if (this.state.currentScreen === 'trading') {
                this.updateTradingScreen();
            }
        }, 1000);
    },

    /**
     * Get current session based on UTC time
     * Returns: 'asian', 'london', 'newyork', or null if outside trading hours
     */
    getCurrentSession() {
        const now = new Date();
        const utcHours = now.getUTCHours();

        // Asian: 00:00-08:00 UTC
        if (utcHours >= 0 && utcHours < 8) {
            return 'asian';
        }
        // London: 08:00-16:00 UTC
        // New York: 13:00-21:00 UTC
        // Overlap: 13:00-16:00 UTC
        else if (utcHours >= 8 && utcHours < 13) {
            // London only
            return 'london';
        }
        else if (utcHours >= 13 && utcHours < 16) {
            // Overlap - prefer New York as it's more volatile
            return 'newyork';
        }
        else if (utcHours >= 16 && utcHours < 21) {
            // New York only
            return 'newyork';
        }
        // Outside trading hours: 21:00-00:00 UTC
        else {
            return null;
        }
    },

    /**
     * Update session time display
     */
    updateSessionTime() {
        const now = new Date();

        // Update local time
        const localTime = now.toLocaleTimeString();
        const localTimeEl = document.getElementById('currentLocalTime');
        if (localTimeEl) {
            localTimeEl.textContent = localTime;
        }

        // Update UTC time
        const utcTime = now.toISOString().substr(11, 8);
        const utcTimeEl = document.getElementById('currentUtcTime');
        if (utcTimeEl) {
            utcTimeEl.textContent = utcTime + ' UTC';
        }
    },

    /**
     * Update status bar (header)
     */
    updateStatusBar() {
        const now = new Date();

        // UTC time
        const utcTime = now.toISOString().substr(11, 8) + ' UTC';
        document.getElementById('currentTime').textContent = utcTime;

        // Local time
        const localTime = now.toLocaleTimeString() + ' (Local)';
        document.getElementById('currentLocalTime').textContent = localTime;

        const sessionStatus = this.getSessionStatus();
        const statusEl = document.getElementById('sessionStatus');

        if (sessionStatus.allowed) {
            statusEl.textContent = `✅ ${sessionStatus.session} Session Active`;
            statusEl.className = 'text-xs font-semibold mt-1 text-green-400';
        } else {
            statusEl.textContent = '🚫 Outside Trading Hours';
            statusEl.className = 'text-xs font-semibold mt-1 text-red-400';
        }
    },

    /**
     * Get current session status
     */
    getSessionStatus() {
        const now = new Date();
        const utcHours = now.getUTCHours();
        const utcMinutes = now.getUTCMinutes();
        const totalMinutes = utcHours * 60 + utcMinutes;

        // London: 08:00-12:00 UTC (480-720 minutes)
        // New York: 13:00-17:00 UTC (780-1020 minutes)

        let allowed = false;
        let session = null;

        if (totalMinutes >= 480 && totalMinutes < 720) {
            allowed = true;
            session = 'London';
        } else if (totalMinutes >= 780 && totalMinutes < 1020) {
            allowed = true;
            session = 'New York';
        }

        return { allowed, session };
    },

    /**
     * Check if trading is allowed (comprehensive check)
     */
    canTrade() {
        const reasons = [];

        // 1. Check daily trade limit
        const tradesToday = this.getTradesCount('today');
        if (tradesToday >= this.state.config.maxTradesPerDay) {
            reasons.push(`Daily limit reached (${this.state.config.maxTradesPerDay} trades)`);
        }

        // 2. Check weekly trade limit
        const tradesWeek = this.getTradesCount('week');
        if (tradesWeek >= this.state.config.maxTradesPerWeek) {
            reasons.push(`Weekly limit reached (${this.state.config.maxTradesPerWeek} trades)`);
        }

        // 3. Check cooldown
        if (this.state.limits.cooldownUntil && Date.now() < this.state.limits.cooldownUntil) {
            const remaining = Math.ceil((this.state.limits.cooldownUntil - Date.now()) / 60000);
            reasons.push(`Cooldown active (${remaining} minutes remaining)`);
        }

        // 4. Check suspension
        if (this.state.limits.suspensionUntil && Date.now() < this.state.limits.suspensionUntil) {
            reasons.push('Account suspended due to violations');
        }

        return {
            allowed: reasons.length === 0,
            reasons
        };
    },

    /**
     * Get today's date as YYYY-MM-DD
     */
    getToday() {
        return new Date().toISOString().split('T')[0];
    },

    /**
     * Get trade count for period
     */
    getTradesCount(period) {
        const now = Date.now();

        if (period === 'today') {
            const today = this.getToday();
            return this.state.trades.filter(t =>
                t.date === today && t.status === 'confirmed'
            ).length;
        }

        if (period === 'week') {
            const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
            return this.state.trades.filter(t =>
                new Date(t.timestamp).getTime() >= weekAgo && t.status === 'confirmed'
            ).length;
        }

        return 0;
    },

    /**
     * Show specific screen
     */
    showScreen(screenName) {
        // Hide all screens
        document.querySelectorAll('.screen-section').forEach(el => {
            el.classList.add('hidden');
        });

        // Show target screen
        const targetScreen = document.getElementById(`screen-${screenName}`);
        if (targetScreen) {
            targetScreen.classList.remove('hidden');
            this.state.currentScreen = screenName;

            // Update tab styling
            document.querySelectorAll('.tab-btn').forEach(btn => {
                if (btn.dataset.screen === screenName) {
                    btn.classList.add('bg-blue-600');
                    btn.classList.remove('bg-gray-800');
                } else {
                    btn.classList.remove('bg-blue-600');
                    btn.classList.add('bg-gray-800');
                }
            });

            // Screen-specific updates
            if (screenName === 'trading') this.updateTradingScreen();
            if (screenName === 'log') this.updateLogScreen();
            if (screenName === 'review') this.updateReviewScreen();
        }
    },

    /**
     * ============================================
     * UNIFIED TRADING SCREEN
     * ============================================
     */

    selectSession(session) {
        this.state.selectedSession = session;
        this.saveState();

        // Update UI
        document.querySelectorAll('.session-btn').forEach(btn => {
            if (btn.dataset.session === session) {
                btn.classList.add('bg-blue-600');
                btn.classList.remove('bg-gray-700');
            } else {
                btn.classList.remove('bg-blue-600');
                btn.classList.add('bg-gray-700');
            }
        });

        const sessionNames = {
            'asian': '🌏 Asian (00:00-08:00 UTC)',
            'london': '🇬🇧 London (08:00-16:00 UTC)',
            'newyork': '🇺🇸 New York (13:00-21:00 UTC)'
        };

        document.getElementById('selectedSession').classList.remove('hidden');
        document.getElementById('selectedSessionName').textContent = sessionNames[session];
    },

    updateTradingScreen() {
        // Update blocker in confirm section based on trade eligibility
        const canTradeResult = this.canTrade();
        const blocker = document.getElementById('confirmBlocker');
        const blockerReason = document.getElementById('confirmBlockerReason');
        const confirmBtn = document.getElementById('confirmTradeBtn');

        if (!canTradeResult.allowed) {
            blocker.classList.remove('hidden');
            blockerReason.innerHTML = canTradeResult.reasons.map(r => `• ${r}`).join('<br>');
            confirmBtn.disabled = true;
            confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            blocker.classList.add('hidden');
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }

        // Restore selected session if exists
        if (this.state.selectedSession) {
            document.querySelectorAll('.session-btn').forEach(btn => {
                if (btn.dataset.session === this.state.selectedSession) {
                    btn.classList.add('bg-blue-600');
                    btn.classList.remove('bg-gray-700');
                }
            });

            const sessionNames = {
                'asian': '🌏 Asian (00:00-08:00 UTC)',
                'london': '🇬🇧 London (08:00-16:00 UTC)',
                'newyork': '🇺🇸 New York (13:00-21:00 UTC)'
            };

            document.getElementById('selectedSession').classList.remove('hidden');
            document.getElementById('selectedSessionName').textContent = sessionNames[this.state.selectedSession];
        }
    },

    /**
     * ============================================
     * TRADE CONFIRMATION
     * ============================================
     */

    confirmTrade() {
        // Pre-checks
        const canTradeResult = this.canTrade();
        if (!canTradeResult.allowed) {
            alert('⛔ Cannot confirm trade:\n' + canTradeResult.reasons.join('\n'));
            return;
        }

        // Check pullback retrace
        const pullbackRetrace = parseFloat(document.getElementById('deltaPullbackRetrace').value);
        if (pullbackRetrace >= 30) {
            alert('❌ Pullback retrace must be less than 30%');
            return;
        }

        // Gather trade data
        const today = this.getToday();

        const tradeData = {
            id: 'trade_' + Date.now(),
            timestamp: Date.now(),
            date: today,
            session: this.state.selectedSession || 'unknown',

            // Structure
            structure: {
                biasAlign: document.querySelector('[data-rule="biasAlign"]').checked,
                liquiditySweep: document.querySelector('[data-rule="liquiditySweep"]').checked,
                sweepDepth: document.querySelector('[data-rule="sweepDepth"]').checked,
                closedInside: document.querySelector('[data-rule="closedInside"]').checked,
                volumeSpike: document.querySelector('[data-rule="volumeSpike"]').checked,
                bosBreak: document.querySelector('[data-rule="bosBreak"]').checked,
                imbalance: document.querySelector('[data-rule="imbalance"]').checked,
                firstPullback: document.querySelector('[data-rule="firstPullback"]').checked
            },

            // Delta
            delta: {
                bosCandleDelta: parseFloat(document.getElementById('deltaBosCandleDelta').value),
                pullbackRetrace: parseFloat(document.getElementById('deltaPullbackRetrace').value),
                divergence: document.querySelector('[data-rule="deltaDivergence"]').checked,
                threshold: document.querySelector('[data-rule="deltaThreshold"]').checked,
                pullbackValid: document.querySelector('[data-rule="pullbackValid"]').checked,
                noOpposing: document.querySelector('[data-rule="noOpposingDelta"]').checked
            },

            status: 'confirmed',
            completed: false,

            // Market Context Snapshot (optional)
            marketContext: this.state.marketContext && this.state.marketContext[today]
                ? { ...this.state.marketContext[today] }
                : null
        };

        // Save trade
        this.state.trades.push(tradeData);

        // Update limits
        this.state.limits.tradesToday = this.getTradesCount('today');
        this.state.limits.tradesWeek = this.getTradesCount('week');
        this.state.limits.cooldownUntil = Date.now() + this.state.config.minTimeBetweenTrades;

        this.saveState();

        // Reset form
        document.getElementById('confirmForm').reset();

        alert('✅ Trade confirmed and logged!\n\n⏳ Cooldown active: 2 hours\n\nRemember to complete post-trade log after exit.');

        // Refresh the trading screen
        this.updateTradingScreen();
    },

    /**
     * ============================================
     * SCREEN 4: POST-TRADE LOG
     * ============================================
     */

    updateLogScreen() {
        const incompleteTrades = this.state.trades.filter(t => t.status === 'confirmed' && !t.completed);
        const noTrades = document.getElementById('logNoTrades');
        const selector = document.getElementById('logTradeSelector');
        const form = document.getElementById('logForm');
        const select = document.getElementById('logTradeSelect');

        if (incompleteTrades.length === 0) {
            noTrades.classList.remove('hidden');
            selector.classList.add('hidden');
            form.classList.add('hidden');
        } else {
            noTrades.classList.add('hidden');
            selector.classList.remove('hidden');
            form.classList.remove('hidden');

            // Populate selector
            select.innerHTML = incompleteTrades.map(t => `
                <option value="${t.id}">
                    ${new Date(t.timestamp).toLocaleString()} - Trade Confirmed
                </option>
            `).join('');

            this.state.activeTradeId = incompleteTrades[0].id;
        }
    },

    updateLogForm() {
        // Can add pre-fill logic here if needed
    },

    /**
     * Complete trade log
     */
    completeTrade() {
        const tradeId = this.state.activeTradeId;
        const trade = this.state.trades.find(t => t.id === tradeId);

        if (!trade) {
            alert('❌ Trade not found');
            return;
        }

        // Gather log data
        const outcome = document.getElementById('logOutcome').value;
        const pnl = parseFloat(document.getElementById('logPnL').value);
        const ratingEntry = parseInt(document.getElementById('logRatingEntry').value);
        const ratingStop = parseInt(document.getElementById('logRatingStop').value);
        const ratingExit = parseInt(document.getElementById('logRatingExit').value);
        const notes = document.getElementById('logNotes').value;
        const screenshot = document.getElementById('logScreenshot').files[0];

        // Update trade
        trade.completed = true;
        trade.outcome = outcome;
        trade.pnl = pnl;
        trade.ratings = {
            entry: ratingEntry,
            stop: ratingStop,
            exit: ratingExit
        };
        trade.notes = notes;
        trade.completedAt = Date.now();

        // Handle screenshot (store as base64 if needed)
        if (screenshot) {
            const reader = new FileReader();
            reader.onload = (e) => {
                trade.screenshot = e.target.result;
                this.saveState();
            };
            reader.readAsDataURL(screenshot);
        }

        this.saveState();

        // Reset form
        document.getElementById('logForm').reset();

        alert('✅ Trade log completed!\n\nYou can now review this trade in the Review Dashboard.');

        this.updateLogScreen();
    },

    /**
     * ============================================
     * SCREEN 5: REVIEW DASHBOARD
     * ============================================
     */

    updateReviewScreen() {
        const completedTrades = this.state.trades.filter(t => t.completed);
        const today = this.getToday();
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        // Daily stats
        const todayTrades = completedTrades.filter(t => t.date === today);
        document.getElementById('reviewDailyTrades').textContent = todayTrades.length;

        const todayPnL = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const pnlEl = document.getElementById('reviewDailyPnL');
        pnlEl.textContent = '$' + todayPnL.toFixed(2);
        pnlEl.className = 'text-2xl font-bold ' + (todayPnL >= 0 ? 'text-green-400' : 'text-red-400');

        // Compliance (placeholder)
        document.getElementById('reviewDailyCompliance').textContent = '100%';

        // Locks
        const canTradeResult = this.canTrade();
        document.getElementById('reviewDailyLocks').textContent = canTradeResult.allowed ? '0' : canTradeResult.reasons.length;

        // Weekly stats
        const weekTrades = completedTrades.filter(t => new Date(t.timestamp).getTime() >= weekAgo);
        document.getElementById('reviewWeeklyTrades').textContent = weekTrades.length;

        const wins = weekTrades.filter(t => t.outcome === 'win');
        const losses = weekTrades.filter(t => t.outcome === 'loss');
        const winRate = weekTrades.length > 0 ? (wins.length / weekTrades.length * 100).toFixed(1) : '0.0';
        document.getElementById('reviewWeeklyWinRate').textContent = winRate + '%';

        const avgWin = wins.length > 0 ? (wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length) : 0;
        const avgLoss = losses.length > 0 ? (losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 0;
        document.getElementById('reviewWeeklyAvgWin').textContent = '$' + avgWin.toFixed(2);
        document.getElementById('reviewWeeklyAvgLoss').textContent = '$' + avgLoss.toFixed(2);

        // Expectancy
        const expectancy = weekTrades.length > 0
            ? (weekTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / weekTrades.length)
            : 0;
        document.getElementById('reviewWeeklyExpectancy').textContent = '$' + expectancy.toFixed(2);

        // R:R (placeholder - would need more data)
        document.getElementById('reviewWeeklyRR').textContent = '1.5';

        // Session breakdown - simplified
        document.getElementById('reviewSessionLondon').innerHTML = `
            <p class="text-gray-500">Session tracking not enabled</p>
        `;

        document.getElementById('reviewSessionNY').innerHTML = `
            <p class="text-gray-500">Session tracking not enabled</p>
        `;

        // Most violated rule (placeholder)
        document.getElementById('reviewViolatedRule').textContent = 'No violations detected';

        // Trade table
        const tableBody = document.getElementById('reviewTradeTable');
        const recentTrades = completedTrades.slice(-10).reverse();

        if (recentTrades.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No completed trades</td></tr>';
        } else {
            tableBody.innerHTML = recentTrades.map(t => `
                <tr class="hover:bg-gray-700">
                    <td class="p-2">${t.date}</td>
                    <td class="p-2">${new Date(t.timestamp).toLocaleTimeString()}</td>
                    <td class="p-2">
                        <span class="px-2 py-1 rounded text-xs ${
                            t.outcome === 'win' ? 'bg-green-900 text-green-300' :
                            t.outcome === 'loss' ? 'bg-red-900 text-red-300' :
                            'bg-gray-600 text-gray-300'
                        }">
                            ${t.outcome.toUpperCase()}
                        </span>
                    </td>
                    <td class="p-2 ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}">
                        ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}
                    </td>
                </tr>
            `).join('');
        }
    },

    /**
     * ============================================
     * MARKET CONTEXT FETCH (BINANCE FUTURES API)
     * ============================================
     *
     * IMPORTANT: This data is INFORMATIONAL ONLY
     * It does NOT affect trade enforcement, bias, risk, or limits
     * If fetch fails, trading continues normally with manual input
     */

    /**
     * Fetch market data from Binance Futures API
     * Called manually via button click - no automatic polling
     */
    async fetchMarketData() {
        const symbol = document.getElementById('marketSymbol').value;

        // If no symbol selected, just hide the display and return
        if (!symbol) {
            document.getElementById('marketDataDisplay').classList.add('hidden');
            document.getElementById('marketDataStatus').classList.add('hidden');
            return;
        }

        this.showMarketDataStatus('Fetching...', 'loading');

        try {
            // Fetch from Binance Futures API (public endpoints, no auth required)
            const [premiumData, openInterestData, statsData] = await Promise.all([
                this.fetchBinance(`/fapi/v1/premiumIndex?symbol=${symbol}`),
                this.fetchBinance(`/fapi/v1/openInterest?symbol=${symbol}`),
                this.fetchBinance(`/fapi/v1/ticker/24hr?symbol=${symbol}`)
            ]);

            // Debug: Log raw responses to diagnose parsing issues
            console.log('📋 Raw API Responses:');
            console.log('premiumData:', premiumData);
            console.log('openInterestData:', openInterestData);
            console.log('statsData:', statsData);

            // Extract relevant data
            const marketContext = {
                symbol: symbol,
                markPrice: parseFloat(premiumData.markPrice),
                lastFundingRate: parseFloat(premiumData.lastFundingRate) * 100, // Convert to percentage
                openInterest: parseFloat(openInterestData.openInterest),
                volume: parseFloat(statsData.volume),
                priceChangePercent: parseFloat(statsData.priceChangePercent),
                fetchedAt: Date.now()
            };

            // Store in state (INFORMATIONAL ONLY - does not affect enforcement)
            this.state.marketContext = marketContext;
            this.saveState();

            // Display the data and auto-fill manual fields
            this.displayMarketData(marketContext);
            this.autoFillMarketContext(marketContext);

            // Analyze market context and show recommendation
            this.analyzeMarketContext(marketContext);

            // Save symbol for future quick access
            this.saveSymbol(symbol);

            this.showMarketDataStatus(
                `✓ Data fetched at ${new Date().toLocaleTimeString()}`,
                'success'
            );

            console.log('📊 Market data fetched (informational only):', marketContext);

        } catch (error) {
            console.error('❌ Market data fetch failed:', error);
            this.showMarketDataStatus(
                'Data unavailable - Please use manual input',
                'error'
            );
            // Trading continues normally - fetch failure does NOT block anything
        }
    },

    /**
     * Generic Binance API fetch wrapper with multi-proxy fallback
     * Uses public API endpoints only
     *
     * CORS NOTE: Binance does not enable CORS for browser requests.
     * This implementation:
     * 1. First tries local Vercel/Netlify serverless function (if available)
     * 2. Falls back to public CORS proxies if serverless function doesn't exist
     * 3. Tries multiple proxies in order until one succeeds
     *
     * For production: Deploy with /api/binance-proxy.js serverless function
     */
    async fetchBinance(endpoint) {
        const baseUrl = 'https://fapi.binance.com';
        const fullUrl = baseUrl + endpoint;

        // Strategy 1: Try local serverless function first (Vercel/Netlify)
        // This is the BEST option - fast, reliable, no external dependencies
        try {
            console.log('🔄 Trying local serverless function...');
            const serverlessUrl = `/api/binance-proxy?endpoint=${encodeURIComponent(endpoint)}`;

            const response = await fetch(serverlessUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Serverless function succeeded');
                console.log('📦 Serverless data structure:', data);
                return data;
            } else {
                console.warn('⚠️ Serverless function returned:', response.status);
                throw new Error(`Serverless returned ${response.status}`);
            }
        } catch (error) {
            console.warn('❌ Serverless function not available:', error.message);
            console.log('⚠️ Falling back to public CORS proxies...');
        }

        // Strategy 2: Fallback to public CORS proxies
        // List of CORS proxies to try in order
        const corsProxies = [
            'https://corsproxy.io/?',                           // Primary - reliable, fast
            'https://api.allorigins.win/raw?url=',              // Backup - sometimes slow
            'https://api.codetabs.com/v1/proxy?quest='          // Tertiary - rate limited
        ];

        // Try each proxy in sequence
        for (let i = 0; i < corsProxies.length; i++) {
            const proxy = corsProxies[i];
            const fetchUrl = proxy + encodeURIComponent(fullUrl);

            try {
                console.log(`🔄 Trying CORS proxy ${i + 1}/${corsProxies.length}: ${proxy.substring(0, 30)}...`);

                const response = await fetch(fetchUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                let data = await response.json();
                console.log(`✅ CORS proxy ${i + 1} succeeded`);

                // Some CORS proxies wrap the response - unwrap if needed
                // allOrigins non-raw endpoint returns: { contents: "..." }
                // We use raw endpoint, but check anyway
                if (data && typeof data === 'object' && data.contents) {
                    console.log('🔄 Unwrapping proxy response...');
                    try {
                        data = typeof data.contents === 'string'
                            ? JSON.parse(data.contents)
                            : data.contents;
                    } catch (e) {
                        console.warn('Failed to unwrap, using as-is');
                    }
                }

                console.log('📦 Final data structure:', data);
                return data;

            } catch (error) {
                console.warn(`❌ CORS proxy ${i + 1} failed:`, error.message);

                // If this was the last proxy, throw the error
                if (i === corsProxies.length - 1) {
                    throw new Error(`All proxies failed. Last error: ${error.message}`);
                }

                // Otherwise, continue to next proxy
                continue;
            }
        }
    },

    /**
     * Display fetched market data in the UI
     */
    displayMarketData(data) {
        const display = document.getElementById('marketDataDisplay');
        display.classList.remove('hidden');

        // Format and display values
        document.getElementById('marketMarkPrice').textContent =
            '$' + data.markPrice.toFixed(2);

        document.getElementById('marketFundingRate').textContent =
            data.lastFundingRate.toFixed(4) + '%';

        document.getElementById('marketOpenInterest').textContent =
            data.openInterest.toLocaleString('en-US', { maximumFractionDigits: 0 });

        const priceChangeEl = document.getElementById('marketPriceChange');
        priceChangeEl.textContent =
            (data.priceChangePercent >= 0 ? '+' : '') + data.priceChangePercent.toFixed(2) + '%';
        priceChangeEl.className = 'font-mono font-semibold ' +
            (data.priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400');
    },

    /**
     * Auto-fill manual context fields with fetched data
     * Uses actual OI change data when available, falls back to heuristics
     */
    autoFillMarketContext(data) {
        // Auto-fill Funding Rate (direct value)
        document.getElementById('contextFunding').value = data.lastFundingRate.toFixed(4);

        // Auto-calculate Open Interest trend using ACTUAL OI change
        const oiSelect = document.getElementById('contextOI');
        const symbol = data.symbol;
        const currentOI = data.openInterest;

        // Get previous OI value for this symbol
        const previousOI = this.state.oiHistory[symbol];

        if (previousOI && previousOI.value) {
            // We have historical data - calculate actual OI change
            const oiChange = ((currentOI - previousOI.value) / previousOI.value) * 100;
            const timeDiff = Date.now() - previousOI.timestamp;
            const hoursSinceLastCheck = timeDiff / (1000 * 60 * 60);

            console.log('📊 OI Change Analysis:', {
                symbol,
                previousOI: previousOI.value,
                currentOI,
                change: oiChange.toFixed(2) + '%',
                hoursSince: hoursSinceLastCheck.toFixed(1) + 'h'
            });

            // Determine trend based on actual change
            // Thresholds: >2% change = rising/falling, <2% = flat
            if (oiChange > 2) {
                oiSelect.value = 'rising';
                console.log(`✓ OI trend: Rising (+${oiChange.toFixed(2)}% actual increase)`);
            } else if (oiChange < -2) {
                oiSelect.value = 'falling';
                console.log(`✓ OI trend: Falling (${oiChange.toFixed(2)}% actual decrease)`);
            } else {
                oiSelect.value = 'flat';
                console.log(`✓ OI trend: Flat (${oiChange.toFixed(2)}% minimal change)`);
            }
        } else {
            // No historical data - use heuristics as fallback
            console.log('⚠️ No historical OI data for', symbol, '- using heuristics');
            const priceChange = Math.abs(data.priceChangePercent);
            const fundingRate = Math.abs(data.lastFundingRate);

            if (priceChange > 2 && fundingRate > 0.005) {
                oiSelect.value = 'rising';
                console.log('✓ OI trend: Rising (heuristic - strong trend + funding)');
            } else if (priceChange < 0.5 && fundingRate < 0.002) {
                oiSelect.value = 'flat';
                console.log('✓ OI trend: Flat (heuristic - low volatility)');
            } else if (priceChange > 4) {
                oiSelect.value = 'rising';
                console.log('✓ OI trend: Rising (heuristic - high volatility)');
            } else {
                oiSelect.value = '';
                console.log('⚠️ OI trend: Unclear (manual input recommended)');
            }
        }

        // Store current OI value for next comparison
        this.state.oiHistory[symbol] = {
            value: currentOI,
            timestamp: Date.now()
        };
        this.saveState();

        // Auto-calculate 24h Volume trend
        // Heuristic: Compare volume to open interest and price volatility
        // - High volume/OI ratio + volatility = Above average
        // - Low volume/OI ratio + calm market = Below average
        const volumeSelect = document.getElementById('contextVolume');
        const priceChange = Math.abs(data.priceChangePercent);
        const volumeToOI = data.volume / data.openInterest;

        if (priceChange > 3 || volumeToOI > 15) {
            // High volatility (>3%) OR high volume relative to OI (>15x)
            // Indicates active trading day - above average volume
            volumeSelect.value = 'above';
            console.log('✓ Volume: Above Average (high activity)');
        } else if (priceChange < 1 && volumeToOI < 8) {
            // Low volatility (<1%) AND low volume/OI ratio (<8x)
            // Quiet trading day - below average volume
            volumeSelect.value = 'below';
            console.log('✓ Volume: Below Average (low activity)');
        } else {
            // Normal range - around average
            volumeSelect.value = 'above'; // Default to above if not clearly below
            console.log('✓ Volume: Above Average (normal activity)');
        }

        console.log('📊 Auto-fill summary:', {
            fundingRate: data.lastFundingRate.toFixed(4) + '%',
            priceChange: data.priceChangePercent.toFixed(2) + '%',
            volumeToOI: volumeToOI.toFixed(2) + 'x',
            oiTrend: oiSelect.value || 'manual',
            volumeTrend: volumeSelect.value
        });
    },

    /**
     * Analyze market context and generate recommendation
     */
    analyzeMarketContext(data) {
        const fundingRate = data.lastFundingRate;
        const oiTrend = document.getElementById('contextOI').value;
        const volumeTrend = document.getElementById('contextVolume').value;

        let recommendation = 'WAIT';
        let reasoning = [];
        let confidence = 'LOW';
        let bgColor = 'bg-gray-700 border-gray-600';
        let titleColor = 'text-gray-300';

        // Check for extreme funding (overextended)
        if (Math.abs(fundingRate) > 0.05) {
            recommendation = 'WAIT';
            confidence = 'HIGH';
            bgColor = 'bg-yellow-900 border-yellow-700';
            titleColor = 'text-yellow-300';
            reasoning.push(`⚠️ Extreme funding rate (${(fundingRate * 100).toFixed(3)}%) - Market overextended`);
            reasoning.push('Wait for funding to normalize before entering');

            this.displayRecommendation(recommendation, reasoning, confidence, bgColor, titleColor);
            return;
        }

        // Check for dead market (falling OI + low volume)
        if (oiTrend === 'falling' && volumeTrend === 'below') {
            recommendation = 'WAIT';
            confidence = 'HIGH';
            bgColor = 'bg-gray-700 border-gray-600';
            titleColor = 'text-gray-400';
            reasoning.push('📉 Falling OI + Low Volume = Dead market');
            reasoning.push('No conviction, trend dying - avoid trading');

            this.displayRecommendation(recommendation, reasoning, confidence, bgColor, titleColor);
            return;
        }

        // Check for LONG bias conditions
        if (fundingRate <= 0.01 && oiTrend === 'rising' && volumeTrend === 'above') {
            // Best long setup: Negative/low funding + rising OI + high volume
            recommendation = 'LONG';
            confidence = 'HIGH';
            bgColor = 'bg-green-900 border-green-700';
            titleColor = 'text-green-300';
            reasoning.push(`✅ Funding: ${(fundingRate * 100).toFixed(3)}% (${fundingRate < 0 ? 'shorts paying longs' : 'neutral/low'})`);
            reasoning.push('✅ Rising OI: New buyers entering positions');
            reasoning.push('✅ Above Average Volume: Strong participation');
            reasoning.push('');
            reasoning.push('💡 Look for LONG setups: Sweep below + BOS up + Delta confirmation');
        } else if ((fundingRate <= 0.005 || fundingRate <= 0.01) && oiTrend === 'rising' && volumeTrend === 'above') {
            // Good long setup: Low funding + rising OI + volume
            recommendation = 'LONG';
            confidence = 'MEDIUM';
            bgColor = 'bg-green-900 border-green-700';
            titleColor = 'text-green-300';
            reasoning.push(`✅ Funding: ${(fundingRate * 100).toFixed(3)}% (neutral/low - longs not overcrowded)`);
            reasoning.push('✅ Rising OI: Fresh uptrend building');
            reasoning.push('✅ Above Average Volume: Good participation');
            reasoning.push('');
            reasoning.push('💡 Look for LONG setups if structure aligns');
        } else if (fundingRate < 0 && volumeTrend === 'above') {
            // Potential reversal long
            recommendation = 'LONG';
            confidence = 'MEDIUM';
            bgColor = 'bg-green-900 border-green-700';
            titleColor = 'text-green-300';
            reasoning.push(`✅ Funding: ${(fundingRate * 100).toFixed(3)}% (shorts paying longs)`);
            reasoning.push(`⚠️ OI: ${oiTrend || 'unclear'} (monitor for rising)`);
            reasoning.push('✅ Above Average Volume: Interest present');
            reasoning.push('');
            reasoning.push('💡 Potential reversal LONG - wait for structure confirmation');
        }
        // Check for SHORT bias conditions
        else if (fundingRate >= 0.01 && oiTrend === 'rising' && volumeTrend === 'above') {
            // Best short setup: Positive funding + rising OI + high volume
            recommendation = 'SHORT';
            confidence = 'HIGH';
            bgColor = 'bg-red-900 border-red-700';
            titleColor = 'text-red-300';
            reasoning.push(`✅ Funding: ${(fundingRate * 100).toFixed(3)}% (longs paying shorts - overcrowded)`);
            reasoning.push('✅ Rising OI: New sellers entering positions');
            reasoning.push('✅ Above Average Volume: Strong participation');
            reasoning.push('');
            reasoning.push('💡 Look for SHORT setups: Sweep above + BOS down + Delta confirmation');
        } else if (fundingRate >= 0.015 && volumeTrend === 'above') {
            // Potential reversal short
            recommendation = 'SHORT';
            confidence = 'MEDIUM';
            bgColor = 'bg-red-900 border-red-700';
            titleColor = 'text-red-300';
            reasoning.push(`✅ Funding: ${(fundingRate * 100).toFixed(3)}% (longs overcrowded)`);
            reasoning.push(`⚠️ OI: ${oiTrend || 'unclear'} (monitor for rising)`);
            reasoning.push('✅ Above Average Volume: Interest present');
            reasoning.push('');
            reasoning.push('💡 Potential reversal SHORT - wait for structure confirmation');
        }
        // Default to WAIT if no clear setup
        else {
            recommendation = 'WAIT';
            confidence = 'MEDIUM';
            bgColor = 'bg-gray-700 border-gray-600';
            titleColor = 'text-gray-400';
            reasoning.push(`ℹ️ Funding: ${(fundingRate * 100).toFixed(3)}% (${fundingRate > 0 ? 'longs paying shorts' : 'shorts paying longs'})`);
            reasoning.push(`ℹ️ OI: ${oiTrend || 'not set'}`);
            reasoning.push(`ℹ️ Volume: ${volumeTrend || 'not set'}`);
            reasoning.push('');
            reasoning.push('⚠️ Mixed or unclear signals - No strong bias');
            reasoning.push('💡 Wait for clearer market context or only take A+ setups');
        }

        this.displayRecommendation(recommendation, reasoning, confidence, bgColor, titleColor);
    },

    /**
     * Display market context recommendation in UI
     */
    displayRecommendation(recommendation, reasoning, confidence, bgColor, titleColor) {
        const recommendationDiv = document.getElementById('marketRecommendation');
        const titleEl = document.getElementById('recommendationTitle');
        const contentEl = document.getElementById('recommendationContent');

        // Show the recommendation section
        recommendationDiv.classList.remove('hidden');
        recommendationDiv.className = `mt-4 p-4 rounded border-2 ${bgColor}`;

        // Set title with icon
        const icons = {
            'LONG': '🟢',
            'SHORT': '🔴',
            'WAIT': '⚪'
        };
        titleEl.className = `font-bold text-lg mb-2 ${titleColor}`;
        titleEl.textContent = `${icons[recommendation]} ${recommendation} BIAS (${confidence} Confidence)`;

        // Set content
        contentEl.innerHTML = reasoning.map(line => {
            if (line === '') return '<div class="h-2"></div>';
            return `<p>${line}</p>`;
        }).join('');
    },

    /**
     * Show status message for market data fetch
     */
    showMarketDataStatus(message, type) {
        const statusEl = document.getElementById('marketDataStatus');
        statusEl.classList.remove('hidden');
        statusEl.textContent = message;

        // Color coding based on type
        if (type === 'loading') {
            statusEl.className = 'mb-3 text-xs text-blue-400';
        } else if (type === 'success') {
            statusEl.className = 'mb-3 text-xs text-green-400';
        } else if (type === 'error') {
            statusEl.className = 'mb-3 text-xs text-yellow-400';
        }
    },

    /**
     * ============================================
     * QUICK STATS (DELTA CONFIRMATION HELPER)
     * ============================================
     */

    /**
     * Fetch and display quick stats for Delta Confirmation
     * - Pullback % from swing high/low
     * - Volume vs 24h average
     * - Price zone (premium/discount/equilibrium)
     */
    async fetchQuickStats() {
        const symbol = document.getElementById('marketSymbol').value;

        if (!symbol) {
            alert('⚠️ Please select a coin in Market Context first');
            return;
        }

        const display = document.getElementById('quickStatsDisplay');
        const content = document.getElementById('quickStatsContent');

        // Show loading state
        display.classList.remove('hidden');
        content.innerHTML = '<p class="text-gray-400">Loading...</p>';

        try {
            // Fetch 5-minute klines (last 100 candles = ~8.3 hours of data)
            // This gives us enough data to find recent swing high/low
            const klineData = await this.fetchBinance(
                `/fapi/v1/klines?symbol=${symbol}&interval=5m&limit=100`
            );

            // Also fetch current 24hr stats for volume comparison
            const statsData = await this.fetchBinance(`/fapi/v1/ticker/24hr?symbol=${symbol}`);

            // Calculate stats
            const stats = this.calculateQuickStats(klineData, statsData);

            // Display results
            this.displayQuickStats(stats);

            // Save symbol for future quick access
            this.saveSymbol(symbol);

            console.log('📊 Quick Stats:', stats);

        } catch (error) {
            console.error('❌ Quick Stats fetch failed:', error);
            content.innerHTML = '<p class="text-red-400">Failed to fetch stats. Please try again.</p>';
        }
    },

    /**
     * Calculate quick stats from kline data
     */
    calculateQuickStats(klineData, statsData) {
        // Parse kline data
        // Kline format: [openTime, open, high, low, close, volume, closeTime, ...]
        const candles = klineData.map(k => ({
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        }));

        // Get current price (most recent close)
        const currentPrice = candles[candles.length - 1].close;

        // Find swing high and swing low from recent candles
        const swingHigh = Math.max(...candles.map(c => c.high));
        const swingLow = Math.min(...candles.map(c => c.low));
        const range = swingHigh - swingLow;

        // Calculate pullback percentage from swing high
        // Formula: (swingHigh - currentPrice) / (swingHigh - swingLow) * 100
        const pullbackFromHigh = ((swingHigh - currentPrice) / range) * 100;

        // Calculate retracement from swing low (for shorts)
        const pullbackFromLow = ((currentPrice - swingLow) / range) * 100;

        // Determine price zone
        let priceZone = 'Equilibrium';
        let zoneColor = 'text-yellow-400';

        if (pullbackFromHigh <= 25) {
            // In top 25% of range
            priceZone = 'Premium (Top 25%)';
            zoneColor = 'text-red-400';
        } else if (pullbackFromHigh >= 75) {
            // In bottom 25% of range
            priceZone = 'Discount (Bottom 25%)';
            zoneColor = 'text-green-400';
        }

        // Calculate average volume from candles
        const avgVolume = candles.reduce((sum, c) => sum + c.volume, 0) / candles.length;
        const currentVolume = candles[candles.length - 1].volume;
        const volumeVsAvg = ((currentVolume / avgVolume) * 100) - 100; // % difference

        // Also get 24h volume from stats
        const volume24h = parseFloat(statsData.quoteVolume); // In USDT

        return {
            currentPrice,
            swingHigh,
            swingLow,
            range,
            pullbackFromHigh: pullbackFromHigh.toFixed(1),
            pullbackFromLow: pullbackFromLow.toFixed(1),
            priceZone,
            zoneColor,
            avgVolume5m: avgVolume.toFixed(0),
            currentVolume5m: currentVolume.toFixed(0),
            volumeVsAvg: volumeVsAvg.toFixed(1),
            volume24h: (volume24h / 1_000_000).toFixed(2) // Convert to millions
        };
    },

    /**
     * Display quick stats in UI
     */
    displayQuickStats(stats) {
        const content = document.getElementById('quickStatsContent');

        const volumeColor = stats.volumeVsAvg > 0 ? 'text-green-400' : 'text-red-400';
        const volumeIcon = stats.volumeVsAvg > 0 ? '📈' : '📉';

        content.innerHTML = `
            <p class="text-gray-300">
                <span class="font-semibold">Current Price:</span>
                <span class="font-mono text-blue-400">$${stats.currentPrice.toFixed(2)}</span>
            </p>
            <p class="text-gray-300">
                <span class="font-semibold">Range:</span>
                <span class="font-mono">${stats.swingLow.toFixed(2)} - ${stats.swingHigh.toFixed(2)}</span>
                <span class="text-gray-500 text-xs ml-1">(~8h)</span>
            </p>
            <div class="h-1 bg-gray-700 rounded my-1"></div>
            <p class="text-gray-300">
                <span class="font-semibold">Pullback from High:</span>
                <span class="font-mono text-orange-400">${stats.pullbackFromHigh}%</span>
            </p>
            <p class="text-gray-300">
                <span class="font-semibold">Retrace from Low:</span>
                <span class="font-mono text-cyan-400">${stats.pullbackFromLow}%</span>
            </p>
            <div class="h-1 bg-gray-700 rounded my-1"></div>
            <p class="text-gray-300">
                <span class="font-semibold">Price Zone:</span>
                <span class="font-mono ${stats.zoneColor}">${stats.priceZone}</span>
            </p>
            <div class="h-1 bg-gray-700 rounded my-1"></div>
            <p class="text-gray-300">
                <span class="font-semibold">5m Volume vs Avg:</span>
                <span class="font-mono ${volumeColor}">${stats.volumeVsAvg > 0 ? '+' : ''}${stats.volumeVsAvg}% ${volumeIcon}</span>
            </p>
            <p class="text-gray-300">
                <span class="font-semibold">24h Volume:</span>
                <span class="font-mono text-purple-400">$${stats.volume24h}M</span>
            </p>
        `.trim();
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    IronLedger.init();
});

// Export for global access
window.IronLedger = IronLedger;
