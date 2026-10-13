"use strict";

importScripts("exclusions.js");

const AUTO_REFRESH_ALARM_NAME = "auto-refresh-all-tabs";
const DEFAULT_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 1440;
const DEFAULT_REFRESH_MODE = "all-tabs";
const REFRESH_MODES = new Set([
  "all-tabs", "current-window", "all-except-current", "current-tab"
]);
const MAX_PARALLEL_RELOADS = 4;

let refreshInProgress = false;
let alarmUpdateQueue = Promise.resolve();

function validInterval(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_INTERVAL_MINUTES
    ? value
    : DEFAULT_INTERVAL_MINUTES;
}

function validMode(value) {
  return REFRESH_MODES.has(value) ? value : DEFAULT_REFRESH_MODE;
}

function isReloadable(tab) {
  if (!Number.isInteger(tab.id)) return false;
  const url = tab.url || tab.pendingUrl || "";
  // Internal pages (including those of Chromium-based browsers) are excluded.
  return /^(https?|file):\/\//i.test(url);
}

async function getTargetTab(preferredTab) {
  if (preferredTab && Number.isInteger(preferredTab.id) &&
      Number.isInteger(preferredTab.windowId)) {
    return preferredTab;
  }

  // A service worker has no reliably defined "currentWindow".
  // Use the last focused normal browser window for scheduled refreshes.
  const window = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  if (!Number.isInteger(window?.id)) return null;
  const [activeTab] = await chrome.tabs.query({ active: true, windowId: window.id });
  return activeTab || null;
}

async function reloadTabs(tabs) {
  let next = 0;
  const failures = [];
  async function worker() {
    while (next < tabs.length) {
      const tab = tabs[next++];
      try {
        await chrome.tabs.reload(tab.id);
      } catch (error) {
        // A tab may have been closed or become inaccessible in the meantime.
        failures.push({ id: tab.id, error: String(error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_RELOADS, tabs.length) }, worker));
  if (failures.length) {
    console.warn("Could not refresh some tabs:", failures);
  }
}

async function runRefresh(preferredTab = null) {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const { refreshMode, excludedDomains } = await chrome.storage.sync.get({
      refreshMode: DEFAULT_REFRESH_MODE,
      excludedDomains: []
    });
    const exclusions = RefreshExclusions.sanitizeStored(excludedDomains);
    const mode = validMode(refreshMode);
    const target = mode === "all-tabs" ? null : await getTargetTab(preferredTab);
    // Fail closed: never turn a targeted refresh into "refresh everything".
    if (mode !== "all-tabs" && !target) return;

    const tabs = await chrome.tabs.query({});
    const selected = tabs.filter((tab) => {
      if (!isReloadable(tab)) return false;
      // Site exclusions are authoritative in every refresh mode, including
      // when the active tab itself is excluded.
      if (RefreshExclusions.matchesTab(tab, exclusions)) return false;
      if (mode === "current-tab") return tab.id === target.id;
      if (mode === "current-window") return tab.windowId === target.windowId;
      if (mode === "all-except-current") return tab.id !== target.id;
      return true;
    });
    await reloadTabs(selected);
  } catch (error) {
    console.error("Failed to refresh tabs:", error);
  } finally {
    refreshInProgress = false;
  }
}

function createMenu(properties) {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(properties, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

async function createContextMenus() {
  await chrome.contextMenus.removeAll();
  for (const [id, key] of [
    ["enable-auto-refresh", "ctxEnableAuto"],
    ["disable-auto-refresh", "ctxDisableAuto"],
    ["open-options", "ctxOpenOptions"]
  ]) {
    await createMenu({ id, title: chrome.i18n.getMessage(key), contexts: ["action"] });
  }
}

async function reconcileAlarm() {
  const { autoRefreshEnabled, autoRefreshIntervalMinutes } =
    await chrome.storage.sync.get({
      autoRefreshEnabled: false,
      autoRefreshIntervalMinutes: DEFAULT_INTERVAL_MINUTES
    });
  const current = await chrome.alarms.get(AUTO_REFRESH_ALARM_NAME);
  if (autoRefreshEnabled !== true) {
    if (current) await chrome.alarms.clear(AUTO_REFRESH_ALARM_NAME);
    return;
  }
  const interval = validInterval(autoRefreshIntervalMinutes);
  if (!current || current.periodInMinutes !== interval) {
    await chrome.alarms.create(AUTO_REFRESH_ALARM_NAME, { periodInMinutes: interval });
  }
}

function queueAlarmReconcile() {
  // Serialize updates, and read the latest settings inside each operation.
  alarmUpdateQueue = alarmUpdateQueue.catch((error) => {
    console.error("Previous alarm update failed:", error);
  }).then(reconcileAlarm);
  return alarmUpdateQueue;
}

async function initialize() {
  const results = await Promise.allSettled([createContextMenus(), queueAlarmReconcile()]);
  for (const result of results) {
    if (result.status === "rejected") console.error("Initialization failed:", result.reason);
  }
}

chrome.runtime.onInstalled.addListener(() => { void initialize(); });
chrome.runtime.onStartup.addListener(() => { void initialize(); });

chrome.action.onClicked.addListener((tab) => { void runRefresh(tab); });
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "refresh-all-tabs") void runRefresh(tab);
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "open-options") {
    void chrome.runtime.openOptionsPage().catch(console.error);
  } else if (info.menuItemId === "enable-auto-refresh" ||
             info.menuItemId === "disable-auto-refresh") {
    const enabled = info.menuItemId === "enable-auto-refresh";
    void chrome.storage.sync.set({ autoRefreshEnabled: enabled })
      .then(queueAlarmReconcile).catch((error) => console.error("Could not update timer:", error));
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTO_REFRESH_ALARM_NAME) return;
  void chrome.storage.sync.get({ autoRefreshEnabled: false })
    .then(({ autoRefreshEnabled }) => {
      if (autoRefreshEnabled === true) return runRefresh();
    }).catch((error) => console.error("Could not check timer state:", error));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (changes.autoRefreshEnabled || changes.autoRefreshIntervalMinutes) {
    void queueAlarmReconcile().catch((error) => console.error("Could not synchronize timer:", error));
  }
});
