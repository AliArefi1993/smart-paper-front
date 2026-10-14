# Critical browser integration tests

Design: not applicable (test infrastructure). Chromium runs isolated synthetic profiles; no personal records, backend, native file chooser or Android certification. Twelve stable flows exercise React routing/autosave, unpublished Ideas, configurable sections, actual JSON file-input Merge/Replace/cancel/invalid recovery, Persian draft cold entry/reload/language switching, template-dialog keyboard focus, the named JSON file chooser, Export unlock feedback in both languages, and changed controls at a short phone viewport. `setInputFiles` exercises the input change handler and file parsing; OS chooser appearance is a separate device check.

Eighteen Android Back regressions invoke the real client coordinator after simulating Capacitor Android detection. They cover EN/FA route history and reload, query traversal, direct-entry Planner fallback, root exit authorization, repeated callbacks, reader and Planner overlays, diagnostics busy/discard, Settings unsaved/PIN guards, failed Planner saves and ordinary web Back. They do not certify Android callback delivery, keyboard/chooser dismissal, lifecycle, predictive gestures or TalkBack; those require native observation.

The runner has its own pinned `@playwright/test` lock so production dependency/Android artifacts do not include it. Docker image and package both use 1.58.2, matching the earlier local QA environment. The [official Docker guidance](https://playwright.dev/docs/docker) explains image/package version matching, `--init` and Chromium IPC. Image runs only trusted local application/test code.

From frontend root, build and serve local production assets:

```sh
docker run --rm -v "$PWD":/app -w /app node:24-bookworm bash -lc 'npm ci && NEXT_PUBLIC_DATA_MODE=local npm run build'
docker run --rm --name smart-paper-desktop-preview -p 127.0.0.1:3192:3192 -v "$PWD/out":/site:ro -v "$PWD/tests/browser":/suite:ro -w /site node:24-bookworm node /suite/static-server.cjs
```

Run `bash scripts/test-browser-docker.sh` (`npm run test:browser` alias) after building. It starts and stops its own internal production preview in the browser container; no published port or separate server is needed. Verification CI runs this focused step after its existing build; performance is manual. Override `BROWSER_BASE_URL` for a shared production preview. No automatic full build repetition is added. Failed tests retain traces under ignored `tests/browser/test-results/` through the mounted suite directory. Runner leaves no service running; stop any separately started shared preview after consumers finish.

When the pinned Docker image is unavailable, an installed desktop Chrome can run the same suite against a shared preview: from `tests/browser/`, set `BROWSER_CHROME_CHANNEL=chrome BROWSER_BASE_URL=http://127.0.0.1:3192` for `npm test` or `npm run performance`. This uses the installed Chrome version, so record it with the evidence.

Performance, against the same preview:

```sh
docker run --rm --init --ipc=host -e BROWSER_BASE_URL=http://127.0.0.1:3192 -e PERFORMANCE_OUTPUT=/evidence/performance.json -v "$PWD/out":/site:ro -v "$PWD/tests/browser":/suite -v /absolute/evidence/directory:/evidence -w /suite mcr.microsoft.com/playwright:v1.58.2-noble bash -lc 'set -euo pipefail; npm ci --ignore-scripts; (cd /site && node /suite/static-server.cjs) & preview_pid=$!; trap "kill $preview_pid 2>/dev/null || true" EXIT; node /suite/wait-preview.cjs; npm run performance'
```

This records three interleaved runs of deterministic small (4 populated weeks/20 Ideas) and large (52 weeks/500 Ideas, each about 1KB UTF-8) fixtures. Both contain all ten active sections and ten schedule entries per day. Fixtures anchor the viewed week at 2026-10-10; browser Date is fixed to 2026-10-13 noon UTC with `page.clock.setFixedTime`, which keeps ordinary timers running. Test contexts use UTC; this avoids calendar-dependent failures on later runs. Fresh startup measures navigation through rendered weekly goal in a new Chromium process/context (fixture injection included; browser launch excluded). Then routes warm online before [setOffline](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-offline), and offline week switch/Ideas open/search/type-save/reopen are measured. Type-save includes deliberate 20ms per character and assertion waits, not bare storage latency. Every original week day/section/schedule and Idea record is compared afterward, plus exactly one saved Idea. No offline cold reload, service-worker installation, device CPU, native lifecycle or APK timing claim is made.
