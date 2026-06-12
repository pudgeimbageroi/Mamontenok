-- ═══════════════════════════════════════════════════════════════════
-- Auth tokens для magic-link авторизации через бота
-- ═══════════════════════════════════════════════════════════════════

create table public.auth_tokens (
  id uuid primary key default uuid_generate_v4(),
  token text unique not null,             -- случайная строка 64 hex
  telegram_id bigint,                      -- заполняется когда юзер сделал /start в боте
  confirmed_at timestamptz,                -- когда бот подтвердил пользователя
  consumed_at timestamptz,                 -- когда юзер кликнул magic-link
  expires_at timestamptz not null,         -- TTL 15 минут от создания
  created_at timestamptz default now()
);

create index auth_tokens_token_idx on public.auth_tokens (token);
create index auth_tokens_expires_at_idx on public.auth_tokens (expires_at);

alter table public.auth_tokens enable row level security;
-- Никаких политик — доступ только через service role в server-side route handlers
