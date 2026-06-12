import type { Metadata, Viewport } from "next";
import { Wix_Madefor_Display, Wix_Madefor_Text } from "next/font/google";
import "./globals.css";

const display = Wix_Madefor_Display({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  display: "swap",
});

const body = Wix_Madefor_Text({
  subsets: ["latin", "cyrillic"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "🦣 Мамонтёнок · Учёт оплат студентов",
  description: "Веб-аппка для двух партнёров: курсы валют, сделки, касса (ДДС)",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
