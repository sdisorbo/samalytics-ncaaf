import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "var(--color-accent)",
        "s-bg": "var(--color-bg)",
        "s-surface": "var(--color-surface)",
        "s-border": "var(--color-border)",
        "s-text": "var(--color-text)",
        "s-muted": "var(--color-muted)",
        "s-hover": "var(--color-hover)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        orbitron: ["var(--font-orbitron)", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
