-- Licensed Bible access for churches: automatic for the churches the platform
-- owner trusts, and an approval queue for every other church.
--
-- churches.auto_grant_bible: when true, a request for a licensed version is
-- granted at once instead of waiting for a decision.
--
-- platform_admins: accounts that may decide requests for any church. Read and
-- written by the database only; clients get no policy on it.

alter table public.churches
    add column if not exists auto_grant_bible boolean not null default false;

-- Dominion City Mississauga: every licensed request is granted at once.
update public.churches
    set auto_grant_bible = true
    where id = '4f07211b-aed4-436b-9454-7109ea476288';

create table if not exists public.platform_admins (
    user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
grant all on public.platform_admins to service_role;

insert into public.platform_admins (user_id)
    values ('c61160bc-e9e7-48f2-bad5-829d54f848e1')
    on conflict do nothing;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Asking: an auto-grant church gets the grant at once; others wait in the queue.
create or replace function public.request_bible_access(target uuid, version_code text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    current_status text;
    auto_grant boolean;
begin
    if not public.has_church_role(target, array['owner', 'admin']) then
        raise exception 'Only the church''s owner or an admin can ask' using errcode = '42501';
    end if;
    if (select plan from public.church_limits(target)) = 'free' then
        raise exception 'Licensed versions come with a Church plan' using errcode = 'P0001';
    end if;
    select c.auto_grant_bible into auto_grant from public.churches c where c.id = target;
    insert into public.bible_access_requests (church_id, version, requested_by, status, decided_at)
    values (
        target, upper(version_code), (select auth.uid()),
        case when auto_grant then 'granted' else 'pending' end,
        case when auto_grant then now() else null end
    )
    on conflict (church_id, version) do update set
        status = case
            when public.bible_access_requests.status = 'granted' then 'granted'
            when auto_grant then 'granted'
            when public.bible_access_requests.status = 'declined' then 'pending'
            else public.bible_access_requests.status
        end,
        decided_at = case when auto_grant and public.bible_access_requests.status <> 'granted' then now() else public.bible_access_requests.decided_at end,
        requested_by = excluded.requested_by
    returning status into current_status;
    return current_status;
end;
$$;

-- The platform owner's queue: every request still waiting, oldest first.
create or replace function public.platform_bible_access_queue()
returns table (church_id uuid, church_name text, version text, requested_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admins only' using errcode = '42501';
    end if;
    return query
        select r.church_id, c.name, r.version, r.created_at
        from public.bible_access_requests r
        join public.churches c on c.id = r.church_id
        where r.status = 'pending'
        order by r.created_at;
end;
$$;

-- Decide one request. decision is 'granted' or 'declined'.
create or replace function public.platform_decide_bible_access(target uuid, version_code text, decision text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admins only' using errcode = '42501';
    end if;
    if decision not in ('granted', 'declined') then
        raise exception 'decision must be granted or declined' using errcode = '22023';
    end if;
    update public.bible_access_requests r
        set status = decision, decided_at = now()
        where r.church_id = target and r.version = upper(version_code);
    return decision;
end;
$$;

revoke execute on function public.platform_bible_access_queue() from public, anon;
grant execute on function public.platform_bible_access_queue() to authenticated;
revoke execute on function public.platform_decide_bible_access(uuid, text, text) from public, anon;
grant execute on function public.platform_decide_bible_access(uuid, text, text) to authenticated;
