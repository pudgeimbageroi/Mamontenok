/**
 * Справочник каналов закупки юаней.
 * Один источник истины для лейблов, цветов и подписей.
 */

import type { Channel } from "./types";

export const CHANNELS: {
  value: Channel;
  label: string;
  shortLabel: string;
  sublabel: string;
  /** Классы для бейджа в списках */
  badgeClass: string;
  /** Курс вводится вручную (нет автоподтяжки из API) */
  manualRate: boolean;
}[] = [
  {
    value: "atb",
    label: "АТБ · физлицо",
    shortLabel: "АТБ",
    sublabel: "курс из приложения + 0.03",
    badgeClass: "bg-brand-50 text-brand-700",
    manualRate: false,
  },
  {
    value: "atb_ip",
    label: "АТБ · ИП",
    shortLabel: "АТБ ИП",
    sublabel: "курс из бизнес-приложения",
    badgeClass: "bg-emerald-100 text-emerald-800",
    manualRate: true,
  },
  {
    value: "shage",
    label: "沙哥",
    shortLabel: "沙哥",
    sublabel: "посредник · курс вручную",
    badgeClass: "bg-rose-100 text-rose-800",
    manualRate: true,
  },
];

export function channelInfo(value: Channel | string | null | undefined) {
  return CHANNELS.find((c) => c.value === value) ?? CHANNELS[0];
}

/** Короткая метка канала для строк списка */
export function channelShort(value: Channel | string | null | undefined): string {
  return channelInfo(value).shortLabel;
}
