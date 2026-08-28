import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { Radio, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDispatchStore } from '@/store/dispatchStore'

function useWallClock(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => n.toString().padStart(2, '0'))
    .join(':')
}

export function TopBar(): JSX.Element {
  const clock = useWallClock()
  const setPaletteOpen = useDispatchStore((s) => s.setPaletteOpen)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = window.localStorage.getItem('fieldloop-theme')
    const next = saved === 'light' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
  }, [])

  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    window.localStorage.setItem('fieldloop-theme', next)
  }

  return (
    <header className="glass-strong z-20 flex h-16 shrink-0 items-center justify-between border-x-0 border-t-0 px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-[0_0_18px_rgba(78,140,255,0.45)] dispatch-control">
          FL
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">FieldLoop HQ</div>
          <div className="text-[11px] text-muted-foreground">Dispatch Command Center</div>
        </div>
        <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
          <Radio className="h-3 w-3 animate-pulse-soft" />
          Live
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="dispatch-control h-9 gap-2 border-white/10 bg-white/5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setPaletteOpen(true)}
          data-testid="palette-trigger"
        >
          <Search className="h-3.5 w-3.5" />
          Search jobs
          <kbd className="tnum rounded border border-white/10 bg-white/5 px-1 text-[10px]">Ctrl K</kbd>
        </Button>
        <div className="tnum text-lg font-semibold tracking-tight text-foreground" data-testid="wall-clock">
          {clock}
        </div>
      </div>
    </header>
  )
}
