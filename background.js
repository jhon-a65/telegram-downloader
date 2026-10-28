'use strict';
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, {type: 'tg-local-toggle'});
  } catch {
    await chrome.tabs.create({url: chrome.runtime.getURL('ayuda.html')});
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.origin !== 'https://web.telegram.org' || message?.type !== 'tg-local-count' || !sender.tab?.id) return;
  const count = Math.min(99, Math.max(0, Number(message.count) || 0));
  chrome.action.setBadgeText({tabId: sender.tab.id, text: count ? String(count) : ''});
  chrome.action.setBadgeBackgroundColor({tabId: sender.tab.id, color: '#167b80'});
});
