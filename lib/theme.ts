/**
 * Тема оформления: светлая / тёмная / по системе.
 *
 * Хранится в куке, а не в localStorage — чтобы сервер знал тему
 * ещё до отрисовки и страница не мигала белым при загрузке.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_COOKIE = "mamontenok_theme";

export function normalizeTheme(raw: string | null | undefined): Theme {
  return raw === "light" || raw === "dark" ? raw : "system";
}

/**
 * Скрипт, который ставит класс .dark до первой отрисовки.
 * Вставляется инлайном в <head> — иначе при тёмной теме
 * успевает мелькнуть белый фон.
 */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var m = document.cookie.match(/${THEME_COOKIE}=(light|dark)/);
    var t = m ? m[1] : null;
    var dark = t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`.trim();
