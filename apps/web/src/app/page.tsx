"use client";

import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import PlumbTrack from "@/components/PlumbTrack";

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <ErrorBoundary>
      <ToastProvider>
        {mounted ? (
          <PlumbTrack />
        ) : (
          <div className="app-shell flex min-h-screen flex-col" aria-label="Loading PlumbTrack" aria-busy="true">
            <div className="app-header h-[72px] shrink-0" />
            <main className="app-main flex-1 p-4" aria-hidden="true">
              <div className="skeleton skeleton-line w-2/3" />
              <div className="skeleton skeleton-line w-1/2" />
              <div className="mt-6 space-y-3">
                <div className="skeleton skeleton-card" />
                <div className="skeleton skeleton-card" />
              </div>
            </main>
          </div>
        )}
      </ToastProvider>
    </ErrorBoundary>
  );
}
