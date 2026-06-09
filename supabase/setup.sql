create table if not exists public.gym_app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gym_app_states enable row level security;

drop policy if exists "gym_app_states_select_own" on public.gym_app_states;
drop policy if exists "gym_app_states_insert_own" on public.gym_app_states;
drop policy if exists "gym_app_states_update_own" on public.gym_app_states;
drop policy if exists "gym_app_states_delete_own" on public.gym_app_states;

create policy "gym_app_states_select_own"
on public.gym_app_states
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "gym_app_states_insert_own"
on public.gym_app_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "gym_app_states_update_own"
on public.gym_app_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "gym_app_states_delete_own"
on public.gym_app_states
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gym-photos',
  'gym-photos',
  false,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "gym_photos_select_own" on storage.objects;
drop policy if exists "gym_photos_insert_own" on storage.objects;
drop policy if exists "gym_photos_update_own" on storage.objects;
drop policy if exists "gym_photos_delete_own" on storage.objects;

create policy "gym_photos_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'gym-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "gym_photos_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'gym-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "gym_photos_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'gym-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'gym-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "gym_photos_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'gym-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
