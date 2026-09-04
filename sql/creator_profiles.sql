-- =============================================================================
-- Draftzenn — Creator Profiles
-- -----------------------------------------------------------------------------
-- WHERE TO RUN THIS: Supabase Dashboard → your project → SQL Editor →
-- "New query" → paste this entire file → Run.
--
-- One row per authenticated user (name, platform, niche, content type),
-- read/written from Edit Profile via js/profile-provider.js.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.creator_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  creator_name  text not null check (char_length(trim(creator_name)) between 2 and 80),
  platform      text not null check (platform in ('YouTube', 'Instagram', 'TikTok', 'Other')),
  niche         text not null check (
                    niche in (
                      'Gaming', 'Tech', 'Education', 'Fitness',
                      'Entertainment', 'Finance', 'Lifestyle', 'Other'
                    )
                  ),
  content_type  text not null check (content_type in ('Shorts/Reels', 'Long-form', 'Both', 'Other')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.creator_profiles is
  'One row per user (user_id is unique): the Edit Profile / onboarding answers used to personalize Creator Radar.';

-- ---------------------------------------------------------------------------
-- Keep updated_at current on every UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.creator_profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_creator_profiles_updated_at on public.creator_profiles;

create trigger trg_creator_profiles_updated_at
  before update on public.creator_profiles
  for each row
  execute function public.creator_profiles_set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — users may only ever see/change their OWN profile row.
-- Only SELECT, INSERT, UPDATE are granted (no DELETE policy exists, so no
-- one — not even the row's owner — can delete a profile via the anon key).
-- ---------------------------------------------------------------------------
alter table public.creator_profiles enable row level security;

drop policy if exists "creator_profiles_select_own" on public.creator_profiles;
create policy "creator_profiles_select_own"
  on public.creator_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "creator_profiles_insert_own" on public.creator_profiles;
create policy "creator_profiles_insert_own"
  on public.creator_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "creator_profiles_update_own" on public.creator_profiles;
create policy "creator_profiles_update_own"
  on public.creator_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No policy allows access to rows where auth.uid() <> user_id, and there is
-- no policy at all for the `anon` role, so signed-out requests see nothing.
