var editorUrl = chrome.runtime.getURL("index.html");

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!msg || msg.type !== "editor-ready" || !sender.tab || sender.tab.id == null) return;
  chrome.storage.session.set({ editorTabId: sender.tab.id });
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  chrome.storage.session.get("editorTabId").then(function (data) {
    if (data.editorTabId === tabId) chrome.storage.session.remove("editorTabId");
  });
});

chrome.action.onClicked.addListener(function () {
  chrome.storage.session.get("editorTabId").then(function (data) {
    if (data.editorTabId == null) return chrome.tabs.create({ url: editorUrl });
    return focusTab(data.editorTabId);
  });
});

function focusTab(tabId) {
  return chrome.tabs.get(tabId).then(function (tab) {
    return chrome.tabs.update(tab.id, { active: true }).then(function () {
      if (tab.windowId != null) return chrome.windows.update(tab.windowId, { focused: true });
    });
  }).catch(function () {
    return chrome.storage.session.remove("editorTabId").then(function () {
      return chrome.tabs.create({ url: editorUrl });
    });
  });
}
