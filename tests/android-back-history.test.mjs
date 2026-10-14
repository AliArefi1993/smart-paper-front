import assert from "node:assert/strict";
import { test } from "node:test";
import { installAppHistory, isAppRoute } from "../src/lib/android-back-history.ts";

function browser(start = "https://localhost/") {
  const location = new URL(start);
  const entries = [{ state: { __NA: true, tree: "initial" }, href: start }];
  let index = 0;
  const history = {
    get state() { return entries[index].state; },
    pushState(state, unused, url) {
      const href = new URL(url ?? location.href, location.href).href;
      entries.splice(index + 1, entries.length, { state, href });
      index++; location.href = href;
    },
    replaceState(state, unused, url) {
      const href = new URL(url ?? location.href, location.href).href;
      entries[index] = { state, href }; location.href = href;
    },
    go(delta) { index += delta; location.href = entries[index].href; },
  };
  return { history, location, entries };
}

test("owned history unwinds actual routes, including a Planner reached by a link", () => {
  const b = browser(); const tracker = installAppHistory(b.history, b.location);
  assert.equal(tracker.canGoBack(), false);
  for (const url of ["/settings", "/ideas", "/"]) b.history.pushState({ __NA: true }, "", url);
  for (const expected of ["/ideas", "/settings", "/"]) {
    assert.equal(tracker.canGoBack(), true); b.history.go(-1); assert.equal(b.location.pathname, expected);
  }
  assert.equal(tracker.canGoBack(), false);
  assert.equal(b.history.state.__NA, true); assert.equal(b.history.state.tree, "initial");
});

test("reload, replace, query/hash traversal and forward navigation retain owned depth", () => {
  const b = browser(); let tracker = installAppHistory(b.history, b.location);
  b.history.pushState({ __NA: true, tree: "export" }, "", "/export?reportWeek=2026-10-10");
  tracker.dispose(); tracker = installAppHistory(b.history, b.location);
  assert.equal(tracker.canGoBack(), true);
  b.history.replaceState({ __NA: true, tree: "replaced" }, "", "/export?reportWeek=2026-10-17");
  b.history.pushState({ __NA: true }, "", "/export?reportWeek=2026-10-17#report");
  b.history.go(-1);
  assert.equal(b.location.search, "?reportWeek=2026-10-17");
  assert.equal(b.history.state.tree, "replaced"); assert.equal(tracker.canGoBack(), true);
  b.history.go(-1); assert.equal(tracker.canGoBack(), false);
  b.history.go(1); assert.equal(tracker.canGoBack(), true);
});

test("fresh secondary fallback replaces its root entry and never trusts history length", () => {
  const b = browser("https://localhost/ideas"); b.history.length = 42;
  const tracker = installAppHistory(b.history, b.location);
  assert.equal(tracker.canGoBack(), false);
  b.history.replaceState({ __NA: true }, "", "/");
  assert.equal(tracker.canGoBack(), false); assert.equal(b.entries.length, 1);
});

test("unknown/external route transitions do not acquire a usable predecessor", () => {
  for (const target of ["https://other.example/settings", "/unknown"]) {
    const b = browser(); const tracker = installAppHistory(b.history, b.location);
    b.history.pushState({}, "", target); b.history.pushState({}, "", "https://localhost/ideas");
    assert.equal(tracker.canGoBack(), false);
  }
  for (const target of ["https://other.example/", "http://localhost/", "https://localhost:8443/", "https://localhost/unknown"]) {
    assert.equal(isAppRoute(new URL(target), "https://localhost"), false);
  }
  assert.equal(isAppRoute(new URL("https://localhost/export/?reportWeek=2026-10-10"), "https://localhost"), true);
});

test("cleanup restores methods and reinstallation does not double-count pushes", () => {
  const b = browser(); const push = b.history.pushState; const replace = b.history.replaceState;
  installAppHistory(b.history, b.location).dispose();
  assert.equal(b.history.pushState, push); assert.equal(b.history.replaceState, replace);
  const tracker = installAppHistory(b.history, b.location);
  b.history.pushState({}, "", "/settings"); b.history.go(-1);
  assert.equal(tracker.canGoBack(), false);
});
