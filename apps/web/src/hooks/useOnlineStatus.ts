"use client";

import { useEffect, useState, useCallback } from "react";

/** Reactive online/offline status backed by the browser's navigator.onLine
 *  and the `online`/`offline` window events.  Returns false once and only
 *  once the browser has confirmed connectivity at least once (avoids a
 *  blink on initial page-load before navigator.onLine is settled). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  const goOnline = useCallback(() => setOnline(true), []);
  const goOffline = useCallback(() => setOnline(false), []);

  useEffect(() => {
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [goOnline, goOffline]);

  return online;
}