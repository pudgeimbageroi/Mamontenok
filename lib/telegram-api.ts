/**
 * Хелперы для работы с Telegram Bot API.
 */

/**
 * Отправляет текстовое сообщение в чат с ботом.
 */
export async function sendBotMessage(
  chatId: number,
  text: string,
  options: { parse_mode?: "HTML" | "MarkdownV2"; disable_web_page_preview?: boolean } = {},
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode ?? "HTML",
        disable_web_page_preview: options.disable_web_page_preview ?? false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Telegram sendMessage failed", res.status, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Telegram sendMessage error", err);
    return false;
  }
}
