# Contributing

Contributions are welcome. For nontrivial changes, open an issue describing the expected behavior before submitting a pull request.

- Keep the extension dependency-free at runtime and compatible with Chromium Manifest V3.
- Avoid adding permissions, telemetry, content scripts, or network access without a clear reason and security review.
- Preserve the four refresh modes and existing settings keys unless migration is explicitly documented and tested.
- Update all 19 `_locales/*/messages.json` catalogs when adding interface strings.
- Add regression tests for bug fixes and run `node --test tests/*.test.cjs`.
- Verify the extension manually in a Chromium-based browser when changing tab handling or alarms.
- Use numeric version identifiers only, e.g. `1.10`, not alpha/beta/rc tags.

Please do not include generated ZIP archives in regular source-code pull requests; CI builds them from source.
