/**
 * Справочник каналов закупки юаней.
 * Один источник истины для лейблов, цветов и иконок.
 */

import type { Channel } from "./types";

export const CHANNELS: {
  value: Channel;
  label: string;
  shortLabel: string;
  sublabel: string;
  /** Классы для бейджа в списках */
  badgeClass: string;
}[] = [
  {
    value: "atb",
    label: "АТБ Bank",
    shortLabel: "АТБ",
    sublabel: "через приложение банка",
    badgeClass: "bg-brand-50 text-brand-700",
  },
  {
    value: "rshb",
    label: "Биржа РСХБ",
    shortLabel: "РСХБ",
    sublabel: "MOEX · тариф Инвестор",
    badgeClass: "bg-amber-100 text-amber-800",
  },
  {
    value: "shage",
    label: "沙哥",
    shortLabel: "沙哥",
    sublabel: "посредник · курс вручную",
    badgeClass: "bg-rose-100 text-rose-800",
  },
];

export function channelInfo(value: Channel | string | null | undefined) {
  return CHANNELS.find((c) => c.value === value) ?? CHANNELS[0];
}

/** Короткая метка канала для строк списка */
export function channelShort(value: Channel | string | null | undefined): string {
  return channelInfo(value).shortLabel;
}
