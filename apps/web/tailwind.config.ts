import type { Config } from "tailwindcss";

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
        accent: "#E8871E",
        canvas: "#F7F5F1",
      },
    },
  },
  plugins: [],
};

export default config;
