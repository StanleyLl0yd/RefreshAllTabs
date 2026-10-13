# Refresh All Tabs 1.6 → 1.7: audit and fixes

Date: 2026-10-13. Scope: **all files** in the supplied 1.6 ZIP (manifest,
background script, settings HTML/JS, every translation, PowerShell utility).

## Fixed

| Severity | Finding in 1.6 | Change in 1.7 |
| --- | --- | --- |
| High | When no active tab was detected in a targeted mode, the worker reloaded all tabs. | Fail closed when target cannot be resolved. |
| Medium | `currentWindow` inside a background service worker was relied upon to identify the user's window, even for scheduled tasks. | Use event-supplied tab for user actions and last-focused normal window for scheduled tasks. |
| Medium | Tab reload promises were ignored; errors went unhandled and many reloads could be fired at once. | Catch individual failures, continue processing, limit concurrency to four. |
| Medium | An invalid/synced timer interval could be sent directly to the browser alarm API. | Restrict to integer minutes 1..1440 with defensive defaults in background and UI. |
| Medium | Multiple sources recreated the alarm without checking its current value, causing redundant resets. | Serialized, idempotent alarm reconciliation and storage change handling. |
| Medium | `create-locales.ps1` overwrote all translations with blank files when rerun. | Never overwrite locale files; create only missing ones from the English fallback. |
| Low | Options title in `<head>` was not localized. | Translate text nodes across `document.documentElement`. |
| Low | Unsupported / nonstandard language names could lead to fallback instead of expected localizations in current Chrome versions. | Use `no`, `pt_BR`, `zh_CN` and also add `pt_PT`, `zh_TW`, keeping 19 populated language directories. |
| Low | An absent or invalid URL wasn't handled consistently, and special pages other than Chrome's own were not excluded. | Only reload HTTP(S) and file URLs, including valid pending URLs. |
| Low | Settings storage failures provided no UI feedback. | Display a localized, accessible status or error message. |

## Security review

- No content scripts, arbitrary code evaluation, dynamic imports, remote source,
  network reporting, web requests or analytics were present or introduced.
- No host permissions were required. Existing permissions `tabs`,
  `contextMenus`, `alarms`, `storage` are retained; `tabs` is needed to inspect
  `tab.url` and avoid browser internal pages.
- No new broad capabilities were introduced. User settings are still stored
  exclusively in `chrome.storage.sync`.
- `http://`, `https://`, `file://` reloads can cause data loss in unsaved forms
  because reloading a tab is inherently disruptive. No bypass of browser
  restrictions is attempted.

## Verification

- Node.js syntax checks for both JavaScript files.
- 23 unit/static tests: four modes, action and keyboard context, focus fallback,
  URL filtering, malformed inputs, per-tab failures, concurrency limit,
  overlapping requests, menu creation, enabling/disabling/resetting timer,
  alarm event behavior, permissions, and translation catalog consistency.
- Chromium-rendered HTML/JavaScript tests with mocked extension APIs for
  English, Russian, Arabic, including restore, form submission, status and RTL.
- ZIP integrity, `manifest.json` version, required files and JSON parsing.

**Limitation:** real extension loading into the test Chromium environment was
blocked by browser policy. End-to-end interaction with the installed toolbar,
actual Chrome alarms and browser restart was not demonstrated and should be
manually checked on the target browser. A source-level test of these flows is
included instead.

## Backward compatibility

All existing persistent setting keys and four mode names were kept; original
shortcut retained. For an unpacked installation, update files in the same
extension path rather than adding a second copy if settings retention matters.

## Follow-up: 1.7.1 (2026-10-13)

The 1.6 screenshot showed `__MSG_optionsTitle__` in the browser tab. The
1.6 localization walker covered `document.body` but not `<head>`. Version
1.7 scanned all document text, including the title, on `DOMContentLoaded`,
but the HTML still contained the raw placeholder before scripts executed.
Version 1.7.1 replaces it with readable text and sets `document.title`
explicitly from `chrome.i18n.getMessage("optionsTitle")`, falling back to
English if the localized string is empty. Tests cover both pre-script title
and missing-translation fallback. No permission or storage-key changes.

## Version 1.8: website exclusions

- Added `exclusions.js`, a shared domain canonicalization and comparison helper
  used by both the settings page and Manifest V3 background worker.
- Settings persist the new optional `excludedDomains: string[]` key in
  `chrome.storage.sync`; old installations with no key default to an empty list.
- Exclusions are only applied in `all-tabs` and `all-except-current` modes,
  including scheduled refresh, without affecting the existing targeted modes.
- Hostnames are matched on exact host or DNS label boundary (`.domain` suffix),
  not substring; similar-looking hostnames cannot accidentally match.
- The parser accepts site URLs, IDNs, optional `*.` prefixes, comma/newline
  separation and deduplicates entries. It rejects unsupported protocols,
  embedded credentials, invalid hostnames and overly large rule lists.
- A pending navigation to an excluded site is not interrupted by a reload.
- Five localized interface strings were added for each of 19 existing locales.
- No new permissions, content scripts, server interactions, or dependencies.
- Added automated tests for the 20-tab/5-excluded scenario, both bulk modes,
  timer, subdomains, spoofing-like lookalikes, normalization, storage data
  validation and compatibility. UI tests cover save, restore and invalid rules.

## Version 1.9: exclusions for all four refresh modes (2026-10-13)

- Apply website exclusions uniformly before choosing tab IDs/window IDs.
- In **Current window**, skip matching site tabs even in the targeted window.
- In **Current tab**, skip refresh if the active tab belongs to an excluded site.
- Both modes honor exclusions with manual actions and automatic alarms.
- Maintain the existing `excludedDomains` storage key, all four mode IDs,
  shortcut, permission set, and all existing user settings.
- Update exclusion help messages for every existing locale (19).
- Add regression tests for all four modes with/without exclusions, excluded
  active tab, pending URL navigation and scheduled refresh.

No permissions or third-party dependencies added.
