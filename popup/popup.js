const UPDATE_INTERVAL_MS = 30000;
const DEFAULT_GAP = 0.15;

const state = {
    markets: [],
    alerts: [],
    chartData: [],
    lastUpdate: null,
    chartRange: 30
};

document.addEventListener('DOMContentLoaded', () => {
    initialize().catch((error) => {
        console.error('[Popup] Failed to initialize:', error);
    });
});

/**
 * Initialize popup UI, data, and recurring refresh.
 */
async function initialize() {
    loadSettings();
    await Promise.all([loadChartData(), loadAlerts()]);
    seedMarkets();
    updateMarketPanel();
    updateStrategyPanel();
    updatePositions();
    updateChart();
    runRiskCalculator();
    setupEventListeners();
    scheduleRefresh();
}

/**
 * Schedule live refresh cycle.
 */
function scheduleRefresh() {
    setInterval(() => {
        refreshLiveData();
    }, UPDATE_INTERVAL_MS);
}

/**
 * Refresh all live panels in the popup.
 */
function refreshLiveData() {
    jitterMarkets();
    updateMarketPanel();
    updateStrategyPanel();
    updatePositions();
    updateChart();
    checkAlerts();
}

function loadSettings() {
    chrome.storage.local.get(['probabilityGap', 'notifications'], (result) => {
        const gapSelect = document.getElementById('probability-gap');
        const notificationsToggle = document.getElementById('notifications');
        if (result.probabilityGap) {
            gapSelect.value = result.probabilityGap;
        }
        if (result.notifications !== undefined) {
            notificationsToggle.checked = result.notifications;
        }
    });
}

function setupEventListeners() {
    document.getElementById('probability-gap').addEventListener('change', (event) => {
        chrome.storage.local.set({ probabilityGap: event.target.value });
        updateStrategyPanel();
    });

    document.getElementById('notifications').addEventListener('change', (event) => {
        chrome.storage.local.set({ notifications: event.target.checked });
    });

    document.getElementById('open-dashboard').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://polymarket.com' });
    });

    document.getElementById('refresh-data').addEventListener('click', () => {
        refreshLiveData();
    });

    document.getElementById('help-link').addEventListener('click', () => {
        alert('Polymarket Strategy Suite v2.0.0\n\nWhat\'s new:\n• Real-time market pulse\n• Strategy recommender\n• Risk calculator + Kelly sizing\n• Price momentum charts\n• Position tracker + alerts (beta)');
    });

    document.getElementById('calc-run').addEventListener('click', () => {
        runRiskCalculator();
    });

    document.getElementById('chart-range').addEventListener('change', (event) => {
        state.chartRange = Number(event.target.value);
        updateChart();
    });

    document.getElementById('alert-add').addEventListener('click', () => {
        addAlertFromForm();
    });
}

/**
 * Seed demo market data for the live panel.
 */
function seedMarkets() {
    state.markets = [
        {
            id: 'eth-direction',
            name: 'ETH Up or Down? (24h)',
            price: 0.523,
            change: 0.021,
            volume: 125000,
            positions: 1200,
            baseRate: 0.63
        },
        {
            id: 'trump-crypto',
            name: 'Trump mention crypto?',
            price: 0.357,
            change: -0.052,
            volume: 89000,
            positions: 890,
            baseRate: 0.44
        },
        {
            id: 'fed-cut',
            name: 'Fed cut before Q3?',
            price: 0.612,
            change: 0.008,
            volume: 64000,
            positions: 760,
            baseRate: 0.58
        }
    ];
}

/**
 * Apply small random changes to simulate real-time updates.
 */
function jitterMarkets() {
    state.markets = state.markets.map((market) => {
        const delta = (Math.random() - 0.5) * 0.02;
        const newPrice = Math.min(0.99, Math.max(0.01, market.price + delta));
        const change = clamp(market.change + delta, -0.2, 0.2);
        return {
            ...market,
            price: newPrice,
            change,
            volume: Math.max(1000, Math.round(market.volume * (0.98 + Math.random() * 0.05)))
        };
    });
    state.lastUpdate = new Date();
}

function updateMarketPanel() {
    const listEl = document.getElementById('market-list');
    listEl.innerHTML = '';

    state.markets.forEach((market) => {
        const row = document.createElement('div');
        row.className = 'market-row';

        const changeClass = market.change >= 0 ? 'positive' : 'negative';
        row.innerHTML = `
            <div>
                <div class="market-title">${market.name}</div>
                <div class="market-meta">Volume $${formatNumber(market.volume)} · Positions ${formatNumber(market.positions)}</div>
            </div>
            <div>
                <div class="market-price">${(market.price * 100).toFixed(1)}%</div>
                <div class="market-meta">Last 24h</div>
            </div>
            <div>
                <div class="market-change ${changeClass}">${market.change >= 0 ? '+' : ''}${(market.change * 100).toFixed(1)}%</div>
                <div class="market-meta">Momentum</div>
            </div>
        `;

        listEl.appendChild(row);
    });

    updateLastUpdated();
    populateAlertMarketOptions();
    if (state.alerts.length) {
        renderAlerts();
    }
}

function updateLastUpdated() {
    const label = document.getElementById('last-updated');
    if (!state.lastUpdate) {
        label.textContent = 'Updated just now';
        return;
    }
    label.textContent = `Updated ${state.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Update strategy recommender output.
 */
function updateStrategyPanel() {
    const gapSelect = document.getElementById('probability-gap');
    const minGap = parseFloat(gapSelect.value || DEFAULT_GAP);
    const primaryMarket = state.markets[0];

    if (!primaryMarket) {
        return;
    }

    const analysis = analyzeMarket(primaryMarket, minGap);

    document.getElementById('strategy-direction').textContent = analysis.direction;
    document.getElementById('strategy-confidence').textContent = `Confidence ${(analysis.confidence * 100).toFixed(0)}%`;
    document.getElementById('strategy-risk').textContent = analysis.risk;
    document.getElementById('strategy-risk').style.color = analysis.riskColor;
    document.getElementById('strategy-edge').textContent = `${analysis.edge >= 0 ? '+' : ''}${(analysis.edge * 100).toFixed(1)}%`;
    document.getElementById('strategy-edge').style.color = analysis.edge >= 0 ? '#38ef7d' : '#f87171';

    const signalsEl = document.getElementById('strategy-signals');
    signalsEl.innerHTML = '';
    analysis.signals.forEach((signal) => {
        const row = document.createElement('div');
        row.className = 'signal-row';
        row.innerHTML = `<span>${signal.label}</span><strong>${signal.value}</strong>`;
        signalsEl.appendChild(row);
    });

    document.getElementById('strategy-recommendation').textContent = analysis.summary;
}

/**
 * Analyze a market and return strategy summary.
 * @param {Object} market Market data
 * @param {number} minGap Minimum base rate gap for signal
 */
function analyzeMarket(market, minGap) {
    const baseRateGap = market.baseRate - market.price;
    const momentum = market.change;

    const signals = [
        { label: 'Base Rate Gap', value: `${baseRateGap >= 0 ? '+' : ''}${(baseRateGap * 100).toFixed(1)}%` },
        { label: 'Momentum (24h)', value: `${momentum >= 0 ? '+' : ''}${(momentum * 100).toFixed(1)}%` },
        { label: 'Liquidity', value: `$${formatNumber(market.volume)}` }
    ];

    let direction = 'HOLD';
    let confidence = 0.55;
    if (baseRateGap > minGap) {
        direction = 'YES';
        confidence += 0.2;
    } else if (baseRateGap < -minGap) {
        direction = 'NO';
        confidence += 0.2;
    }

    if (momentum > 0.015) {
        confidence += 0.1;
    }
    if (momentum < -0.015) {
        confidence -= 0.1;
    }

    const risk = baseRateGap >= 0.15 ? 'LOW' : baseRateGap >= 0.08 ? 'MEDIUM' : 'HIGH';
    const riskColor = risk === 'LOW' ? '#38ef7d' : risk === 'MEDIUM' ? '#fbbf24' : '#f87171';

    return {
        direction,
        confidence: Math.max(0.4, Math.min(0.92, confidence)),
        risk,
        riskColor,
        edge: baseRateGap,
        signals,
        summary: `Recommended ${direction} with ${risk} risk. Best used with tight position sizing.`
    };
}

/**
 * Run the risk calculator using input values.
 */
function runRiskCalculator() {
    const probability = clamp(Number(document.getElementById('calc-probability').value) / 100, 0.01, 0.99);
    const price = clamp(Number(document.getElementById('calc-price').value) / 100, 0.01, 0.99);
    const investment = Math.max(1, Number(document.getElementById('calc-investment').value));

    const payoutMultiple = 1 / price;
    const winAmount = investment * (payoutMultiple - 1);
    const loseAmount = investment;
    const expectedValue = probability * winAmount - (1 - probability) * loseAmount;

    const kelly = (probability * payoutMultiple - 1) / (payoutMultiple - 1);
    const kellyPercent = Math.max(0, kelly) * 100;

    const edge = probability - price;
    const riskLevel = edge >= 0.2 ? 'LOW' : edge >= 0.1 ? 'MEDIUM' : 'HIGH';

    document.getElementById('calc-win').textContent = `$${winAmount.toFixed(2)}`;
    document.getElementById('calc-loss').textContent = `$${loseAmount.toFixed(2)}`;
    document.getElementById('calc-ev').textContent = `${expectedValue >= 0 ? '+' : ''}$${expectedValue.toFixed(2)}`;
    document.getElementById('calc-kelly').textContent = `${kellyPercent.toFixed(1)}%`;
    document.getElementById('calc-risk').textContent = riskLevel;
    document.getElementById('calc-risk').style.color = riskLevel === 'LOW' ? '#38ef7d' : riskLevel === 'MEDIUM' ? '#fbbf24' : '#f87171';
}

function updatePositions() {
    const positions = [
        { name: 'ETH Up', allocation: 0.65, pnl: 0.18 },
        { name: 'Trump Crypto', allocation: 0.24, pnl: -0.05 },
        { name: 'Fed Cut', allocation: 0.11, pnl: 0.12 }
    ];

    const totalInvested = 1234.56;
    const totalValue = totalInvested * (1 + positions.reduce((acc, p) => acc + p.allocation * p.pnl, 0));
    const totalPnl = (totalValue - totalInvested) / totalInvested;

    document.getElementById('position-total').textContent = `$${totalInvested.toFixed(2)}`;
    document.getElementById('position-value').textContent = `$${totalValue.toFixed(2)}`;
    document.getElementById('position-pnl').textContent = `${totalPnl >= 0 ? '+' : ''}${(totalPnl * 100).toFixed(1)}%`;

    const listEl = document.getElementById('position-list');
    listEl.innerHTML = '';
    positions.forEach((position) => {
        const row = document.createElement('div');
        row.className = 'position-row';
        const pnlLabel = `${position.pnl >= 0 ? '+' : ''}${(position.pnl * 100).toFixed(1)}%`;
        row.innerHTML = `
            <span>${position.name} · ${(position.allocation * 100).toFixed(0)}%</span>
            <span style="color: ${position.pnl >= 0 ? '#38ef7d' : '#f87171'}">${pnlLabel}</span>
        `;
        listEl.appendChild(row);
    });
}

/**
 * Load historical chart data from packaged JSON.
 */
async function loadChartData() {
    try {
        const response = await fetch(chrome.runtime.getURL('data/eth_historical.json'));
        const data = await response.json();
        state.chartData = data.records || [];
    } catch (error) {
        console.error('[Popup] Failed to load chart data:', error);
        state.chartData = [];
    }
}

/**
 * Render the price chart and tooltip interactions.
 */
function updateChart() {
    const canvas = document.getElementById('price-chart');
    const tooltip = document.getElementById('chart-tooltip');

    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const slice = state.chartData.slice(0, state.chartRange).reverse();
    if (slice.length === 0) {
        ctx.fillStyle = '#a0aec0';
        ctx.fillText('No data', 10, 20);
        return;
    }

    const prices = slice.map((row) => row.price_end);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    const padding = 10;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i += 1) {
        const y = padding + (chartHeight / 4) * i;
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
    }
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, padding, 0, canvas.height - padding);
    gradient.addColorStop(0, 'rgba(102, 126, 234, 0.5)');
    gradient.addColorStop(1, 'rgba(102, 126, 234, 0)');

    ctx.beginPath();
    const step = slice.length > 1 ? chartWidth / (slice.length - 1) : 0;
    slice.forEach((row, index) => {
        const x = padding + step * index;
        const y = padding + chartHeight - ((row.price_end - min) / (max - min || 1)) * chartHeight;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    canvas.onmousemove = (event) => {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const index = slice.length > 1 ? Math.round((x - padding) / step) : 0;
        const clampedIndex = Math.max(0, Math.min(slice.length - 1, index));
        const row = slice[clampedIndex];
        tooltip.textContent = `${row.date} · $${row.price_end.toFixed(2)}`;
        tooltip.classList.add('active');
    };

    canvas.onmouseleave = () => {
        tooltip.classList.remove('active');
    };
}

async function loadAlerts() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['priceAlerts'], (result) => {
            state.alerts = result.priceAlerts || [];
            renderAlerts();
            resolve();
        });
    });
}

function populateAlertMarketOptions() {
    const select = document.getElementById('alert-market');
    if (!select) return;

    select.innerHTML = '';
    state.markets.forEach((market) => {
        const option = document.createElement('option');
        option.value = market.id;
        option.textContent = market.name;
        select.appendChild(option);
    });
}

function addAlertFromForm() {
    const marketId = document.getElementById('alert-market').value;
    const condition = document.getElementById('alert-condition').value;
    const price = Number(document.getElementById('alert-price').value) / 100;

    if (!marketId || !price) return;

    state.alerts.push({
        id: `${marketId}-${Date.now()}`,
        marketId,
        condition,
        price,
        active: true
    });

    saveAlerts();
    renderAlerts();
}

function renderAlerts() {
    const list = document.getElementById('alert-list');
    list.innerHTML = '';

    if (state.alerts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'alert-row';
        empty.textContent = 'No alerts yet.';
        list.appendChild(empty);
        return;
    }

    state.alerts.forEach((alert) => {
        const market = state.markets.find((item) => item.id === alert.marketId);
        const row = document.createElement('div');
        row.className = 'alert-row';
        row.innerHTML = `
            <span>${market ? market.name : 'Market'}</span>
            <span>${alert.condition}</span>
            <span>${(alert.price * 100).toFixed(1)}%</span>
            <button data-id="${alert.id}">✕</button>
        `;
        row.querySelector('button').addEventListener('click', () => {
            state.alerts = state.alerts.filter((item) => item.id !== alert.id);
            saveAlerts();
            renderAlerts();
        });
        list.appendChild(row);
    });
}

function saveAlerts() {
    chrome.storage.local.set({ priceAlerts: state.alerts });
}

function checkAlerts() {
    chrome.storage.local.get(['notifications'], (result) => {
        const notificationsEnabled = result.notifications !== false;

        state.alerts.forEach((alert) => {
            if (!alert.active) return;
            const market = state.markets.find((item) => item.id === alert.marketId);
            if (!market) return;

            const hit = alert.condition === '>=' ? market.price >= alert.price : market.price <= alert.price;
            if (hit && notificationsEnabled) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: 'Polymarket Alert',
                    message: `${market.name} hit ${(market.price * 100).toFixed(1)}%`
                });
                alert.active = false;
            }
        });

        saveAlerts();
        renderAlerts();
    });
}

function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
