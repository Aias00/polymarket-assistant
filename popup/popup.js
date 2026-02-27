const UPDATE_INTERVAL_MS = 30000;
const CHART_REFRESH_MS = 10 * 60 * 1000;
const HOT_MARKET_COUNT = 6;
const GAMMA_MARKETS_ENDPOINT = 'https://gamma-api.polymarket.com/markets';
const ETH_CHART_ENDPOINT = 'https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=90&interval=daily';

const state = {
    markets: [],
    chartData: [],
    lastUpdate: null,
    lastChartUpdate: null,
    chartRange: 30,
    lastError: null
};

document.addEventListener('DOMContentLoaded', () => {
    initialize().catch((error) => {
        console.error('[Popup] Failed to initialize:', error);
        setLiveStatus('STALE');
    });
});

/**
 * Initialize popup UI, data, and recurring refresh.
 */
async function initialize() {
    setupEventListeners();
    await refreshLiveData({ forceChart: true });
    scheduleRefresh();
}

/**
 * Schedule live refresh cycle.
 */
function scheduleRefresh() {
    setInterval(() => {
        refreshLiveData().catch((error) => {
            console.error('[Popup] Refresh failed:', error);
        });
    }, UPDATE_INTERVAL_MS);
}

/**
 * Refresh all live panels in the popup.
 */
async function refreshLiveData(options = {}) {
    const { forceChart = false } = options;
    setLiveStatus('SYNC');

    try {
        await loadMarkets();

        if (forceChart || shouldRefreshChart()) {
            await loadChartData();
        }

        state.lastUpdate = new Date();
        state.lastError = null;

        updateMarketPanel();
        updateChart();

        setLiveStatus('LIVE');
    } catch (error) {
        console.error('[Popup] Failed to refresh live data:', error);
        state.lastError = error.message || 'Live market fetch failed';

        updateMarketPanel();
        updateChart();

        setLiveStatus('STALE');
    }
}

function shouldRefreshChart() {
    return !state.lastChartUpdate || (Date.now() - state.lastChartUpdate) > CHART_REFRESH_MS;
}

function setLiveStatus(status) {
    const indicator = document.getElementById('live-indicator');
    if (!indicator) {
        return;
    }

    indicator.textContent = status;

    if (status === 'LIVE') {
        indicator.style.color = '#38ef7d';
        return;
    }

    if (status === 'SYNC') {
        indicator.style.color = '#fbbf24';
        return;
    }

    indicator.style.color = '#f87171';
}

function setupEventListeners() {
    document.getElementById('open-dashboard').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://polymarket.com' });
    });

    document.getElementById('refresh-data').addEventListener('click', async () => {
        await refreshLiveData({ forceChart: true });
    });

    document.getElementById('chart-range').addEventListener('change', (event) => {
        state.chartRange = Number(event.target.value);
        updateChart();
    });
}

async function loadMarkets() {
    const query = '?closed=false&active=true&limit=50';
    const response = await fetch(`${GAMMA_MARKETS_ENDPOINT}${query}`);

    if (!response.ok) {
        throw new Error(`Gamma API ${response.status}`);
    }

    const payload = await response.json();
    const marketList = Array.isArray(payload) ? payload : (Array.isArray(payload.data) ? payload.data : null);

    if (!marketList) {
        throw new Error('Unexpected Gamma API payload');
    }

    const normalized = marketList
        .map((market) => normalizeMarket(market))
        .filter((market) => market !== null)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, HOT_MARKET_COUNT);

    if (normalized.length === 0) {
        throw new Error('No active market records returned');
    }

    state.markets = normalized;
}

function normalizeMarket(rawMarket) {
    const outcomes = parseArrayField(rawMarket.outcomes);
    const outcomePrices = parseArrayField(rawMarket.outcomePrices)
        .map((value) => safeNumber(value))
        .filter((value) => value !== null);

    const yesIndex = findYesOutcomeIndex(outcomes);

    const probability = normalizeProbability(firstNumber(
        rawMarket.lastTradePrice,
        rawMarket.bestAsk,
        rawMarket.bestBid,
        outcomePrices[yesIndex],
        outcomePrices[0]
    ));

    if (probability === null) {
        return null;
    }

    const marketName = String(rawMarket.question || rawMarket.title || rawMarket.slug || '').trim();
    if (!marketName) {
        return null;
    }

    const change24h = normalizePercent(firstNumber(
        rawMarket.oneDayPriceChange,
        rawMarket.priceChange24h,
        rawMarket.oneHourPriceChange,
        0
    ));

    const volume24h = firstNumber(rawMarket.volume24hr, rawMarket.volume24Hour, rawMarket.volume, 0);
    const liquidity = firstNumber(rawMarket.liquidityClob, rawMarket.liquidity, 0);

    return {
        id: String(rawMarket.id || rawMarket.conditionId || rawMarket.slug || marketName),
        name: marketName,
        slug: rawMarket.slug || '',
        url: resolveMarketUrl(rawMarket, marketName),
        price: probability,
        change: change24h || 0,
        volume: volume24h || 0,
        liquidity: liquidity || 0
    };
}

function parseArrayField(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_error) {
            return [];
        }
    }

    return [];
}

function findYesOutcomeIndex(outcomes) {
    const index = outcomes.findIndex((outcome) => String(outcome).toLowerCase().trim() === 'yes');
    return index >= 0 ? index : 0;
}

function firstNumber(...candidates) {
    for (const candidate of candidates) {
        const parsed = safeNumber(candidate);
        if (parsed !== null) {
            return parsed;
        }
    }

    return null;
}

function firstString(...candidates) {
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }

    return null;
}

function resolveMarketUrl(rawMarket, marketName) {
    const directUrl = normalizePolymarketUrl(firstString(rawMarket.url, rawMarket.marketUrl, rawMarket.href));
    if (directUrl) {
        return directUrl;
    }

    const firstEvent = Array.isArray(rawMarket.events) ? rawMarket.events[0] : null;
    const eventSlug = firstString(rawMarket.eventSlug, firstEvent && firstEvent.slug);
    if (eventSlug) {
        return `https://polymarket.com/event/${eventSlug}`;
    }

    const marketSlug = firstString(rawMarket.slug, rawMarket.marketSlug);
    if (marketSlug) {
        return `https://polymarket.com/event/${marketSlug}`;
    }

    return `https://polymarket.com/?search=${encodeURIComponent(marketName)}`;
}

function normalizePolymarketUrl(value) {
    if (!value) {
        return null;
    }

    if (value.startsWith('https://') || value.startsWith('http://')) {
        return value;
    }

    if (value.startsWith('/')) {
        return `https://polymarket.com${value}`;
    }

    return null;
}

function safeNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProbability(value) {
    if (value === null) {
        return null;
    }

    if (value > 1) {
        return clamp(value / 100, 0, 1);
    }

    if (value < 0) {
        return null;
    }

    return clamp(value, 0, 1);
}

function normalizePercent(value) {
    if (value === null) {
        return null;
    }

    const normalized = Math.abs(value) > 1 ? value / 100 : value;
    return clamp(normalized, -1, 1);
}

function updateMarketPanel() {
    const listEl = document.getElementById('market-list');
    listEl.innerHTML = '';

    if (!state.markets.length) {
        const empty = document.createElement('div');
        empty.className = 'market-row';
        empty.innerHTML = `<div><div class="market-title">No live market data</div><div class="market-meta">${state.lastError || 'Please refresh to retry.'}</div></div>`;
        listEl.appendChild(empty);
        updateLastUpdated();
        return;
    }

    state.markets.forEach((market) => {
        const row = document.createElement('div');
        row.className = 'market-row';
        if (market.url) {
            row.classList.add('market-row-link');
            row.setAttribute('role', 'button');
            row.setAttribute('tabindex', '0');
            row.setAttribute('aria-label', `Open market: ${market.name}`);
            row.addEventListener('click', () => {
                openMarketDetail(market.url);
            });
            row.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openMarketDetail(market.url);
                }
            });
        }

        const changeClass = market.change >= 0 ? 'positive' : 'negative';
        row.innerHTML = `
            <div>
                <div class="market-title">${market.name}</div>
                <div class="market-meta">Volume $${formatNumber(market.volume)} · Liquidity $${formatNumber(market.liquidity)}</div>
            </div>
            <div>
                <div class="market-price">${(market.price * 100).toFixed(1)}%</div>
                <div class="market-meta">Last trade</div>
            </div>
            <div>
                <div class="market-change ${changeClass}">${market.change >= 0 ? '+' : ''}${(market.change * 100).toFixed(1)}%</div>
                <div class="market-meta">24h change</div>
            </div>
        `;

        listEl.appendChild(row);
    });

    updateLastUpdated();
}

function openMarketDetail(url) {
    chrome.tabs.create({ url });
}

function updateLastUpdated() {
    const label = document.getElementById('last-updated');

    if (!state.lastUpdate) {
        label.textContent = state.lastError ? 'Data unavailable' : 'Updated just now';
        return;
    }

    label.textContent = `Updated ${state.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Load historical chart data from live ETH market endpoint.
 */
async function loadChartData() {
    try {
        const response = await fetch(ETH_CHART_ENDPOINT);
        if (!response.ok) {
            throw new Error(`CoinGecko ${response.status}`);
        }

        const data = await response.json();
        if (!Array.isArray(data.prices)) {
            throw new Error('Unexpected CoinGecko payload');
        }

        state.chartData = data.prices
            .map((row) => {
                const timestamp = Array.isArray(row) ? row[0] : null;
                const price = Array.isArray(row) ? Number(row[1]) : null;

                if (!Number.isFinite(timestamp) || !Number.isFinite(price)) {
                    return null;
                }

                return {
                    date: formatChartDate(timestamp),
                    price_end: price
                };
            })
            .filter((row) => row !== null)
            .reverse();

        state.lastChartUpdate = Date.now();
    } catch (error) {
        console.error('[Popup] Failed to load live chart data, falling back to local JSON:', error);
        await loadChartDataFromLocal();
        state.lastChartUpdate = Date.now();
    }
}

async function loadChartDataFromLocal() {
    const response = await fetch(chrome.runtime.getURL('data/eth_historical.json'));
    const data = await response.json();
    state.chartData = Array.isArray(data.records) ? data.records : [];
}

function formatChartDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit'
    });
}

/**
 * Render the price chart and tooltip interactions.
 */
function updateChart() {
    const canvas = document.getElementById('price-chart');
    const tooltip = document.getElementById('chart-tooltip');

    if (!canvas) {
        return;
    }

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

function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
