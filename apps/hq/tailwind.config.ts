import type { Config } from "tailwindcss"
import type { PluginAPI } from "tailwindcss/types/config"
import animate from "tailwindcss-animate"

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        // Field legibility floor — the smallest step any text may use.
        "2xs": ["10px", { lineHeight: "14px" }]
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "IBM Plex Sans", "Trebuchet MS", "sans-serif"],
        display: ["var(--font-big-shoulders)", "Big Shoulders Display", "sans-serif"],
        mono: [
          "var(--font-plex-mono)",
          "IBM Plex Mono",
          "SF Mono",
          "Cascadia Code",
          "monospace"
        ]
      },
      colors: {
        /* ═══ Semantic tokens — the field agent's system (apps/web) ═══════ */
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        "accent-line": "var(--accent-border)",

        ink: "var(--app-text)",
        "ink-mid": "var(--app-muted)",
        "ink-low": "var(--app-subtle)",
        "on-accent": "var(--app-on-accent)",
        edge: "var(--edge-highlight)",
        recess: "var(--chassis-recess)",

        fill: "var(--divider-etch)",
        "fill-strong": "var(--edge-highlight)",
        line: "var(--divider-etch)",
        "line-strong": "var(--edge-highlight)",
        scrim: "var(--edge-shadow)",

        /* Chrome ramp — exposed for direct brand use */
        chrome: {
          200: "var(--chrome-200)",
          400: "var(--chrome-400)",
          600: "var(--chrome-600)",
          glass: "var(--chassis-glass)",
          void: "var(--chassis-void)"
        },

        /* Status system (red / amber / green / teal — theme-invariant) */
        urgent: "var(--status-urgent)",
        "urgent-wash": "var(--wash-urgent)",
        pending: "var(--status-pending)",
        "pending-wash": "var(--wash-pending)",
        complete: "var(--status-complete)",
        "complete-wash": "var(--wash-complete)",
        active: "var(--status-active)",
        "active-wash": "var(--wash-active)",
        "chrome-wash": "var(--wash-chrome)",

        /* Person-identity colors */
        "person-1": "var(--person-1)",
        "person-2": "var(--person-2)",
        "person-3": "var(--person-3)",
        "person-4": "var(--person-4)",

        /* ═══ shadcn bridge — same tokens, aliased for ui primitives ══════ */
        background: "var(--chassis-void)",
        foreground: "var(--app-text)",
        primary: {
          DEFAULT: "var(--chrome-600)",
          foreground: "#ffffff"
        },
        secondary: {
          DEFAULT: "var(--chassis-glass)",
          foreground: "var(--chrome-200)"
        },
        destructive: {
          DEFAULT: "var(--status-urgent)",
          foreground: "#ffffff"
        },
        muted: {
          DEFAULT: "var(--divider-etch)",
          foreground: "var(--app-muted)"
        },
        popover: {
          DEFAULT: "var(--panel-strong)",
          foreground: "var(--app-text)"
        },
        card: {
          DEFAULT: "var(--panel)",
          foreground: "var(--app-text)"
        },
        border: "var(--divider-etch)",
        input: "var(--divider-etch)",
        ring: "var(--chrome-400)"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" }
        },
        "glow-active": {
          "0%, 100%": { boxShadow: "0 0 0 0 color-mix(in srgb, var(--status-active) 35%, transparent)" },
          "50%": { boxShadow: "0 0 12px 2px color-mix(in srgb, var(--status-active) 25%, transparent)" }
        }
      },
      animation: {
        "pulse-soft": "pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow-active": "glow-active 2s ease-in-out infinite"
      }
    }
  },
  boxShadow: {
    hardware: "var(--btn-primary-shadow)",
    chassis: "var(--chassis-shadow)"
  },
  // Gate every `hover:*` utility behind a real hover-capable pointer (field
  // agent convention — prevents sticky hover on touch).
  plugins: [
    animate,
    ({ addVariant }: PluginAPI) => {
      addVariant("hover", "@media (hover: hover) { &:hover }")
    }
  ]
}

export default config
