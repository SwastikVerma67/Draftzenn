-- Draftzenn — YouTube connection storage (Prompt 20)
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL editor for your project. It creates two
-- tables with deliberately different access rules:
--
--   youtube_connections   Non-secret channel metadata + status. The
--                         signed-in creator can SELECT their own row
--                         directly from the browser (safe: no tokens in
--                         it). All writes happen only from the backend
--                         (service_role key), which bypasses RLS — there
--                         is intentionally no INSERT/UPDATE/DELETE policy
--                         for the anon/authenticated roles.
--
--   youtube_oauth_tokens  Access/refresh tokens. RLS is enabled with NO
--                         policies at all, so anon and authenticated
--                         roles get zero access, full stop. Only the
--                         backend (service_role key, which bypasses RLS
--                         entirely) can ever read or write this table.
--                         The browser can never reach this table.
-- ---------------------------------------------------------------------------

create table if not exists public.youtube_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  channel_id text,
  channel_name text,
  channel_url text,
  subscriber_count integer,
  total_views bigint,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'connecting', 'connected', 'syncing', 'synced', 'error')),
  connected_at timestamptz,
  last_synced_at timestamptz,
  error text,
  updated_at timestamptz not null default now()
);

alter table public.youtube_connections enable row level security;

-- Creators may read only their own connection row. No write policy is
-- defined for anon/authenticated on purpose — all writes go through the
-- backend's service_role key (js/../api/youtube/*.js), which bypasses RLS.
create policy "youtube_connections_select_own"
  on public.youtube_connections for select
  using (auth.uid() = user_id);

create table if not exists public.youtube_oauth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.youtube_oauth_tokens enable row level security;
-- No policies created here at all, intentionally: RLS with zero policies
-- means anon/authenticated roles get NO access whatsoever (default deny).
-- Only requests using the service_role key (server-side /api functions
-- only) can read or write this table, since service_role bypasses RLS.

-- Keep updated_at current on every write from the backend.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.youtube_connections;
create trigger set_updated_at before update on public.youtube_connections
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.youtube_oauth_tokens;
create trigger set_updated_at before update on public.youtube_oauth_tokens
  for each row execute function public.set_updated_at();
