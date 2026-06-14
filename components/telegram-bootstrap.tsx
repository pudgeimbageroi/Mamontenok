"use client";

import { useEffect, useState } from "react";

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number } };
  ready: () => void;
  expand: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string>;
  MainButton?: { hide: () => void };
  BackButton?: { hide: () => void; show: () => void; onClick: (cb: () => void) => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/**
 * Bootstrap для Telegram Mini App:
 * - Если открыто в Telegram → берём initData, шлём на /api/auth/tg-webapp
 * - При успехе перезагружаем страницу (теперь с сессией → middleware пустит в /app)
 */
export function TelegramBootstrap({ redirectTo = "/app" }: { redirectTo?: string }) {
  const [status, setStatus] = useState<"idle" | "auth" | "done" | "error">("idle");

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg || !tg.initData) return; // не в Telegram

    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.("#0883FF");
    tg.setBackgroundColor?.("#F8FAFC");

    setStatus("auth");
    fetch("/api/auth/tg-webapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tg.initData }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then(() => {
        setStatus("done");
        window.location.href = redirectTo;
      })
      .catch(() => setStatus("error"));
  }, [redirectTo]);

  if (status === "auth") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-5xl mb-3 animate-bounce">🦣</div>
          <p className="font-display font-semibold text-ink-900">Входим…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white p-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">😵</div>
          <p className="font-display font-semibold text-ink-900 mb-2">Не получилось войти</p>
          <p className="text-sm text-ink-500">Если ты в списке доверенных — попробуй переоткрыть Mini App. Если нет — стукни Семёну.</p>
        </div>
      </div>
    );
  }

  return null;
}
