import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "mamontenok_session";

/**
 * Middleware: защищаем все маршруты под /app/* — редирект на / если нет сессии.
 *
 * Important: middleware работает на Edge runtime — поэтому здесь jwtVerify
 * inline, а не через @/lib/auth (там используется `next/headers` который
 * не работает в middleware).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Защищаем только /app/*
  if (!pathname.startsWith("/app")) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(new URL("/", req.url));

  const secret = process.env.SESSION_SECRET;
  if (!secret) return NextResponse.redirect(new URL("/", req.url));

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    // Невалидный/истёкший токен — на главную
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
}

export const config = {
  matcher: ["/app/:path*"],
};
