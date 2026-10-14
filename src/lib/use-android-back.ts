"use client";

import { useLayoutEffect, useRef } from "react";

const handlers = new Map<symbol, { priority: number; run: () => boolean }>();

export function consumeAndroidBack(): boolean {
  return [...handlers.values()].sort((a, b) => b.priority - a.priority).some(handler => handler.run());
}

/** Return true when the current surface or departure guard consumes Back. */
export function useAndroidBack(handler: () => boolean, priority = 0): void {
  const current = useRef(handler);
  useLayoutEffect(() => { current.current = handler; });
  useLayoutEffect(() => {
    const key = Symbol();
    handlers.set(key, { priority, run: () => current.current() });
    return () => { handlers.delete(key); };
  }, [priority]);
}
