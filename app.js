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
            maxStopDistance: 2.0 // 2%
        },
        currentScreen: 'setup',
        riskCalculated: false,
        activeTradeId: null,
        // Market context snapshot (fetched from Binance)
        // This data is INFORMATIONAL ONLY and does NOT affect trade enforcement
        marketContext: null
    },

    /**
     * Initialize the application
     */
    init() {
        console.log('🚀 IronLedger initializing...');
        this.loadState();
        this.setupEventListeners();
        this.startTimers();
        this.showScreen('setup');
        this.updateStatusBar();
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
            marketContext: this.state.marketContext
        };
        localStorage.setItem('ironledger_state', JSON.stringify(toSave));
        console.log('💾 State saved');
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
        // Setup form
        document.getElementById('setupForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.lockSetup();
        });

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

        // Auto-set today's date
        document.getElementById('setupDate').valueAsDate = new Date();
    },

    /**
     * Start background timers
     */
    startTimers() {
        // Update time and status every second
        setInterval(() => {
            this.updateStatusBar();
            this.updateStatusScreen();
        }, 1000);
    },

    /**
     * Update status bar (header)
     */
    updateStatusBar() {
        const now = new Date();
        const utcTime = now.toISOString().substr(11, 8) + ' UTC';
        document.getElementById('currentTime').textContent = utcTime;

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
        const today = this.getToday();
        const reasons = [];

        // 1. Check if setup is locked for today
        if (!this.state.sessions[today]) {
            reasons.push('Pre-market setup not completed');
        }

        // 2. Check if bias is neutral
        if (this.state.sessions[today]?.bias === 'neutral') {
            reasons.push('Bias is Neutral - trading disabled');
        }

        // 3. Check session time
        const sessionStatus = this.getSessionStatus();
        if (!sessionStatus.allowed) {
            reasons.push('Outside trading hours');
        }

        // 4. Check if session matches setup
        if (this.state.sessions[today] && sessionStatus.session) {
            const setupSession = this.state.sessions[today].session;
            if (setupSession === 'london' && sessionStatus.session !== 'London') {
                reasons.push('Not in locked session (London)');
            }
            if (setupSession === 'newyork' && sessionStatus.session !== 'New York') {
                reasons.push('Not in locked session (New York)');
            }
        }

        // 5. Check daily trade limit
        const tradesToday = this.getTradesCount('today');
        if (tradesToday >= this.state.config.maxTradesPerDay) {
            reasons.push(`Daily limit reached (${this.state.config.maxTradesPerDay} trades)`);
        }

        // 6. Check weekly trade limit
        const tradesWeek = this.getTradesCount('week');
        if (tradesWeek >= this.state.config.maxTradesPerWeek) {
            reasons.push(`Weekly limit reached (${this.state.config.maxTradesPerWeek} trades)`);
        }

        // 7. Check cooldown
        if (this.state.limits.cooldownUntil && Date.now() < this.state.limits.cooldownUntil) {
            const remaining = Math.ceil((this.state.limits.cooldownUntil - Date.now()) / 60000);
            reasons.push(`Cooldown active (${remaining} minutes remaining)`);
        }

        // 8. Check suspension
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
            if (screenName === 'setup') this.updateSetupScreen();
            if (screenName === 'status') this.updateStatusScreen();
            if (screenName === 'confirm') this.updateConfirmScreen();
            if (screenName === 'log') this.updateLogScreen();
            if (screenName === 'review') this.updateReviewScreen();
        }
    },

    /**
     * ============================================
     * SCREEN 1: PRE-MARKET SETUP
     * ============================================
     */

    updateSetupScreen() {
        const today = this.getToday();
        const setupForm = document.getElementById('setupForm');
        const setupLocked = document.getElementById('setupLocked');
        const lockedInfo = document.getElementById('lockedSetupInfo');

        if (this.state.sessions[today]) {
            // Already locked
            setupForm.classList.add('hidden');
            setupLocked.classList.remove('hidden');

            const session = this.state.sessions[today];
            lockedInfo.innerHTML = `
                <p><strong>Session:</strong> ${session.session === 'london' ? 'London' : 'New York'}</p>
                <p><strong>Bias:</strong> ${session.bias.toUpperCase()}</p>
                <p class="text-xs mt-2 text-gray-400">Setup cannot be changed. Reset available tomorrow.</p>
            `;
        } else {
            setupForm.classList.remove('hidden');
            setupLocked.classList.add('hidden');
        }
    },

    lockSetup() {
        const today = this.getToday();

        // Check if already locked
        if (this.state.sessions[today]) {
            alert('⚠️ Setup already locked for today!');
            return;
        }

        // Gather all data
        const session = document.getElementById('setupSession').value;
        const bias = document.getElementById('setupBias').value;

        const levels = {
            yesterdayHigh: parseFloat(document.getElementById('levelYesterdayHigh').value) || null,
            yesterdayLow: parseFloat(document.getElementById('levelYesterdayLow').value) || null,
            yesterdayClose: parseFloat(document.getElementById('levelYesterdayClose').value) || null,
            asianHigh: parseFloat(document.getElementById('levelAsianHigh').value) || null,
            asianLow: parseFloat(document.getElementById('levelAsianLow').value) || null,
            weeklyHigh: parseFloat(document.getElementById('levelWeeklyHigh').value) || null,
            weeklyLow: parseFloat(document.getElementById('levelWeeklyLow').value) || null,
            prevWeekHigh: parseFloat(document.getElementById('levelPrevWeekHigh').value) || null,
            prevWeekLow: parseFloat(document.getElementById('levelPrevWeekLow').value) || null
        };

        const liquidity = {
            equalHighs: document.getElementById('liquidityEqualHighs').value.split(',').map(s => s.trim()).filter(Boolean),
            equalLows: document.getElementById('liquidityEqualLows').value.split(',').map(s => s.trim()).filter(Boolean),
            psychological: document.getElementById('liquidityPsych').value.split(',').map(s => s.trim()).filter(Boolean)
        };

        const context = {
            funding: parseFloat(document.getElementById('contextFunding').value) || null,
            openInterest: document.getElementById('contextOI').value || null,
            volume: document.getElementById('contextVolume').value || null
        };

        // Save to state
        this.state.sessions[today] = {
            date: today,
            session,
            bias,
            levels,
            liquidity,
            context,
            lockedAt: Date.now()
        };

        this.saveState();

        alert('✅ Setup locked! Cannot be changed for today.');
        this.updateSetupScreen();
    },

    /**
     * ============================================
     * SCREEN 2: TRADE ELIGIBILITY STATUS
     * ============================================
     */

    updateStatusScreen() {
        const now = new Date();
        const utcTime = now.toISOString().substr(11, 8) + ' UTC';
        document.getElementById('statusTime').textContent = utcTime;

        const canTradeResult = this.canTrade();
        const today = this.getToday();

        // Lock alert
        const lockAlert = document.getElementById('lockAlert');
        const lockReason = document.getElementById('lockReason');

        if (!canTradeResult.allowed) {
            lockAlert.classList.remove('hidden');
            lockReason.innerHTML = canTradeResult.reasons.map(r => `• ${r}`).join('<br>');
        } else {
            lockAlert.classList.add('hidden');
        }

        // Session status
        const sessionStatus = this.getSessionStatus();
        const statusEl = document.getElementById('statusSessionStatus');
        if (sessionStatus.allowed) {
            statusEl.textContent = `✅ ${sessionStatus.session}`;
            statusEl.className = 'text-xl font-bold text-green-400';
        } else {
            statusEl.textContent = '🚫 Closed';
            statusEl.className = 'text-xl font-bold text-red-400';
        }

        // Bias
        const biasEl = document.getElementById('statusBias');
        const bias = this.state.sessions[today]?.bias || 'Not Set';
        biasEl.textContent = bias.toUpperCase();
        if (bias === 'bullish') biasEl.className = 'text-xl font-bold text-green-400';
        else if (bias === 'bearish') biasEl.className = 'text-xl font-bold text-red-400';
        else if (bias === 'neutral') biasEl.className = 'text-xl font-bold text-yellow-400';
        else biasEl.className = 'text-xl font-bold text-gray-400';

        // Trades
        document.getElementById('statusTradesToday').textContent =
            `${this.getTradesCount('today')} / ${this.state.config.maxTradesPerDay}`;
        document.getElementById('statusTradesWeek').textContent =
            `${this.getTradesCount('week')} / ${this.state.config.maxTradesPerWeek}`;

        // Cooldown
        const cooldownEl = document.getElementById('statusCooldown');
        if (this.state.limits.cooldownUntil && Date.now() < this.state.limits.cooldownUntil) {
            const remaining = Math.ceil((this.state.limits.cooldownUntil - Date.now()) / 60000);
            cooldownEl.textContent = `⏳ ${remaining}m`;
            cooldownEl.className = 'text-xl font-bold text-yellow-400';
        } else {
            cooldownEl.textContent = '✅ Ready';
            cooldownEl.className = 'text-xl font-bold text-green-400';
        }

        // Today's setup
        const setupDisplay = document.getElementById('todaySetupDisplay');
        if (this.state.sessions[today]) {
            const s = this.state.sessions[today];
            setupDisplay.innerHTML = `
                <p><strong>Session:</strong> ${s.session === 'london' ? 'London' : 'New York'}</p>
                <p><strong>Bias:</strong> ${s.bias.toUpperCase()}</p>
                <p class="text-xs text-gray-400 mt-2">Locked at ${new Date(s.lockedAt).toLocaleTimeString()}</p>
            `;
        } else {
            setupDisplay.innerHTML = '<p class="text-gray-500">No setup for today</p>';
        }

        // Active trades
        const activeDisplay = document.getElementById('activeTradesDisplay');
        const activeTrades = this.state.trades.filter(t => t.status === 'confirmed' && !t.completed);
        if (activeTrades.length > 0) {
            activeDisplay.innerHTML = activeTrades.map(t => `
                <div class="bg-gray-700 p-2 rounded mb-2">
                    <p><strong>${t.direction.toUpperCase()}</strong> @ ${t.entry} | SL: ${t.stopLoss}</p>
                    <p class="text-xs text-gray-400">${new Date(t.timestamp).toLocaleTimeString()}</p>
                </div>
            `).join('');
        } else {
            activeDisplay.innerHTML = '<p class="text-gray-500">No active trades</p>';
        }
    },

    /**
     * ============================================
     * SCREEN 3: TRADE CONFIRMATION
     * ============================================
     */

    updateConfirmScreen() {
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

        // Reset risk calculated flag
        this.state.riskCalculated = false;
    },

    /**
     * Calculate risk and position size
     */
    calculateRisk() {
        const accountSize = parseFloat(document.getElementById('riskAccountSize').value);
        const riskPercent = parseFloat(document.getElementById('riskPercent').value);
        const direction = document.getElementById('riskDirection').value;
        const entry = parseFloat(document.getElementById('riskEntryPrice').value);
        const sweepHigh = parseFloat(document.getElementById('riskSweepHigh').value);
        const sweepLow = parseFloat(document.getElementById('riskSweepLow').value);

        // Validation
        if (!accountSize || !riskPercent || !direction || !entry || !sweepHigh || !sweepLow) {
            alert('⚠️ Please fill all risk calculation fields');
            return;
        }

        // Calculate stop loss
        let stopLoss;
        if (direction === 'long') {
            stopLoss = sweepLow;
        } else {
            stopLoss = sweepHigh;
        }

        // Calculate stop distance
        const stopDistance = Math.abs(entry - stopLoss);
        const stopDistancePercent = (stopDistance / entry) * 100;

        // Calculate dollar risk
        const dollarRisk = accountSize * (riskPercent / 100);

        // Calculate position size
        const positionSize = dollarRisk / stopDistance;

        // Calculate required leverage
        const positionValue = positionSize * entry;
        const leverage = positionValue / accountSize;

        // Display results
        const resultsDiv = document.getElementById('riskResults');
        const warningsDiv = document.getElementById('riskWarnings');
        resultsDiv.classList.remove('hidden');

        document.getElementById('riskStopLoss').textContent = stopLoss.toFixed(2);
        document.getElementById('riskStopDistance').textContent = stopDistancePercent.toFixed(2) + '%';
        document.getElementById('riskDollarRisk').textContent = '$' + dollarRisk.toFixed(2);
        document.getElementById('riskPositionSize').textContent = positionSize.toFixed(4);
        document.getElementById('riskLeverage').textContent = leverage.toFixed(2) + 'x';

        // Check for violations
        const warnings = [];
        let blocked = false;

        if (stopDistancePercent > this.state.config.maxStopDistance) {
            warnings.push(`❌ BLOCKED: Stop distance ${stopDistancePercent.toFixed(2)}% exceeds max ${this.state.config.maxStopDistance}%`);
            blocked = true;
            resultsDiv.classList.add('border-red-600');
        }

        if (leverage > this.state.config.maxLeverage) {
            warnings.push(`❌ BLOCKED: Leverage ${leverage.toFixed(2)}x exceeds max ${this.state.config.maxLeverage}x`);
            blocked = true;
            resultsDiv.classList.add('border-red-600');
        }

        if (blocked) {
            warningsDiv.innerHTML = '<div class="text-red-400 font-bold">' + warnings.join('<br>') + '</div>';
            this.state.riskCalculated = false;
        } else {
            warningsDiv.innerHTML = '<div class="text-green-400 font-bold">✅ All risk parameters valid</div>';
            resultsDiv.classList.remove('border-red-600');
            resultsDiv.classList.add('border-green-600');
            this.state.riskCalculated = true;
        }
    },

    /**
     * Confirm trade
     */
    confirmTrade() {
        // Pre-checks
        const canTradeResult = this.canTrade();
        if (!canTradeResult.allowed) {
            alert('⛔ Cannot confirm trade:\n' + canTradeResult.reasons.join('\n'));
            return;
        }

        // Check risk calculated
        if (!this.state.riskCalculated) {
            alert('⚠️ Please calculate risk first and ensure no violations');
            return;
        }

        // Check pullback retrace
        const pullbackRetrace = parseFloat(document.getElementById('deltaPullbackRetrace').value);
        if (pullbackRetrace >= 30) {
            alert('❌ Pullback retrace must be less than 30%');
            return;
        }

        // Gather all trade data
        const today = this.getToday();
        const tradeData = {
            id: 'trade_' + Date.now(),
            timestamp: Date.now(),
            date: today,
            session: this.state.sessions[today].session,
            bias: this.state.sessions[today].bias,

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

            // Risk
            accountSize: parseFloat(document.getElementById('riskAccountSize').value),
            riskPercent: parseFloat(document.getElementById('riskPercent').value),
            direction: document.getElementById('riskDirection').value,
            entry: parseFloat(document.getElementById('riskEntryPrice').value),
            stopLoss: parseFloat(document.getElementById('riskStopLoss').textContent),
            leverage: parseFloat(document.getElementById('riskLeverage').textContent.replace('x', '')),

            // Execution
            tp1: parseFloat(document.getElementById('execTP1').value),
            tp2: parseFloat(document.getElementById('execTP2').value),
            emotional: document.getElementById('execEmotional').value,
            quality: document.getElementById('execQuality').value,

            status: 'confirmed',
            completed: false,

            // Market Context Snapshot (INFORMATIONAL ONLY - attached for review purposes)
            // This data does NOT influence trade approval or enforcement
            marketContext: this.state.marketContext ? { ...this.state.marketContext } : null
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
        this.state.riskCalculated = false;
        document.getElementById('riskResults').classList.add('hidden');

        alert('✅ Trade confirmed and logged!\n\n⏳ Cooldown active: 2 hours\n\nRemember to complete post-trade log after exit.');

        // Navigate to status
        this.showScreen('status');
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
                    ${new Date(t.timestamp).toLocaleString()} - ${t.direction.toUpperCase()} @ ${t.entry}
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

        // Session breakdown
        const londonTrades = weekTrades.filter(t => t.session === 'london');
        const nyTrades = weekTrades.filter(t => t.session === 'newyork');

        const londonWins = londonTrades.filter(t => t.outcome === 'win').length;
        const nyWins = nyTrades.filter(t => t.outcome === 'win').length;

        document.getElementById('reviewSessionLondon').innerHTML = `
            <p>Trades: ${londonTrades.length}</p>
            <p>Wins: ${londonWins}</p>
            <p>Win Rate: ${londonTrades.length > 0 ? ((londonWins / londonTrades.length) * 100).toFixed(1) : 0}%</p>
        `;

        document.getElementById('reviewSessionNY').innerHTML = `
            <p>Trades: ${nyTrades.length}</p>
            <p>Wins: ${nyWins}</p>
            <p>Win Rate: ${nyTrades.length > 0 ? ((nyWins / nyTrades.length) * 100).toFixed(1) : 0}%</p>
        `;

        // Most violated rule (placeholder)
        document.getElementById('reviewViolatedRule').textContent = 'No violations detected';

        // Trade table
        const tableBody = document.getElementById('reviewTradeTable');
        const recentTrades = completedTrades.slice(-10).reverse();

        if (recentTrades.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-gray-500">No completed trades</td></tr>';
        } else {
            tableBody.innerHTML = recentTrades.map(t => `
                <tr class="hover:bg-gray-700">
                    <td class="p-2">${t.date}</td>
                    <td class="p-2">${t.session === 'london' ? 'London' : 'NY'}</td>
                    <td class="p-2">${t.direction.toUpperCase()}</td>
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
                    <td class="p-2">${t.quality}</td>
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

        // Validate symbol selection
        if (!symbol) {
            this.showMarketDataStatus('Please select a symbol first', 'error');
            return;
        }

        this.showMarketDataStatus('Loading...', 'loading');

        try {
            // Fetch from Binance Futures API (public endpoints, no auth required)
            const [premiumData, openInterestData, statsData] = await Promise.all([
                this.fetchBinance(`/fapi/v1/premiumIndex?symbol=${symbol}`),
                this.fetchBinance(`/fapi/v1/openInterest?symbol=${symbol}`),
                this.fetchBinance(`/fapi/v1/ticker/24hr?symbol=${symbol}`)
            ]);

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

            // Display the data
            this.displayMarketData(marketContext);
            this.showMarketDataStatus(
                `Data fetched successfully at ${new Date().toLocaleTimeString()}`,
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
     * Generic Binance API fetch wrapper
     * Uses public API endpoints only
     *
     * CORS NOTE: Binance does not enable CORS for browser requests.
     * Options to fix this:
     * 1. Use CORS proxy (enabled by default for client-side apps)
     * 2. Host with a backend proxy (recommended for production)
     * 3. Use serverless functions (Cloudflare Workers, Netlify Functions)
     *
     * To disable CORS proxy and use direct fetch (only works if hosted with backend):
     * Set useCorsProxy to false in config below
     */
    async fetchBinance(endpoint) {
        // CORS proxy configuration
        // Using allOrigins.win - a free, open CORS proxy
        // Alternative: 'https://corsproxy.io/?'
        const useCorsProxy = true; // Set to false if you have a backend proxy
        const corsProxy = 'https://api.allorigins.win/raw?url=';

        const baseUrl = 'https://fapi.binance.com';
        const fullUrl = baseUrl + endpoint;
        const fetchUrl = useCorsProxy ? corsProxy + encodeURIComponent(fullUrl) : fullUrl;

        const response = await fetch(fetchUrl);

        if (!response.ok) {
            throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
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

        document.getElementById('marketVolume').textContent =
            data.volume.toLocaleString('en-US', { maximumFractionDigits: 0 });

        const priceChangeEl = document.getElementById('marketPriceChange');
        priceChangeEl.textContent =
            (data.priceChangePercent >= 0 ? '+' : '') + data.priceChangePercent.toFixed(2) + '%';
        priceChangeEl.className = 'font-mono font-semibold ' +
            (data.priceChangePercent >= 0 ? 'text-green-400' : 'text-red-400');

        document.getElementById('marketTimestamp').textContent =
            new Date(data.fetchedAt).toLocaleString();
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
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    IronLedger.init();
});

// Export for global access
window.IronLedger = IronLedger;
