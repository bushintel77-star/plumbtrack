export interface EvidenceCoordinates {
  lat: number;
  lng: number;
}

/**
 * Read one best-effort position for a compliance event. A missing permission,
 * unavailable sensor, or timeout never blocks the field workflow; callers keep
 * the event timestamp and record null coordinates instead.
 */
export function captureEvidenceCoordinates(): Promise<EvidenceCoordinates | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: EvidenceCoordinates | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timeout = window.setTimeout(() => finish(null), 1_500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeout);
        finish({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        window.clearTimeout(timeout);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: 1_500, maximumAge: 60_000 },
    );
  });
}
