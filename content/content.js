(function() {
    'use strict';

    const CONFIG = {
        probabilityGapMin: 0.15,
        singlePositionMax: 0.05,
        totalExposureMax: 0.15
    };

    let speakersData = null;

    async function loadSpeakerData() {
        try {
            const response = await fetch(chrome.runtime.getURL('data/speakers.json'));
            const data = await response.json();
            speakersData = data.records;
            console.log('[Polymarket Assistant] Speaker data loaded:', speakersData.length, 'speakers');
        } catch (error) {
            console.error('[Polymarket Assistant] Failed to load speaker data:', error);
        }
    }

    function getCurrentPageType() {
        const pathname = window.location.pathname;
        
        if (pathname === '/' || pathname === '/markets') {
            return 'homepage';
        }
        if (pathname.includes('/event/') || pathname.includes('/market/')) {
            return 'market';
        }
        if (pathname.includes('/portfolio') || pathname.includes('/wallet')) {
            return 'portfolio';
        }
        return 'unknown';
    }

    function findSpeakerAndKeyword(pageText, title) {
        if (!speakersData) return null;
        
        const searchText = (pageText + ' ' + title).toLowerCase();
        
        for (const speaker of speakersData) {
            const speakerNameLower = speaker.name.toLowerCase();
            
            if (searchText.includes(speakerNameLower)) {
                for (const [keyword, data] of Object.entries(speaker.keywords)) {
                    if (searchText.includes(keyword.toLowerCase())) {
                        return {
                            speaker: speaker.name,
                            keyword: keyword,
                            data: data
                        };
                    }
                }
                
                return {
                    speaker: speaker.name,
                    keyword: null,
                    data: null
                };
            }
        }
        return null;
    }

    function getCurrentProbability() {
        const priceElements = document.querySelectorAll('[class*="price"], [class*="Probability"]');
        
        for (const el of priceElements) {
            const text = el.textContent;
            const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
            if (match) {
                return parseFloat(match[1]) / 100;
            }
        }
        
        const yesPriceEl = document.querySelector('[class*="yes"] [class*="price"], [data-testid*="yes-price"]');
        if (yesPriceEl) {
            const text = yesPriceEl.textContent;
            const match = text.match(/(\d+(?:\.\d+)?)/);
            if (match) {
                const val = parseFloat(match[1]);
                return val <= 1 ? val : val / 100;
            }
        }
        
        return null;
    }

    function createShadowContainer() {
        const container = document.createElement('div');
        container.id = 'polymarket-assistant-widget';
        
        const host = document.createElement('div');
        host.id = 'pma-shadow-host';
        host.style.all = 'initial';
        host.style.display = 'contents';
        
        document.body.appendChild(host);
        
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.appendChild(container);
        
        return { container, shadow };
    }

    function injectBaseRateWidget() {
        const titleEl = document.querySelector('h1, [class*="title"], [data-testid*="title"]');
        const title = titleEl ? titleEl.textContent : document.title;
        
        const pageText = document.body.innerText;
        const match = findSpeakerAndKeyword(pageText, title);
        
        if (!match) {
            return;
        }
        
        const currentProb = getCurrentProbability();
        
        if (!match.data && match.speaker) {
            console.log('[Polymarket Assistant] Speaker found but no keyword match:', match.speaker);
            return;
        }
        
        const { container, shadow } = createShadowContainer();
        
        const baseRate = match.data.base_rate;
        const gap = currentProb !== null ? (baseRate - currentProb) : null;
        
        let recommendation = '';
        let recommendationClass = '';
        
        if (gap !== null) {
            if (gap > CONFIG.probabilityGapMin) {
                recommendation = 'Underpriced - Good YES bet';
                recommendationClass = 'recommendation-buy';
            } else if (gap < -CONFIG.probabilityGapMin) {
                recommendation = 'Overpriced - Good NO bet';
                recommendationClass = 'recommendation-sell';
            } else {
                recommendation = 'Fairly priced';
                recommendationClass = 'recommendation-neutral';
            }
        }
        
        const gapDisplay = gap !== null ? 
            `${gap > 0 ? '+' : ''}${(gap * 100).toFixed(1)}%` : 'N/A';
        
        const gapClass = gap > 0 ? 'gap-positive' : (gap < 0 ? 'gap-negative' : 'gap-neutral');
        
        const contextsHtml = match.data.contexts ? `
            <div class="contexts">
                <div class="context-item">
                    <span class="context-label">Regular:</span>
                    <span class="context-value">${(match.data.contexts.regular.rate * 100).toFixed(0)}% (${match.data.contexts.regular.mentions}/${match.data.contexts.regular.total})</span>
                </div>
                <div class="context-item">
                    <span class="context-label">Focused:</span>
                    <span class="context-value">${(match.data.contexts.focused.rate * 100).toFixed(0)}% (${match.data.contexts.focused.mentions}/${match.data.contexts.focused.total})</span>
                </div>
            </div>
        ` : '';
        
        container.innerHTML = `
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                .widget {
                    position: fixed;
                    top: 100px;
                    right: 20px;
                    width: 320px;
                    background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 16px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    z-index: 999999;
                    overflow: hidden;
                }
                .widget-header {
                    background: linear-gradient(90deg, #6366f1, #8b5cf6);
                    padding: 16px 20px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .widget-header-icon {
                    font-size: 20px;
                }
                .widget-header-title {
                    color: white;
                    font-size: 16px;
                    font-weight: 600;
                }
                .widget-body {
                    padding: 20px;
                }
                .match-info {
                    margin-bottom: 16px;
                }
                .match-item {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .match-label {
                    color: #94a3b8;
                    font-size: 13px;
                }
                .match-value {
                    color: #e2e8f0;
                    font-size: 13px;
                    font-weight: 500;
                }
                .base-rate-section {
                    background: rgba(99, 102, 241, 0.1);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 16px;
                }
                .base-rate-main {
                    font-size: 32px;
                    font-weight: 700;
                    color: #818cf8;
                    margin-bottom: 8px;
                }
                .base-rate-details {
                    font-size: 12px;
                    color: #94a3b8;
                }
                .contexts {
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }
                .context-item {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    margin-bottom: 4px;
                }
                .context-label {
                    color: #64748b;
                }
                .context-value {
                    color: #94a3b8;
                }
                .current-market {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    margin-bottom: 16px;
                }
                .market-label {
                    color: #94a3b8;
                    font-size: 13px;
                }
                .market-value {
                    color: #e2e8f0;
                    font-size: 18px;
                    font-weight: 600;
                }
                .gap-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    margin-bottom: 16px;
                }
                .gap-label {
                    color: #94a3b8;
                    font-size: 13px;
                }
                .gap-value {
                    font-size: 20px;
                    font-weight: 700;
                }
                .gap-positive {
                    color: #34d399;
                }
                .gap-negative {
                    color: #f87171;
                }
                .gap-neutral {
                    color: #94a3b8;
                }
                .recommendation {
                    padding: 14px 16px;
                    border-radius: 10px;
                    text-align: center;
                    font-weight: 600;
                    font-size: 14px;
                }
                .recommendation-buy {
                    background: linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(16, 185, 129, 0.2));
                    color: #34d399;
                    border: 1px solid rgba(52, 211, 153, 0.3);
                }
                .recommendation-sell {
                    background: linear-gradient(135deg, rgba(248, 113, 113, 0.2), rgba(239, 68, 68, 0.2));
                    color: #f87171;
                    border: 1px solid rgba(248, 113, 113, 0.3);
                }
                .recommendation-neutral {
                    background: rgba(255, 255, 255, 0.05);
                    color: #94a3b8;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .no-data {
                    text-align: center;
                    padding: 20px;
                    color: #94a3b8;
                    font-size: 13px;
                }
            </style>
            
            <div class="widget">
                <div class="widget-header">
                    <span class="widget-header-icon">📊</span>
                    <span class="widget-header-title">Base Rate Analysis</span>
                </div>
                <div class="widget-body">
                    <div class="match-info">
                        <div class="match-item">
                            <span class="match-label">Speaker:</span>
                            <span class="match-value">${match.speaker}</span>
                        </div>
                        <div class="match-item">
                            <span class="match-label">Keyword:</span>
                            <span class="match-value">"${match.keyword}"</span>
                        </div>
                    </div>
                    
                    ${match.data ? `
                        <div class="base-rate-section">
                            <div class="base-rate-main">${(baseRate * 100).toFixed(1)}%</div>
                            <div class="base-rate-details">Base Rate (${match.data.mentions}/${match.data.total_events} events)</div>
                            ${contextsHtml}
                        </div>
                        
                        ${currentProb !== null ? `
                            <div class="current-market">
                                <span class="market-label">Current Market</span>
                                <span class="market-value">${(currentProb * 100).toFixed(1)}%</span>
                            </div>
                            
                            <div class="gap-section">
                                <span class="gap-label">Probability Gap</span>
                                <span class="gap-value ${gapClass}">${gapDisplay}</span>
                            </div>
                            
                            <div class="recommendation ${recommendationClass}">
                                ${recommendation}
                            </div>
                        ` : `
                            <div class="no-data">
                                Could not detect current market price
                            </div>
                        `}
                    ` : `
                        <div class="no-data">
                            Speaker detected but no matching keyword data
                        </div>
                    `}
                </div>
            </div>
        `;
        
        console.log('[Polymarket Assistant] Base Rate widget injected');
    }

    function injectFilterToolbar() {
        if (document.getElementById('pma-filter-toolbar')) {
            return;
        }
        
        const toolbarContainer = document.createElement('div');
        toolbarContainer.id = 'pma-filter-toolbar';
        
        const host = document.createElement('div');
        host.id = 'pma-filter-host';
        host.style.all = 'initial';
        host.style.display = 'contents';
        
        document.body.appendChild(host);
        
        const shadow = host.attachShadow({ mode: 'open' });
        
        toolbarContainer.innerHTML = `
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                .filter-toolbar {
                    position: fixed;
                    top: 60px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                    padding: 16px 24px;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                .filter-title {
                    color: #e2e8f0;
                    font-weight: 600;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .filter-group {
                    display: flex;
                    gap: 12px;
                }
                .filter-checkbox {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                }
                .filter-checkbox input {
                    width: 16px;
                    height: 16px;
                    accent-color: #6366f1;
                    cursor: pointer;
                }
                .filter-checkbox label {
                    color: #94a3b8;
                    font-size: 13px;
                    cursor: pointer;
                    user-select: none;
                }
                .filter-checkbox:hover label {
                    color: #e2e8f0;
                }
                .filter-btn {
                    padding: 8px 16px;
                    border-radius: 6px;
                    border: none;
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .filter-btn-apply {
                    background: linear-gradient(90deg, #6366f1, #8b5cf6);
                    color: white;
                }
                .filter-btn-apply:hover {
                    opacity: 0.9;
                }
                .filter-btn-reset {
                    background: rgba(255, 255, 255, 0.1);
                    color: #94a3b8;
                }
                .filter-btn-reset:hover {
                    background: rgba(255, 255, 255, 0.15);
                    color: #e2e8f0;
                }
                .filter-results {
                    color: #94a3b8;
                    font-size: 13px;
                    padding-left: 12px;
                    border-left: 1px solid rgba(255, 255, 255, 0.1);
                }
                .market-highlight {
                    outline: 2px solid #6366f1 !important;
                    outline-offset: 2px;
                    border-radius: 8px;
                }
            </style>
            
            <div class="filter-toolbar">
                <div class="filter-title">
                    <span>🔍</span>
                    <span>Strategy Filter</span>
                </div>
                <div class="filter-group">
                    <div class="filter-checkbox">
                        <input type="checkbox" id="pma-filter-gap">
                        <label for="pma-filter-gap">Gap ≥ 15%</label>
                    </div>
                    <div class="filter-checkbox">
                        <input type="checkbox" id="pma-filter-speaker">
                        <label for="pma-filter-speaker">Speaker Markets</label>
                    </div>
                    <div class="filter-checkbox">
                        <input type="checkbox" id="pma-filter-liquidity">
                        <label for="pma-filter-liquidity">High Liquidity (>$5k)</label>
                    </div>
                </div>
                <button class="filter-btn filter-btn-apply" id="pma-apply-filter">Apply</button>
                <button class="filter-btn filter-btn-reset" id="pma-reset-filter">Reset</button>
                <div class="filter-results" id="pma-filter-results"></div>
            </div>
        `;
        
        shadow.appendChild(toolbarContainer);
        
        const applyBtn = toolbarContainer.querySelector('#pma-apply-filter');
        const resetBtn = toolbarContainer.querySelector('#pma-reset-filter');
        const resultsEl = toolbarContainer.querySelector('#pma-filter-results');
        
        applyBtn.addEventListener('click', () => {
            const showGap = document.getElementById('pma-filter-gap').checked;
            const showSpeaker = document.getElementById('pma-filter-speaker').checked;
            const showLiquidity = document.getElementById('pma-filter-liquidity').checked;
            
            let count = 0;
            const marketCards = document.querySelectorAll('[class*="market"], [class*="card"]');
            
            marketCards.forEach(card => {
                card.classList.remove('market-highlight');
                
                if (!showGap && !showSpeaker && !showLiquidity) {
                    card.style.display = '';
                    return;
                }
                
                let shouldShow = false;
                
                if (showSpeaker) {
                    const text = card.textContent.toLowerCase();
                    if (speakersData) {
                        for (const speaker of speakersData) {
                            if (text.includes(speaker.name.toLowerCase())) {
                                shouldShow = true;
                                break;
                            }
                        }
                    }
                }
                
                if (showLiquidity) {
                    const liquidityEl = card.querySelector('[class*="liquidity"], [class*="volume"]');
                    if (liquidityEl) {
                        const match = liquidityEl.textContent.match(/\$?([\d,]+)/);
                        if (match) {
                            const value = parseFloat(match[1].replace(/,/g, ''));
                            if (value >= 5000) shouldShow = true;
                        }
                    }
                }
                
                if (showGap) {
                    shouldShow = true;
                }
                
                if (shouldShow) {
                    card.classList.add('market-highlight');
                    count++;
                } else {
                    card.style.display = 'none';
                }
            });
            
            resultsEl.textContent = count > 0 ? `Found: ${count} markets` : '';
        });
        
        resetBtn.addEventListener('click', () => {
            document.getElementById('pma-filter-gap').checked = false;
            document.getElementById('pma-filter-speaker').checked = false;
            document.getElementById('pma-filter-liquidity').checked = false;
            resultsEl.textContent = '';
            
            document.querySelectorAll('.market-highlight').forEach(el => {
                el.classList.remove('market-highlight');
                el.style.display = '';
            });
        });
        
        console.log('[Polymarket Assistant] Filter toolbar injected');
    }

    function injectRiskDashboard() {
        if (document.getElementById('pma-risk-dashboard')) {
            return;
        }
        
        const dashboardContainer = document.createElement('div');
        dashboardContainer.id = 'pma-risk-dashboard';
        
        const host = document.createElement('div');
        host.id = 'pma-risk-host';
        host.style.all = 'initial';
        host.style.display = 'contents';
        
        document.body.appendChild(host);
        
        const shadow = host.attachShadow({ mode: 'open' });
        
        dashboardContainer.innerHTML = `
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                .dashboard {
                    position: fixed;
                    top: 100px;
                    right: 20px;
                    width: 340px;
                    background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
                    border-radius: 16px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    z-index: 999999;
                    overflow: hidden;
                }
                .dashboard-header {
                    background: linear-gradient(90deg, #10b981, #059669);
                    padding: 16px 20px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .dashboard-title {
                    color: white;
                    font-size: 16px;
                    font-weight: 600;
                }
                .dashboard-body {
                    padding: 20px;
                }
                .balance-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .balance-label {
                    color: #94a3b8;
                    font-size: 13px;
                }
                .balance-value {
                    color: #e2e8f0;
                    font-size: 24px;
                    font-weight: 700;
                }
                .exposure-section {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                    padding: 14px 16px;
                    margin-bottom: 20px;
                }
                .exposure-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .exposure-label {
                    color: #94a3b8;
                    font-size: 13px;
                }
                .exposure-value {
                    font-size: 16px;
                    font-weight: 600;
                }
                .exposure-warning {
                    color: #f59e0b;
                }
                .exposure-danger {
                    color: #ef4444;
                }
                .exposure-safe {
                    color: #34d399;
                }
                .positions-title {
                    color: #e2e8f0;
                    font-size: 14px;
                    font-weight: 600;
                    margin-bottom: 12px;
                }
                .position-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 12px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                    margin-bottom: 8px;
                }
                .position-name {
                    color: #e2e8f0;
                    font-size: 13px;
                }
                .position-details {
                    text-align: right;
                }
                .position-amount {
                    color: #94a3b8;
                    font-size: 12px;
                }
                .position-percent {
                    font-size: 14px;
                    font-weight: 600;
                }
                .position-safe { color: #34d399; }
                .position-warning { color: #f59e0b; }
                .position-danger { color: #ef4444; }
                .alert-box {
                    background: rgba(245, 158, 11, 0.15);
                    border: 1px solid rgba(245, 158, 11, 0.3);
                    border-radius: 8px;
                    padding: 12px;
                    margin-top: 16px;
                    color: #fbbf24;
                    font-size: 13px;
                }
                .alert-box.danger {
                    background: rgba(239, 68, 68, 0.15);
                    border-color: rgba(239, 68, 68, 0.3);
                    color: #f87171;
                }
                .no-positions {
                    text-align: center;
                    color: #64748b;
                    font-size: 13px;
                    padding: 20px;
                }
            </style>
            
            <div class="dashboard">
                <div class="dashboard-header">
                    <span>💰</span>
                    <span class="dashboard-title">Portfolio Risk Dashboard</span>
                </div>
                <div class="dashboard-body">
                    <div class="balance-section">
                        <span class="balance-label">Total Balance</span>
                        <span class="balance-value">$0.00</span>
                    </div>
                    
                    <div class="exposure-section">
                        <div class="exposure-header">
                            <span class="exposure-label">Risk Exposure</span>
                            <span class="exposure-value exposure-safe">$0.00 (0%)</span>
                        </div>
                    </div>
                    
                    <div class="positions-title">Active Positions</div>
                    <div class="no-positions">
                        Connect wallet to view positions
                    </div>
                </div>
            </div>
        `;
        
        shadow.appendChild(dashboardContainer);
        
        console.log('[Polymarket Assistant] Risk dashboard injected');
    }

    function initialize() {
        console.log('[Polymarket Assistant] Initializing...');
        
        loadSpeakerData().then(() => {
            const pageType = getCurrentPageType();
            console.log('[Polymarket Assistant] Page type:', pageType);
            
            if (pageType === 'market') {
                setTimeout(injectBaseRateWidget, 1500);
            } else if (pageType === 'homepage') {
                setTimeout(injectFilterToolbar, 1500);
            } else if (pageType === 'portfolio') {
                setTimeout(injectRiskDashboard, 1500);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    window.addEventListener('popstate', () => {
        setTimeout(() => {
            const pageType = getCurrentPageType();
            if (pageType === 'market') {
                injectBaseRateWidget();
            } else if (pageType === 'homepage') {
                injectFilterToolbar();
            } else if (pageType === 'portfolio') {
                injectRiskDashboard();
            }
        }, 1000);
    });

})();
