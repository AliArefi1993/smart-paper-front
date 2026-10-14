"use client";

import { Capacitor } from "@capacitor/core";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { installAppHistory, isAppRoute } from "@/lib/android-back-history";
import { consumeAndroidBack } from "@/lib/use-android-back";

declare global {
  interface Window { smartPaperAndroidBack?: () => "handled" | "exit" }
}

export function AndroidBackRoot() {
  const pathname = usePathname();
  const router = useRouter();
  const navigating = useRef(false);
  const committedPath = useRef(pathname);
  useLayoutEffect(() => { committedPath.current = pathname; navigating.current = false; }, [pathname]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let dispose: (() => void) | undefined;
    let unlockTimer: number | undefined;
    // Install after Next's history wrappers; keep its router state and methods intact.
    const initialization = window.setTimeout(() => {
      const appHistory = installAppHistory(window.history, window.location);
      const pop = () => {
        // Query/hash-only traversals do not change usePathname.
        if ((window.location.pathname.replace(/\/+$/, "") || "/") === committedPath.current) {
          window.requestAnimationFrame(() => { navigating.current = false; });
        }
      };
      window.addEventListener("popstate", pop);
      const handle = (): "handled" | "exit" => {
        if (navigating.current || !isAppRoute(new URL(window.location.href), window.location.origin)) return "handled";
        let consumed = false;
        flushSync(() => {
          const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog:modal");
          const top = dialogs[dialogs.length - 1];
          if (top) {
            const cancel = new Event("cancel", { cancelable: true });
            if (top.dispatchEvent(cancel)) top.close();
            consumed = true;
          } else consumed = consumeAndroidBack();
        });
        if (consumed) return "handled";
        if (!appHistory.canGoBack() && window.location.pathname.replace(/\/+$/, "") === "") return "exit";
        navigating.current = true;
        window.clearTimeout(unlockTimer);
        // A failed/cancelled router transition must not leave Back permanently locked.
        unlockTimer = window.setTimeout(() => { navigating.current = false; }, 2000);
        if (appHistory.canGoBack()) router.back();
        else router.replace("/");
        return "handled";
      };
      window.smartPaperAndroidBack = handle;
      dispose = () => {
        if (window.smartPaperAndroidBack === handle) delete window.smartPaperAndroidBack;
        window.removeEventListener("popstate", pop);
        appHistory.dispose();
      };
    }, 0);
    return () => {
      window.clearTimeout(initialization);
      window.clearTimeout(unlockTimer);
      dispose?.();
    };
  }, [router]);
  return null;
}
