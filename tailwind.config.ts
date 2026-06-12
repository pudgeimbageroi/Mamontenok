import type { Config } from "tailwindcss";

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
        // ─── Брендовая палитра «Мамонтёнок» ───
        brand: {
          DEFAULT: "#0883FF",
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#0883FF",
          600: "#0066CC",
          700: "#1E40AF",
          800: "#003D7A",
          900: "#1E3A8A",
        },
        ink: {
          900: "#0F172A",
          700: "#334155",
          500: "#64748B",
          300: "#CBD5E1",
          200: "#E2E8F0",
          100: "#F1F5F9",
          50: "#F8FAFC",
        },
        success: {
          DEFAULT: "#047857",
          bg: "#ECFDF5",
        },
        danger: {
          DEFAULT: "#B91C1C",
          bg: "#FEE2E2",
        },
        warning: {
          DEFAULT: "#92400E",
          bg: "#FEF3C7",
        },
        input: {
          bg: "#FFFBEB",
        },
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
    },
  },
  plugins: [],
};

export default config;
