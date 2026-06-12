"use client";

import Script from "next/script";

interface Props {
  botUsername: string;
  /** Auth-callback URL — например /api/auth/telegram */
  authUrl?: string;
}

/**
 * Telegram Login Widget.
 *
 * Когда юзер нажимает на кнопку и подтверждает в Telegram —
 * браузер делает GET-редирект на `authUrl` с подписанными query-параметрами:
 *   ?id=...&first_name=...&auth_date=...&hash=...
 *
 * Endpoint /api/auth/telegram проверяет HMAC и выставляет session cookie.
 */
export function TelegramLoginButton({ botUsername, authUrl = "/api/auth/telegram" }: Props) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-widget.js?22" strategy="afterInteractive" />
      <div
        ref={(el) => {
          if (!el || el.querySelector("script")) return;
          const script = document.createElement("script");
          script.src = "https://telegram.org/js/telegram-widget.js?22";
          script.async = true;
          script.setAttribute("data-telegram-login", botUsername);
          script.setAttribute("data-size", "large");
          script.setAttribute("data-radius", "12");
          script.setAttribute("data-auth-url", `${window.location.origin}${authUrl}`);
          script.setAttribute("data-request-access", "write");
          el.appendChild(script);
        }}
      />
    </>
  );
}
