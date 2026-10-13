# Refresh All Tabs

[![CI](https://github.com/StanleyLl0yd/RefreshAllTabs/actions/workflows/ci.yml/badge.svg)](https://github.com/StanleyLl0yd/RefreshAllTabs/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A lightweight, privacy-friendly Chromium Manifest V3 extension for manually and automatically refreshing browser tabs. No servers, analytics, external requests, or third-party runtime dependencies.

**Version:** 1.9  |  **Browsers:** Chromium-based (Chrome, Edge, Comet, Brave, etc.)

## Features

- Four refresh modes: **All tabs**, **Current window**, **All except current tab**, **Current tab**.
- **Website exclusions for every mode**. Skip a domain and its subdomains while refreshing other tabs.
- Optional automatic refresh every 1–1440 minutes (browser alarms are approximate).
- Toolbar click, toolbar context menu, and `Ctrl+Shift+Z` (`Command+Shift+Z` on macOS).
- 19 interface locales, including English and Russian.
- Limits concurrent tab reload operations to four.

### Website exclusions

Add hostnames on separate lines under **Options → Excluded websites**:

```text
chatgpt.com
example.org
```

With 20 tabs open, five of them on `chatgpt.com`, **All tabs** refreshes the other 15. Exclusions also apply to **Current window** and **Current tab**: if the current tab is excluded, it is not refreshed. The **All except current tab** mode always skips the current tab as well.

Matching is by domain boundary: `chatgpt.com` matches `sub.chatgpt.com` but not `notchatgpt.com`. You can paste full `https://` URLs, use internationalized domain names, or prefix a hostname with `*.`. Only the hostname is used; individual paths cannot be excluded. There is a limit of 100 distinct domains.

Browser internal pages are never refreshed. `file://` tabs can be refreshed where allowed but are not affected by domain exclusions.

## Installation

**From a release:** Download `RefreshAllTabs.<version>.zip` from [Releases](https://github.com/StanleyLl0yd/RefreshAllTabs/releases) and extract it to a permanent directory.

**From source:** Download the repository and use the extension files at its root (`manifest.json`, `background.js`, `options.*`, `exclusions.js`, `_locales`).

1. Open `chrome://extensions` (or your Chromium browser's extensions page).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Open **Details → Extension options** to set the refresh mode, timer, and exclusions.

**Important for upgrades:** For an unpacked extension, replace files **in the same directory** and click **Reload** on the extensions page. Loading a copy from another folder can change its extension ID and its access to saved settings. Version 1.9 keeps the settings keys used since version 1.6.

## How it works and limitations

- Only `http://`, `https://`, and `file://` tabs are eligible; pages such as `chrome://` or `edge://` are skipped.
- A scheduled refresh involving the “current” tab/window uses the last focused normal browser window. If none is available, that refresh is skipped rather than refreshing too many tabs.
- Chrome may delay alarms during sleep or browser suspension. Tabs being closed during a refresh do not stop the remaining tabs.
- **Refreshing a page may discard unsaved forms or edits.** Add those websites to exclusions.

## Privacy and permissions

No usage statistics, network reporting, or access to page contents. The extension uses these Chromium permissions:

| Permission | Purpose |
| --- | --- |
| `tabs` | Enumerate tab URLs and refresh selected tabs, including applying exclusions |
| `storage` | Save settings and exclusions via `chrome.storage.sync` |
| `alarms` | Schedule automatic refreshes |
| `contextMenus` | Toolbar menu commands |

There are no host permissions, injected content scripts, or third-party runtime libraries.

## Development

Requires Node.js (for tests) and Python 3 (for packaging); no `npm install` necessary:

```sh
node --check background.js
node --check exclusions.js
node --check options.js
node --test tests/*.test.cjs
python3 scripts/package.py
```

Optional Chromium UI checks require Playwright and a suitable Chromium installation:

```sh
python3 tests/options_browser_test.py
```

GitHub Actions runs syntax, logic, structural, and packaging checks. The UI checks mock the extension API, and do not replace manual installed-extension testing.

See [CHANGELOG.md](CHANGELOG.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [AUDIT.md](AUDIT.md) for changes, contribution guidelines, and the original code review.

## Русский

**Refresh All Tabs** позволяет обновлять вкладки Chromium вручную или по таймеру. Есть четыре режима: все вкладки, текущее окно, все кроме активной, только активная. Исключения по доменам работают **во всех четырёх режимах**. Например, если добавить `chatgpt.com`, все вкладки ChatGPT останутся нетронутыми.

Установка: скачать ZIP из раздела **Releases**, распаковать, открыть `chrome://extensions`, включить режим разработчика и выбрать **«Загрузить распакованное расширение»**. При обновлении распакованной версии используйте ту же папку, чтобы сохранить настройки.

## License

MIT © 2026 Stanley Lloyd. See [LICENSE](LICENSE).
