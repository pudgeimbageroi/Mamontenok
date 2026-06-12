import { Home, Calculator, ClipboardList, Wallet, Settings } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/app",          label: "Главная",      icon: Home },
  { href: "/app/calc",     label: "Калькулятор",  icon: Calculator },
  { href: "/app/deals",    label: "Сделки",       icon: ClipboardList },
  { href: "/app/cash",     label: "Касса",        icon: Wallet },
  { href: "/app/settings", label: "Настройки",    icon: Settings },
] as const;
