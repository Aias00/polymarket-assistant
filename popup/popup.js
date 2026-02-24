document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadStats();
    setupEventListeners();
});

function loadStats() {
    fetch(chrome.runtime.getURL('data/speakers.json'))
        .then(response => response.json())
        .then(data => {
            const speakers = data.records || [];
            let keywordCount = 0;
            
            speakers.forEach(speaker => {
                keywordCount += Object.keys(speaker.keywords || {}).length;
            });
            
            document.getElementById('speaker-count').textContent = speakers.length;
            document.getElementById('keyword-count').textContent = keywordCount;
        })
        .catch(error => {
            console.error('Failed to load stats:', error);
        });
}

function loadSettings() {
    chrome.storage.local.get(['probabilityGap', 'notifications'], (result) => {
        if (result.probabilityGap) {
            document.getElementById('probability-gap').value = result.probabilityGap;
        }
        if (result.notifications !== undefined) {
            document.getElementById('notifications').checked = result.notifications;
        }
    });
}

function setupEventListeners() {
    document.getElementById('probability-gap').addEventListener('change', (e) => {
        chrome.storage.local.set({ probabilityGap: e.target.value });
    });
    
    document.getElementById('notifications').addEventListener('change', (e) => {
        chrome.storage.local.set({ notifications: e.target.checked });
    });
    
    document.getElementById('open-dashboard').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://polymarket.com' });
    });
    
    document.getElementById('refresh-data').addEventListener('click', () => {
        const btn = document.getElementById('refresh-data');
        btn.textContent = 'Refreshing...';
        
        setTimeout(() => {
            btn.textContent = 'Refresh Data';
            loadStats();
        }, 1000);
    });
    
    document.getElementById('help-link').addEventListener('click', (e) => {
        e.preventDefault();
        alert('Polymarket Strategy Assistant v1.0.0\n\nFeatures:\n• Base Rate Display on market pages\n• Strategy Filter on homepage\n• Risk Dashboard on portfolio page');
    });
}
