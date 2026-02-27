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

    function formatPercent(value) {
        return `${(value * 100).toFixed(1)}%`;
    }

    /**
     * Summarize market strategy based on base rate gap.
     */
    function getStrategySummary(baseRate, currentProb, minGap) {
        if (currentProb === null || baseRate === null) {
            return {
                direction: 'HOLD',
                confidence: 0.5,
                risk: 'MEDIUM',
                edge: 0,
                signals: [
                    { label: 'Base Rate Gap', value: 'N/A' },
                    { label: 'Momentum', value: 'N/A' }
                ]
            };
        }

        const gap = baseRate - currentProb;
        let direction = 'HOLD';
        let confidence = 0.55;

        if (gap > minGap) {
            direction = 'YES';
            confidence += 0.2;
        } else if (gap < -minGap) {
            direction = 'NO';
            confidence += 0.2;
        }

        const risk = Math.abs(gap) >= 0.2 ? 'LOW' : Math.abs(gap) >= 0.1 ? 'MEDIUM' : 'HIGH';

        return {
            direction,
            confidence: Math.min(0.9, Math.max(0.4, confidence)),
            risk,
            edge: gap,
            signals: [
                { label: 'Base Rate Gap', value: `${gap >= 0 ? '+' : ''}${formatPercent(gap)}` },
                { label: 'Market Price', value: formatPercent(currentProb) }
            ]
        };
    }

    /**
     * Calculate risk metrics using Kelly criterion.
     */
    function calculateRisk(probability, price, investment) {
        const payoutMultiple = 1 / price;
        const winAmount = investment * (payoutMultiple - 1);
        const expectedValue = probability * winAmount - (1 - probability) * investment;
        const kelly = (probability * payoutMultiple - 1) / (payoutMultiple - 1);
        const kellyPercent = Math.max(0, kelly) * 100;
        const edge = probability - price;
        const risk = edge >= 0.2 ? 'LOW' : edge >= 0.1 ? 'MEDIUM' : 'HIGH';

        return {
            winAmount,
            expectedValue,
            kellyPercent,
            risk
        };
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
        
        const strategy = getStrategySummary(baseRate, currentProb, CONFIG.probabilityGapMin);

        const riskSectionHtml = currentProb !== null ? `
            <div class="risk-section">
                <div class="risk-row"><span>Risk Calculator</span><strong id="pma-risk-level">--</strong></div>
                <div class="risk-form">
                    <input class="risk-input" id="pma-risk-prob" type="number" min="1" max="99" value="${(currentProb * 100).toFixed(0)}">
                    <input class="risk-input" id="pma-risk-price" type="number" min="1" max="99" value="${(currentProb * 100).toFixed(0)}">
                    <input class="risk-input" id="pma-risk-invest" type="number" min="1" value="100">
                </div>
                <button class="risk-button" id="pma-risk-run">Calculate</button>
                <div class="risk-row"><span>Potential Profit</span><strong id="pma-risk-win">$0.00</strong></div>
                <div class="risk-row"><span>Expected Value</span><strong id="pma-risk-ev">$0.00</strong></div>
                <div class="risk-row"><span>Kelly Position</span><strong id="pma-risk-kelly">0%</strong></div>
            </div>
        ` : '';

        container.innerHTML = `
            <style>
                :host {
                    --bg-primary: #0a0e27;
                    --bg-secondary: #1a1f3a;
                    --bg-card: #1e2442;
                    --gradient-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    --gradient-success: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                    --gradient-danger: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
                    --text-primary: #ffffff;
                    --text-secondary: #a0aec0;
                    --text-muted: #718096;
                    --border-color: #2d3748;
                }
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                .widget {
                    position: fixed;
                    top: 96px;
                    right: 20px;
                    width: 340px;
                    background: linear-gradient(145deg, #1e2442, #151a30);
                    border-radius: 16px;
                    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.06);
                    font-family: \"Space Grotesk\", \"IBM Plex Sans\", \"Manrope\", \"Segoe UI\", sans-serif;
                    z-index: 999999;
                    overflow: hidden;
                    color: var(--text-primary);
                }
                .widget-header {
                    background: var(--gradient-primary);
                    padding: 16px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .widget-header-title {
                    font-size: 16px;
                    font-weight: 600;
                }
                .live-pill {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #38ef7d;
                    animation: pulse 2s infinite;
                }
                .widget-body {
                    padding: 18px 20px 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                }
                .match-info {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }
                .match-item {
                    background: rgba(255, 255, 255, 0.04);
                    border-radius: 10px;
                    padding: 10px 12px;
                }
                .match-label {
                    color: var(--text-muted);
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.8px;
                }
                .match-value {
                    color: var(--text-primary);
                    font-size: 13px;
                    font-weight: 600;
                    margin-top: 6px;
                }
                .base-rate-section {
                    background: rgba(102, 126, 234, 0.12);
                    border-radius: 12px;
                    padding: 14px;
                    border: 1px solid rgba(102, 126, 234, 0.3);
                }
                .base-rate-main {
                    font-size: 28px;
                    font-weight: 700;
                    color: #c3d0ff;
                }
                .base-rate-details {
                    font-size: 12px;
                    color: var(--text-secondary);
                    margin-top: 6px;
                }
                .contexts {
                    margin-top: 10px;
                    padding-top: 10px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    display: grid;
                    gap: 6px;
                }
                .context-item {
                    display: flex;
                    justify-content: space-between;
                    font-size: 11px;
                }
                .context-label {
                    color: var(--text-muted);
                }
                .context-value {
                    color: var(--text-secondary);
                }
                .snapshot {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 10px;
                }
                .snapshot-card {
                    background: rgba(255, 255, 255, 0.04);
                    border-radius: 10px;
                    padding: 10px 12px;
                }
                .snapshot-label {
                    font-size: 11px;
                    color: var(--text-muted);
                }
                .snapshot-value {
                    font-size: 16px;
                    font-weight: 600;
                    margin-top: 4px;
                }
                .gap-positive {
                    color: #38ef7d;
                }
                .gap-negative {
                    color: #f87171;
                }
                .strategy-section {
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 12px;
                    padding: 12px;
                }
                .strategy-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .strategy-title {
                    font-size: 13px;
                    font-weight: 600;
                }
                .strategy-pill {
                    padding: 4px 10px;
                    border-radius: 999px;
                    font-size: 11px;
                    font-weight: 600;
                    background: var(--gradient-success);
                }
                .strategy-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                }
                .strategy-item {
                    font-size: 11px;
                    color: var(--text-secondary);
                    background: rgba(255, 255, 255, 0.04);
                    border-radius: 8px;
                    padding: 8px;
                }
                .strategy-item strong {
                    display: block;
                    color: var(--text-primary);
                    margin-top: 4px;
                    font-size: 13px;
                }
                .risk-section {
                    background: rgba(255, 255, 255, 0.04);
                    border-radius: 12px;
                    padding: 12px;
                }
                .risk-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 12px;
                    color: var(--text-secondary);
                }
                .risk-row strong {
                    color: var(--text-primary);
                }
                .risk-form {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 8px;
                    margin: 10px 0;
                }
                .risk-input {
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 8px;
                    padding: 6px 8px;
                    color: var(--text-primary);
                    font-size: 11px;
                }
                .risk-button {
                    width: 100%;
                    border: none;
                    border-radius: 8px;
                    padding: 8px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    background: var(--gradient-primary);
                    color: white;
                }
                .no-data {
                    text-align: center;
                    padding: 20px;
                    color: var(--text-secondary);
                    font-size: 12px;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            </style>

            <div class="widget">
                <div class="widget-header">
                    <span class="widget-header-title">Market Intelligence</span>
                    <span class="live-pill">Live</span>
                </div>
                <div class="widget-body">
                    <div class="match-info">
                        <div class="match-item">
                            <div class="match-label">Speaker</div>
                            <div class="match-value">${match.speaker}</div>
                        </div>
                        <div class="match-item">
                            <div class="match-label">Keyword</div>
                            <div class="match-value">${match.keyword ? `"${match.keyword}"` : 'N/A'}</div>
                        </div>
                    </div>

                    ${match.data ? `
                        <div class="base-rate-section">
                            <div class="base-rate-main">${formatPercent(baseRate)}</div>
                            <div class="base-rate-details">Base Rate (${match.data.mentions}/${match.data.total_events} events)</div>
                            ${contextsHtml}
                        </div>

                        ${currentProb !== null ? `
                            <div class="snapshot">
                                <div class="snapshot-card">
                                    <div class="snapshot-label">Current Market</div>
                                    <div class="snapshot-value">${formatPercent(currentProb)}</div>
                                </div>
                                <div class="snapshot-card">
                                    <div class="snapshot-label">Probability Gap</div>
                                    <div class="snapshot-value ${gapClass}">${gapDisplay}</div>
                                </div>
                            </div>
                        ` : ''}

                        <div class="strategy-section">
                            <div class="strategy-header">
                                <span class="strategy-title">Strategy Signals</span>
                                <span class="strategy-pill">${strategy.direction}</span>
                            </div>
                            <div class="strategy-grid">
                                <div class="strategy-item">Confidence<strong>${(strategy.confidence * 100).toFixed(0)}%</strong></div>
                                <div class="strategy-item">Risk Level<strong>${strategy.risk}</strong></div>
                                ${strategy.signals.map(signal => `
                                    <div class="strategy-item">${signal.label}<strong>${signal.value}</strong></div>
                                `).join('')}
                            </div>
                        </div>

                        ${riskSectionHtml}
                    ` : `
                        <div class="no-data">
                            Speaker detected but no matching keyword data
                        </div>
                    `}
                </div>
            </div>
        `;

        if (currentProb !== null) {
            setupRiskCalculator(shadow);
        }
        
        console.log('[Polymarket Assistant] Base Rate widget injected');
    }

    function setupRiskCalculator(shadow) {
        const button = shadow.querySelector('#pma-risk-run');
        if (!button) return;

        const run = () => {
            const probability = Number(shadow.querySelector('#pma-risk-prob').value) / 100;
            const price = Number(shadow.querySelector('#pma-risk-price').value) / 100;
            const investment = Number(shadow.querySelector('#pma-risk-invest').value);

            if (!probability || !price || !investment) return;

            const result = calculateRisk(probability, price, investment);

            shadow.querySelector('#pma-risk-win').textContent = `$${result.winAmount.toFixed(2)}`;
            shadow.querySelector('#pma-risk-ev').textContent = `${result.expectedValue >= 0 ? '+' : ''}$${result.expectedValue.toFixed(2)}`;
            shadow.querySelector('#pma-risk-kelly').textContent = `${result.kellyPercent.toFixed(1)}%`;
            shadow.querySelector('#pma-risk-level').textContent = result.risk;
        };

        button.addEventListener('click', run);
        run();
    }

    function removeFilterToolbar() {
        const host = document.getElementById('pma-filter-host');
        if (host) {
            host.remove();
        }
    }

    function removeRiskDashboard() {
        const host = document.getElementById('pma-risk-host');
        if (host) {
            host.remove();
        }
    }

    function injectFilterToolbar() {
        if (document.getElementById('pma-filter-host')) {
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
                :host {
                    --gradient-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    --text-primary: #ffffff;
                    --text-secondary: #a0aec0;
                    --text-muted: #718096;
                }
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                .filter-toolbar {
                    position: fixed;
                    top: 64px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(145deg, #1e2442, #151a30);
                    border-radius: 14px;
                    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
                    padding: 14px 20px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    z-index: 999999;
                    font-family: \"Space Grotesk\", \"IBM Plex Sans\", \"Manrope\", \"Segoe UI\", sans-serif;
                    border: 1px solid rgba(255, 255, 255, 0.06);
                }
                .filter-title {
                    color: var(--text-primary);
                    font-weight: 600;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .filter-group {
                    display: flex;
                    gap: 10px;
                }
                .filter-checkbox {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                }
                .filter-checkbox input {
                    width: 14px;
                    height: 14px;
                    accent-color: #667eea;
                    cursor: pointer;
                }
                .filter-checkbox label {
                    color: var(--text-secondary);
                    font-size: 12px;
                    cursor: pointer;
                    user-select: none;
                }
                .filter-checkbox:hover label {
                    color: var(--text-primary);
                }
                .filter-btn {
                    padding: 7px 14px;
                    border-radius: 8px;
                    border: none;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .filter-btn-apply {
                    background: var(--gradient-primary);
                    color: white;
                    box-shadow: 0 8px 18px rgba(102, 126, 234, 0.35);
                }
                .filter-btn-apply:hover {
                    transform: translateY(-1px);
                }
                .filter-btn-reset {
                    background: rgba(255, 255, 255, 0.08);
                    color: var(--text-secondary);
                }
                .filter-btn-reset:hover {
                    background: rgba(255, 255, 255, 0.16);
                    color: var(--text-primary);
                }
                .filter-results {
                    color: var(--text-muted);
                    font-size: 12px;
                    padding-left: 12px;
                    border-left: 1px solid rgba(255, 255, 255, 0.1);
                }
                .market-highlight {
                    outline: 2px solid #667eea !important;
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
                        <label for="pma-filter-liquidity">Liquidity > $5k</label>
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
        const gapCheckbox = toolbarContainer.querySelector('#pma-filter-gap');
        const speakerCheckbox = toolbarContainer.querySelector('#pma-filter-speaker');
        const liquidityCheckbox = toolbarContainer.querySelector('#pma-filter-liquidity');

        if (!applyBtn || !resetBtn || !resultsEl || !gapCheckbox || !speakerCheckbox || !liquidityCheckbox) {
            console.warn('[Polymarket Assistant] Filter toolbar controls missing, skip binding');
            return;
        }
        
        applyBtn.addEventListener('click', () => {
            const showGap = gapCheckbox.checked;
            const showSpeaker = speakerCheckbox.checked;
            const showLiquidity = liquidityCheckbox.checked;
            
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
            gapCheckbox.checked = false;
            speakerCheckbox.checked = false;
            liquidityCheckbox.checked = false;
            resultsEl.textContent = '';
            
            document.querySelectorAll('.market-highlight').forEach(el => {
                el.classList.remove('market-highlight');
                el.style.display = '';
            });
        });
        
        console.log('[Polymarket Assistant] Filter toolbar injected');
    }

    function injectRiskDashboard() {
        if (document.getElementById('pma-risk-host')) {
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
                :host {
                    --gradient-success: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                    --text-primary: #ffffff;
                    --text-secondary: #a0aec0;
                    --text-muted: #718096;
                }
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                .dashboard {
                    position: fixed;
                    top: 96px;
                    right: 20px;
                    width: 340px;
                    background: linear-gradient(145deg, #1e2442, #151a30);
                    border-radius: 16px;
                    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
                    font-family: \"Space Grotesk\", \"IBM Plex Sans\", \"Manrope\", \"Segoe UI\", sans-serif;
                    z-index: 999999;
                    overflow: hidden;
                    color: var(--text-primary);
                }
                .dashboard-header {
                    background: var(--gradient-success);
                    padding: 16px 20px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .dashboard-title {
                    font-size: 15px;
                    font-weight: 600;
                }
                .dashboard-body {
                    padding: 18px 20px 20px;
                }
                .balance-section {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }
                .balance-label {
                    color: var(--text-secondary);
                    font-size: 12px;
                }
                .balance-value {
                    color: var(--text-primary);
                    font-size: 22px;
                    font-weight: 700;
                }
                .exposure-section {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                    padding: 12px 14px;
                    margin-bottom: 16px;
                }
                .exposure-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 6px;
                }
                .exposure-label {
                    color: var(--text-secondary);
                    font-size: 12px;
                }
                .exposure-value {
                    font-size: 14px;
                    font-weight: 600;
                }
                .exposure-warning { color: #fbbf24; }
                .exposure-danger { color: #f87171; }
                .exposure-safe { color: #38ef7d; }
                .positions-title {
                    color: var(--text-primary);
                    font-size: 13px;
                    font-weight: 600;
                    margin-bottom: 10px;
                }
                .position-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 10px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                    margin-bottom: 8px;
                    font-size: 12px;
                }
                .position-name {
                    color: var(--text-primary);
                }
                .position-details {
                    text-align: right;
                }
                .position-amount {
                    color: var(--text-secondary);
                    font-size: 11px;
                }
                .position-percent {
                    font-size: 12px;
                    font-weight: 600;
                }
                .position-safe { color: #38ef7d; }
                .position-warning { color: #fbbf24; }
                .position-danger { color: #f87171; }
                .alert-box {
                    background: rgba(245, 158, 11, 0.15);
                    border: 1px solid rgba(245, 158, 11, 0.3);
                    border-radius: 8px;
                    padding: 10px;
                    margin-top: 12px;
                    color: #fbbf24;
                    font-size: 12px;
                }
                .alert-box.danger {
                    background: rgba(239, 68, 68, 0.15);
                    border-color: rgba(239, 68, 68, 0.3);
                    color: #f87171;
                }
                .no-positions {
                    text-align: center;
                    color: var(--text-muted);
                    font-size: 12px;
                    padding: 16px;
                }
            </style>
            
            <div class="dashboard">
                <div class="dashboard-header">
                    <span class="dashboard-title">Portfolio Risk Dashboard</span>
                    <span>Live</span>
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
            removeFilterToolbar();
            removeRiskDashboard();
            const pageType = getCurrentPageType();
            console.log('[Polymarket Assistant] Page type:', pageType);
            
            if (pageType === 'market') {
                setTimeout(injectBaseRateWidget, 1500);
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
            removeFilterToolbar();
            removeRiskDashboard();
            const pageType = getCurrentPageType();
            if (pageType === 'market') {
                injectBaseRateWidget();
            }
        }, 1000);
    });

})();
