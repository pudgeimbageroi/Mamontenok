import type { Config } from "tailwindcss";

/**
 * Палитра целиком построена на CSS-переменных (см. app/globals.css).
 *
 * Это даёт две вещи бесплатно:
 *   1. Тёмная тема — без единого dark: префикса в компонентах.
 *      Переменные переопределяются на .dark, классы остаются те же.
 *   2. Смена акцента по режиму просмотра (общий / личный / всё моё).
 *
 * Формат «R G B» через пробел + <alpha-value> нужен, чтобы работали
 * модификаторы прозрачности: bg-surface/80, border-line/50 и т.д.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

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
        // ─── Акцент. Меняется вместе с режимом просмотра ───
        brand: {
          DEFAULT: v("brand-500"),
          50: v("brand-50"),
          100: v("brand-100"),
          200: v("brand-200"),
          300: v("brand-300"),
          400: v("brand-400"),
          500: v("brand-500"),
          600: v("brand-600"),
          700: v("brand-700"),
          800: v("brand-800"),
          900: v("brand-900"),
          /**
           * Заливка под белым текстом: кнопки, активные чипы, блоки итога.
           * Темнее brand-500, потому что белым по нему читать тяжело —
           * зелёный акцент давал контраст 2.54 при норме 4.5.
           */
          solid: v("brand-solid"),
          /** Наведение: всегда темнее, а не светлее — см. globals.css */
          "solid-hover": v("brand-solid-hover"),
        },

        // ─── Поверхности ───
        // surface — карточки и панели, поднятые над фоном страницы
        surface: {
          DEFAULT: v("surface"),
          raised: v("surface-raised"),
          sunken: v("surface-sunken"),
        },

        // ─── Нейтральная шкала. В тёмной теме инвертируется ───
        // ink-50 всегда «дальше всего от текста», ink-900 — сам текст
        ink: {
          900: v("ink-900"),
          800: v("ink-800"),
          700: v("ink-700"),
          500: v("ink-500"),
          400: v("ink-400"),
          300: v("ink-300"),
          200: v("ink-200"),
          100: v("ink-100"),
          50: v("ink-50"),
        },

        // ─── Линии ───
        line: {
          DEFAULT: v("line"),
          strong: v("line-strong"),
        },

        // ─── Смысловые цвета. Не зависят от акцента режима ───
        success: { DEFAULT: v("success"), bg: v("success-bg") },
        danger: { DEFAULT: v("danger"), bg: v("danger-bg") },
        warning: { DEFAULT: v("warning"), bg: v("warning-bg") },

        input: { bg: v("input-bg") },

        border: v("line"),
        background: v("ink-50"),
        foreground: v("ink-900"),
        muted: { DEFAULT: v("ink-100"), foreground: v("ink-500") },
      },

      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },

      // Плотная сетка терминала: радиусы меньше привычных
      borderRadius: {
        sm: "0.25rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.625rem",
        "2xl": "0.75rem",
        "3xl": "1rem",
      },

      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },

      // Микро-подписи колонок и секций
      letterSpacing: {
        micro: "0.09em",
      },
    },
  },
  plugins: [],
};

export default config;
