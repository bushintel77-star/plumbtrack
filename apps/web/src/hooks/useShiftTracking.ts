"use client";

import { useEffect, useRef, useState } from "react";

export interface TrackingFix {
  lat: number;
  lng: number;
  /** ISO-8601 UTC timestamp of the fix. */
  at: string;
}

/**
 * Shift-bounded location tracking (workplace surveillance compliance).
 *
 * The geolocation watch exists only while `active` is true — i.e. the
 * technician is logged on and not on an unpaid meal break. Clearing the
 * watch on every deactivation makes off-duty tracking structurally
 * impossible rather than policy-prevented: there is no watcher left alive
 * to accumulate positions once the shift ends or a break starts.
 */
export function useShiftTracking(active: boolean) {
  const [lastFix, setLastFix] = useState<TrackingFix | null>(null);
  const [fixCount, setFixCount] = useState(0);
  const countRef = useRef(0);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        countRef.current += 1;
        setFixCount(countRef.current);
        setLastFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          at: new Date().toISOString(),
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 30_000 },
    );
    // The cleanup below IS the compliance guarantee — never remove it.
    return () => navigator.geolocation.clearWatch(watchId);
  }, [active]);

  return { tracking: active, lastFix, fixCount };
}
