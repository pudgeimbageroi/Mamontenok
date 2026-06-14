"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Возвращает функцию, которая откладывает вызов исходной на `delay` ms.
 * Если её зовут чаще — старый таймер сбрасывается, считается заново.
 * Использует ref, чтобы не пересоздавать функцию при ре-рендерах.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fnRef.current = fn; }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback((...args: Args) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delay);
  }, [delay]);
}
