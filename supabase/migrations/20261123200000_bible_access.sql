-- Licensed Bible versions (NIV, NKJV, NLT...) for a church: on a paid plan
-- only, and only after Samuel grants the church's request, as in the
-- Scriptural app. Public-domain versions need none of this.

create table public.bible_access_requests (
    church_id uuid not null references public.churches (id) on delete cascade,
    version text not null check (version ~ '^[A-Z0-9]{2,10}$'),
    status text not null default 'pending' check (status in ('pending', 'granted', 'declined')),
    requested_by uuid references auth.users (id) on delete set null,
    note text,
    created_at timestamptz not null default now(),
    decided_at timestamptz,
    primary key (church_id, version)
);

alter table public.bible_access_requests enable row level security;
create policy "members see their requests" on public.bible_access_requests for select to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin', 'editor', 'viewer']));
revoke all on public.bible_access_requests from anon;
grant select on public.bible_access_requests to authenticated;
grant all on public.bible_access_requests to service_role;

-- Asking: owners and admins of a church on a paid plan. Asking again after a
-- decline reopens the request.
create or replace function public.request_bible_access(target uuid, version_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    current_status text;
begin
    if not public.has_church_role(target, array['owner', 'admin']) then
        raise exception 'Only the church''s owner or an admin can ask' using errcode = '42501';
    end if;
    if (select plan from public.church_limits(target)) = 'free' then
        raise exception 'Licensed versions come with a Church plan' using errcode = 'P0001';
    end if;
    insert into public.bible_access_requests (church_id, version, requested_by)
    values (target, upper(version_code), (select auth.uid()))
    on conflict (church_id, version) do update set status = case when public.bible_access_requests.status = 'declined' then 'pending' else public.bible_access_requests.status end,
        requested_by = excluded.requested_by
    returning status into current_status;
    return current_status;
end;
$$;
revoke execute on function public.request_bible_access(uuid, text) from public, anon;
grant execute on function public.request_bible_access(uuid, text) to authenticated;
