import { Home, Calculator, ClipboardList, Users, Wallet } from "lucide-react";

/**
 * Настройки убраны из основной навигации: экран почти пустой,
 * а место в нижних табах на телефоне дороже.
 */
export const NAV_ITEMS = [
  { href: "/app",         label: "Главная",     icon: Home },
  { href: "/app/calc",    label: "Калькулятор", icon: Calculator },
  { href: "/app/deals",   label: "Сделки",      icon: ClipboardList },
  { href: "/app/clients", label: "Клиенты",     icon: Users },
  { href: "/app/cash",    label: "Касса",       icon: Wallet },
] as const;
