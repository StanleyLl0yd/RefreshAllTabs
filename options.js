"use strict";

const DEFAULT_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 1440;
const DEFAULT_REFRESH_MODE = "all-tabs";
const REFRESH_MODES = new Set([
  "all-tabs", "current-window", "all-except-current", "current-tab"
]);
let statusTimer;

function localizeHtmlPage() {
  // HTML page titles are not localized automatically by Chromium.
  // Set explicitly, with a readable fallback if a translation is missing.
  document.title = chrome.i18n.getMessage("optionsTitle") || "Refresh All Tabs - Settings";

  const locale = chrome.i18n.getUILanguage();
  document.documentElement.lang = locale.replaceAll("_", "-");
  document.documentElement.dir = locale.toLowerCase().startsWith("ar") ? "rtl" : "ltr";

  const pattern = /__MSG_(\w+)__/g;
  const localize = (value) => value.replace(pattern, (_, key) =>
    chrome.i18n.getMessage(key) || "");

  // Only page body text needs placeholder substitution.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeValue.includes("__MSG_")) node.nodeValue = localize(node.nodeValue);
  }
  for (const element of document.querySelectorAll("*")) {
    for (const attribute of element.attributes) {
      if (attribute.value.includes("__MSG_")) attribute.value = localize(attribute.value);
    }
  }
}

function intervalOrDefault(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_INTERVAL_MINUTES
    ? value : DEFAULT_INTERVAL_MINUTES;
}

function showStatus(key) {
  clearTimeout(statusTimer);
  const status = document.getElementById("status");
  status.textContent = chrome.i18n.getMessage(key);
  statusTimer = setTimeout(() => { status.textContent = ""; }, 3500);
}

async function restoreOptions() {
  try {
    const { autoRefreshEnabled, autoRefreshIntervalMinutes, refreshMode, excludedDomains } =
      await chrome.storage.sync.get({
        autoRefreshEnabled: false,
        autoRefreshIntervalMinutes: DEFAULT_INTERVAL_MINUTES,
        refreshMode: DEFAULT_REFRESH_MODE,
        excludedDomains: []
      });
    document.getElementById("excluded-domains").value =
      RefreshExclusions.sanitizeStored(excludedDomains).join("\n");
    document.getElementById("auto-refresh-enabled").checked = autoRefreshEnabled === true;
    document.getElementById("auto-refresh-interval").value =
      intervalOrDefault(autoRefreshIntervalMinutes);
    const mode = REFRESH_MODES.has(refreshMode) ? refreshMode : DEFAULT_REFRESH_MODE;
    document.querySelectorAll('input[name="refresh-mode"]').forEach((input) => {
      input.checked = input.value === mode;
    });
  } catch (error) {
    console.error("Could not read settings:", error);
    showStatus("optStorageError");
  }
}

async function saveOptions(event) {
  event.preventDefault();
  const input = document.getElementById("auto-refresh-interval");
  // Reject floats, exponent notation and values outside Chrome's practical range.
  const raw = input.value.trim();
  const interval = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > MAX_INTERVAL_MINUTES) {
    input.setCustomValidity(`1–${MAX_INTERVAL_MINUTES}`);
    input.reportValidity();
    return;
  }
  input.setCustomValidity("");

  const exclusionInput = document.getElementById("excluded-domains");
  const parsed = RefreshExclusions.parseInput(exclusionInput.value);
  if (parsed.error) {
    const key = parsed.error === "limit" ? "optExcludeLimit" : "optExcludeInvalid";
    const extra = parsed.entry ? ` ${parsed.entry}` : "";
    clearTimeout(statusTimer);
    document.getElementById("status").textContent =
      (chrome.i18n.getMessage(key) || "Invalid excluded domain.") + extra;
    exclusionInput.focus();
    return;
  }

  const selected = document.querySelector('input[name="refresh-mode"]:checked');
  const refreshMode = REFRESH_MODES.has(selected?.value)
    ? selected.value : DEFAULT_REFRESH_MODE;
  try {
    await chrome.storage.sync.set({
      autoRefreshEnabled: document.getElementById("auto-refresh-enabled").checked,
      autoRefreshIntervalMinutes: interval,
      excludedDomains: parsed.domains,
      refreshMode
    });
    showStatus("optSavedStatus");
  } catch (error) {
    console.error("Could not save settings:", error);
    showStatus("optStorageError");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  localizeHtmlPage();
  void restoreOptions();
  document.getElementById("auto-refresh-interval").addEventListener("input", (event) => {
    event.target.setCustomValidity("");
  });
  document.getElementById("options-form").addEventListener("submit", (event) => {
    void saveOptions(event);
  });
});
