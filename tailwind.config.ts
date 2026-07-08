import type { Config } from "tailwindcss";

/**
 * Палитра переведена на CSS-переменные (rgb triplets) — значения задаются
 * в app/globals.css для :root (светлая) и .dark (тёмная).
 * Компоненты по-прежнему используют ink, brand, white и т.д. — они просто
 * «перекрашиваются» темой автоматически.
 */
const withVar = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // карточка/поверхность (bg-white → тема-зависимый surface)
        white: withVar("--card"),
        card: withVar("--card"),
        surface: withVar("--ink-50"),

        brand: {
          DEFAULT: withVar("--brand-500"),
          50: withVar("--brand-50"),
          100: withVar("--brand-100"),
          200: withVar("--brand-200"),
          300: withVar("--brand-300"),
          400: withVar("--brand-400"),
          500: withVar("--brand-500"),
          600: withVar("--brand-600"),
          700: withVar("--brand-700"),
          800: withVar("--brand-800"),
          900: withVar("--brand-900"),
        },
        ink: {
          900: withVar("--ink-900"),
          700: withVar("--ink-700"),
          500: withVar("--ink-500"),
          300: withVar("--ink-300"),
          200: withVar("--ink-200"),
          100: withVar("--ink-100"),
          50: withVar("--ink-50"),
        },
        success: { DEFAULT: withVar("--success"), bg: withVar("--success-bg") },
        danger: { DEFAULT: withVar("--danger"), bg: withVar("--danger-bg") },
        warning: { DEFAULT: withVar("--warning"), bg: withVar("--warning-bg") },
        input: { bg: withVar("--input-bg") },

        // shadcn-совместимые токены
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
