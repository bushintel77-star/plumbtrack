"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props { children: ReactNode }
interface State { failed: boolean }

export class MapErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Map renderer failed", error, info)
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="flex h-full min-h-48 items-center justify-center bg-void p-6 text-center text-ink">
          <div className="max-w-sm">
            <p className="label-mono text-2xs text-pending">MAP UNAVAILABLE</p>
            <p className="mt-2 text-sm text-ink-mid">Live map tiles could not be rendered. Use Map Jobs below to continue dispatching.</p>
            <button type="button" className="mt-4 rounded-md bg-chrome-600 px-3 py-2 text-xs font-semibold text-on-accent" onClick={() => this.setState({ failed: false })}>Retry map</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
