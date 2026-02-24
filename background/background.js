chrome.runtime.onInstalled.addListener((details) => {
    console.log('[Polymarket Assistant] Extension installed:', details.reason);
    
    if (details.reason === 'install') {
        chrome.storage.local.set({
            probabilityGap: '0.15',
            notifications: true,
            firstInstall: true
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SPEAKERS_DATA') {
        fetch(chrome.runtime.getURL('data/speakers.json'))
            .then(response => response.json())
            .then(data => sendResponse(data))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }
    
    if (message.type === 'GET_CONFIG') {
        fetch(chrome.runtime.getURL('data/config.json'))
            .then(response => response.json())
            .then(data => sendResponse(data))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('polymarket.com')) {
        console.log('[Polymarket Assistant] Tab updated:', tab.url);
    }
});

console.log('[Polymarket Assistant] Background service worker loaded');
