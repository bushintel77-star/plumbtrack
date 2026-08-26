import type { Config } from "tailwindcss";
import type { PluginAPI } from "tailwindcss/types/config";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — every utility class resolves to a CSS variable
        // defined in globals.css, so a theme/colourway change is a token-file
        // edit. No raw palette colours live in components.
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        "accent-line": "var(--accent-border)",

        // Text hierarchy
        ink: "var(--app-text)",
        "ink-mid": "var(--app-muted)",
        "ink-low": "var(--app-subtle)",

        // Text on solid accent/urgent/scrim fills — theme-invariant white,
        // but named by role so fills can change without touching components.
        "on-accent": "var(--app-on-accent)",
        edge: "var(--edge-highlight)",
        recess: "var(--chassis-recess)",

        // Surface fills & hairlines
        fill: "var(--surface-hover-subtle)",
        "fill-strong": "var(--surface-hover-strong)",
        line: "var(--surface-border)",
        "line-strong": "var(--surface-border-strong)",
        scrim: "var(--scrim)",

        // Status system (red / amber / green — theme-invariant meaning)
        urgent: "var(--status-urgent)",
        "urgent-dim": "var(--status-urgent-dim)",
        "urgent-line": "var(--status-urgent-border)",
        pending: "var(--status-pending)",
        "pending-dim": "var(--status-pending-dim)",
        "pending-line": "var(--status-pending-border)",
        complete: "var(--status-complete)",
        "complete-dim": "var(--status-complete-dim)",
        "complete-line": "var(--status-complete-border)",

        // Hardware-grade activity roles
        "activity-ink": "var(--text-hero)",
        "activity-muted": "var(--text-muted)",
      },
    },
  },
  boxShadow: {
    hardware: "var(--btn-primary-shadow)",
    chassis: "var(--chassis-shadow)",
  },
  // Gate every `hover:*` utility behind a real hover-capable pointer. Without
  // this, touch devices apply the :hover style on tap and it sticks until the
  // next tap elsewhere — the classic "sticky hover" mobile annoyance. Desktop
  // mice are unaffected (primary pointer reports hover: hover). Registered as
  // a plugin because a bare `variants: { hover: [...] }` override is ignored
  // by Tailwind 3.4 for built-in variants.
  plugins: [
    ({ addVariant }: PluginAPI) => {
      addVariant("hover", "@media (hover: hover) { &:hover }");
    },
  ],
};

export default config;
