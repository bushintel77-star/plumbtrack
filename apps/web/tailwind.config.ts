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
        ink: "#1C2B39",
        // Theme-driven brand accent — orange in dark mode, construction blue
        // in light mode (see --accent overrides in globals.css). Keeping it a
        // CSS variable means every bg-/text-/border-accent utility flips with
        // the theme automatically.
        accent: "var(--accent)",
        canvas: "#F7F5F1",
      },
    },
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
