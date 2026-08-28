/// <reference types="vite/client" />

declare interface Window {
  electron?: {
    platform: string
  }
  // Test bridge: the Zustand store is exposed for Playwright self-healing resets.
  __fieldloop?: {
    getState: () => DispatchStoreSnapshot
    setState: (partial: Record<string, unknown>) => void
  }
}

interface DispatchStoreSnapshot {
  jobs: import('./types').Job[]
  technicians: import('./types').Technician[]
  channels: import('./types').Channel[]
  activeChannelId: string
  selectedJobId: string | null
  paletteOpen: boolean
  clockOn: (jobId: string) => { demoted: string[] }
  clockOff: (jobId: string) => void
  healTimer: (jobId: string) => void
  forceQuoteDraft: (jobId: string) => void
  [key: string]: unknown
}
