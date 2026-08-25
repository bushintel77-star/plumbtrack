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
          <div className="app-shell max-w-md mx-auto min-h-screen" aria-label="Loading PlumbTrack" />
        )}
      </ToastProvider>
    </ErrorBoundary>
  );
}
