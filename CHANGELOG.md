# Changelog

All versions use numeric release identifiers, without prerelease suffixes.

## 1.9 - 2026-10-13

- Apply website exclusion rules to all four refresh modes, manually and on the timer.
- Preserve existing saved exclusion lists and refresh settings.
- Add regression tests for an excluded active tab and scheduled refreshes.

## 1.8 - 2026-10-13

- Introduce website exclusions for the two global refresh modes.
- Add domain normalization, exact/subdomain matching, validation, and localized settings UI.

## 1.7.1 - 2026-10-13

- Fix the options tab title showing a raw localization placeholder in Chromium-based browsers.

## 1.7 - 2026-10-13

- Fix target tab selection and fail-safe behavior when focus is unavailable.
- Handle individual tab reload failures and limit concurrent reload calls.
- Validate timer intervals and avoid redundant alarm resets.
- Improve localization, settings error feedback, and test coverage.

## 1.6

- Original imported baseline, reviewed in [AUDIT.md](AUDIT.md).
