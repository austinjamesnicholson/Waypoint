-- Run once in your Supabase project's SQL Editor.
begin;

create table if not exists public.waypoint_documents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  data jsonb not null check ((
    jsonb_typeof(data) = 'object'
    and jsonb_typeof(data->'tasks') = 'array'
    and jsonb_typeof(data->'projects') = 'array'
    and jsonb_typeof(data->'categories') = 'array'
  ) is true),
  updated_at timestamptz not null default now()
);
alter table public.waypoint_documents enable row level security;
revoke all on public.waypoint_documents from anon;
grant select, insert, update on public.waypoint_documents to authenticated;
drop policy if exists "Own document only" on public.waypoint_documents;
create policy "Own document only" on public.waypoint_documents
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A revision check makes reading and writing safe across multiple devices.
-- A stale device gets a conflict instead of overwriting a newer document.
create or replace function public.save_waypoint_document(
  expected_revision integer, document jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  saved public.waypoint_documents;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save' using errcode = '28000';
  end if;
  if expected_revision = 0 then
    insert into public.waypoint_documents (user_id, revision, data)
    values (auth.uid(), 1, document)
    on conflict (user_id) do nothing
    returning * into saved;
  else
    update public.waypoint_documents
    set data = document, revision = revision + 1, updated_at = now()
    where user_id = auth.uid() and revision = expected_revision
    returning * into saved;
  end if;
  if saved.user_id is null then
    raise exception 'Document changed on another device' using errcode = '40001';
  end if;
  return jsonb_build_object('revision', saved.revision, 'data', saved.data);
end;
$$;
revoke all on function public.save_waypoint_document(integer, jsonb) from public, anon;
grant execute on function public.save_waypoint_document(integer, jsonb) to authenticated;
commit;
