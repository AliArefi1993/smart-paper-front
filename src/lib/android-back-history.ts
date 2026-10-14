const STATE_KEY = "smartPaperBack";
const ROUTES = new Set(["/", "/ideas", "/timer", "/finance", "/summaries", "/export", "/settings"]);
type Entry = { session: string; depth: number };

export function isAppRoute(url: URL, origin: string): boolean {
  return url.origin === origin && ROUTES.has(url.pathname.replace(/\/+$/, "") || "/");
}

function entry(state: unknown): Entry | null {
  const value = (state as Record<string, unknown> | null)?.[STATE_KEY] as Entry | undefined;
  return value && typeof value.session === "string" && Number.isSafeInteger(value.depth) && value.depth >= 0 ? value : null;
}

/** Stamp only our entries; history.length also counts unrelated/external pages. */
export function installAppHistory(history: History, location: Location) {
  const push = history.pushState;
  const replace = history.replaceState;
  const restored = entry(history.state);
  const session = restored?.session ?? crypto.randomUUID();
  const read = () => {
    const current = entry(history.state);
    return current?.session === session ? current.depth : 0;
  };
  const stamp = (state: unknown, depth: number) => ({
    ...(state && typeof state === "object" ? state : {}),
    [STATE_KEY]: { session, depth },
  });
  replace.call(history, stamp(history.state, read()), "");
  const targetIsApp = (url?: string | URL | null) => isAppRoute(new URL(url ?? location.href, location.href), location.origin);
  const patchedPush: History["pushState"] = function (data, unused, url) {
    const depth = targetIsApp(url) && isAppRoute(new URL(location.href), location.origin) ? read() + 1 : 0;
    push.call(history, stamp(data, depth), unused, url);
  };
  const patchedReplace: History["replaceState"] = function (data, unused, url) {
    replace.call(history, stamp(data, targetIsApp(url) ? read() : 0), unused, url);
  };
  history.pushState = patchedPush;
  history.replaceState = patchedReplace;
  return {
    canGoBack: () => read() > 0,
    dispose() {
      if (history.pushState === patchedPush) history.pushState = push;
      if (history.replaceState === patchedReplace) history.replaceState = replace;
    },
  };
}
