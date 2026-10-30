-- Kumquat Kite lightweight POC — per-person preferences (feedback 03, ticket 19).
-- One row per person: whether they took up or put off the walkthrough, and the run they are on (the sample project it
-- follows, and whether it is paused). Progress itself is not stored: each step is read from that project's saved
-- state, so it can never disagree with the records. Each person reads and writes only their own row, through the
-- app server's data API, under row-level security. These are not business data: the seed and the demo reset leave them alone, and
-- a run whose project no longer exists (after a reset) is offered a fresh start.
create table public.user_preferences (
  user_id     uuid primary key default app.uid() references public.profiles(user_id) on delete cascade,
  walkthrough jsonb not null default '{}'::jsonb
              check (jsonb_typeof(walkthrough) = 'object' and octet_length(walkthrough::text) < 4096),
  updated_at  timestamptz not null default now()
);

create or replace function public.user_preferences_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger user_preferences_touch before insert or update on public.user_preferences
  for each row execute function public.user_preferences_touch();

alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from public, kk_app;
grant select on public.user_preferences to kk_app;
grant insert (walkthrough) on public.user_preferences to kk_app;
grant update (walkthrough) on public.user_preferences to kk_app;
create policy own_read on public.user_preferences for select to kk_app using (user_id = app.uid());
create policy own_insert on public.user_preferences for insert to kk_app with check (user_id = app.uid());
create policy own_update on public.user_preferences for update to kk_app
  using (user_id = app.uid()) with check (user_id = app.uid());
revoke all on function public.user_preferences_touch() from public, kk_app;
