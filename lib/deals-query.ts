/**
 * ЕДИНСТВЕННАЯ точка доступа к сделкам и кассе.
 *
 * ⚠️ ПРАВИЛО ПРОЕКТА: нигде в коде не должно быть прямых
 * `supabase.from("deals")` / `supabase.from("cashflow")` для чтения.
 * Только функции из этого файла.
 *
 * Причина: фильтр приватности легко забыть в одном запросе из семнадцати,
 * и тогда личная сделка утечёт в общий дашборд или в счётчик. Здесь фильтр
 * применяется всегда и автоматически.
 */

import { cookies } from "next/headers";
import { createSupabaseAdmin } from "./supabase/server";
import type { SessionPayload } from "./auth";
import type { Deal } from "./types";
import type { AuditRow } from "./audit";
import type { CashflowRow } from "./cash-categories";
import type { ClientRecord } from "./clients";
import {
  isOwner,
  resolveViewMode,
  visibilitiesForMode,
  VIEW_MODE_COOKIE,
  type ViewMode,
} from "./visibility";

/**
 * Текущий режим просмотра из куки, с проверкой прав.
 * Не-владелец всегда получит "joint".
 */
export async function getViewMode(session: SessionPayload | null): Promise<ViewMode> {
  const store = await cookies();
  const raw = store.get(VIEW_MODE_COOKIE)?.value;
  return resolveViewMode(raw, session);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Строка фильтра для режима «Всё моё» собирается конкатенацией,
 * поэтому id обязан быть валидным UUID: запятая или скобка внутри
 * изменили бы смысл выражения PostgREST.
 *
 * id приходит из подписанного JWT, то есть уже доверенный — это защита
 * второго уровня на случай, если формат токена когда-нибудь изменится.
 */
function isSafeProfileId(id: string | null | undefined): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/**
 * Сделки, видимые пользователю в данном режиме.
 *
 * Логика фильтра:
 *   - общие сделки видны всем
 *   - личные — только своему владельцу, и только если режим их запросил
 */
export async function fetchDeals(
  session: SessionPayload,
  mode: ViewMode,
): Promise<Deal[]> {
  const supabase = await createSupabaseAdmin();
  const visibilities = visibilitiesForMode(mode);
  const wantsPrivate = visibilities.includes("private");

  let q = supabase.from("deals").select("*").order("date", { ascending: false });

  // Личные данные показываем только владельцу с валидным id.
  // Любое сомнение → общий режим (deny by default).
  const canSeePrivate = wantsPrivate && isOwner(session) && isSafeProfileId(session.profileId);

  if (!canSeePrivate) {
    q = q.eq("visibility", "joint");
  } else if (visibilities.length === 1) {
    // Чисто личный режим — только свои личные
    q = q.eq("visibility", "private").eq("owner_id", session.profileId);
  } else {
    // «Всё моё» — общие + свои личные.
    // PostgREST превратит это в: visibility='joint' OR (visibility='private' AND owner_id=…)
    q = q.or(`visibility.eq.joint,and(visibility.eq.private,owner_id.eq.${session.profileId})`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[deals-query] fetchDeals:", error.message);
    return [];
  }
  return (data ?? []) as Deal[];
}

/**
 * Одна сделка по id — с проверкой доступа.
 *
 * Возвращает null если сделка личная и принадлежит не этому пользователю.
 * Именно здесь закрывается самая опасная дыра: прямая ссылка вида
 * /app/deals/<uuid> в обход списка.
 */
export async function fetchDealById(
  session: SessionPayload,
  id: string,
): Promise<Deal | null> {
  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase.from("deals").select("*").eq("id", id).single();
  if (error || !data) return null;

  const deal = data as Deal;
  if (deal.visibility === "private") {
    if (!isOwner(session)) return null;
    if (deal.owner_id !== session.profileId) return null;
  }
  return deal;
}

/**
 * Движения кассы в рамках режима.
 * Личный вывод денег не должен появляться в общем журнале.
 */
export async function fetchCashflow(
  session: SessionPayload,
  mode: ViewMode,
): Promise<CashflowRow[]> {
  const supabase = await createSupabaseAdmin();
  const visibilities = visibilitiesForMode(mode);
  const wantsPrivate = visibilities.includes("private");

  let q = supabase.from("cashflow").select("*").order("date", { ascending: false });

  const canSeePrivate = wantsPrivate && isOwner(session) && isSafeProfileId(session.profileId);

  if (!canSeePrivate) {
    q = q.eq("visibility", "joint");
  } else if (visibilities.length === 1) {
    q = q.eq("visibility", "private").eq("owner_id", session.profileId);
  } else {
    q = q.or(`visibility.eq.joint,and(visibility.eq.private,owner_id.eq.${session.profileId})`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[deals-query] fetchCashflow:", error.message);
    return [];
  }
  return (data ?? []) as CashflowRow[];
}

/**
 * История изменений одной сделки.
 *
 * Права проверяем через саму сделку: если она недоступна,
 * то и её история — тоже. Иначе аудит стал бы дырой в приватности.
 */
export async function fetchDealAudit(
  session: SessionPayload,
  dealId: string,
): Promise<AuditRow[]> {
  const deal = await fetchDealById(session, dealId);
  if (!deal) return [];

  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("deal_audit")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[deals-query] fetchDealAudit:", error.message);
    return [];
  }
  return (data ?? []) as AuditRow[];
}

/**
 * Карточки клиентов в рамках режима.
 *
 * Приватность работает так же, как у сделок, но с важной оговоркой:
 * клиент помечается личным только пока ВСЕ его сделки личные. Первая же
 * общая сделка «повышает» карточку до общей — это делает триггер в базе.
 * Иначе имя студента всплыло бы у Егора в списке сделок, но не в клиентах.
 */
export async function fetchClients(
  session: SessionPayload,
  mode: ViewMode,
): Promise<ClientRecord[]> {
  const supabase = await createSupabaseAdmin();
  const visibilities = visibilitiesForMode(mode);
  const wantsPrivate = visibilities.includes("private");

  let q = supabase.from("clients").select("*").order("name", { ascending: true });

  const canSeePrivate = wantsPrivate && isOwner(session) && isSafeProfileId(session.profileId);

  if (!canSeePrivate) {
    q = q.eq("visibility", "joint");
  } else if (visibilities.length === 1) {
    q = q.eq("visibility", "private").eq("owner_id", session.profileId);
  } else {
    q = q.or(`visibility.eq.joint,and(visibility.eq.private,owner_id.eq.${session.profileId})`);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[deals-query] fetchClients:", error.message);
    return [];
  }
  return (data ?? []) as ClientRecord[];
}

/** Одна карточка клиента — с той же проверкой доступа, что у сделки */
export async function fetchClientById(
  session: SessionPayload,
  id: string,
): Promise<ClientRecord | null> {
  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
  if (error || !data) return null;

  const client = data as ClientRecord;
  if (client.visibility === "private") {
    if (!isOwner(session)) return null;
    if (client.owner_id !== session.profileId) return null;
  }
  return client;
}

/** Имена авторов правок — чтобы в истории были люди, а не UUID */
export async function fetchProfileNames(): Promise<Record<string, string>> {
  const supabase = await createSupabaseAdmin();
  const { data } = await supabase.from("profiles").select("id, display_name");
  const out: Record<string, string> = {};
  for (const p of data ?? []) out[p.id] = p.display_name;
  return out;
}

/**
 * Сделки для бота. Бот работает ТОЛЬКО с общими —
 * так исключается риск отправить личную сделку не в тот чат.
 */
export async function fetchJointDealsForBot(limit?: number): Promise<Deal[]> {
  const supabase = await createSupabaseAdmin();
  let q = supabase
    .from("deals")
    .select("*")
    .eq("visibility", "joint")
    .order("date", { ascending: false });
  if (limit) q = q.limit(limit);

  const { data, error } = await q;
  if (error) {
    console.error("[deals-query] fetchJointDealsForBot:", error.message);
    return [];
  }
  return (data ?? []) as Deal[];
}

/** Одна общая сделка для бота. Личные боту недоступны в принципе. */
export async function fetchJointDealByIdForBot(id: string): Promise<Deal | null> {
  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .eq("visibility", "joint")
    .single();
  if (error || !data) return null;
  return data as Deal;
}

/** Движения кассы для бота — тоже только общие. */
export async function fetchJointCashflowForBot(): Promise<CashflowRow[]> {
  const supabase = await createSupabaseAdmin();
  const { data, error } = await supabase
    .from("cashflow")
    .select("*")
    .eq("visibility", "joint")
    .order("date", { ascending: false });
  if (error) {
    console.error("[deals-query] fetchJointCashflowForBot:", error.message);
    return [];
  }
  return (data ?? []) as CashflowRow[];
}
