-- From the platform admin page: put someone in a church by email, and give someone a
-- paid plan by email. Someone with no account yet waits in access_grants, and gets it
-- when they sign in with that address.
--
-- A plan belongs to a church, so a person's free plan lands on the church they own.
-- Nothing is given to an address until its owner has proved it is theirs.

create table public.access_grants (
    id uuid primary key default gen_random_uuid(),
    email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    church_id uuid references public.churches (id) on delete cascade,
    role text check (role in ('owner', 'admin', 'editor', 'viewer')),
    plan text check (plan in ('church', 'multi_campus')),
    granted_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    -- a place in a church, or a plan
    check ((church_id is null) = (role is null) and (role is null) <> (plan is null))
);
create unique index access_grants_place_idx on public.access_grants (email, church_id) where church_id is not null;
create unique index access_grants_plan_idx on public.access_grants (email) where plan is not null;
create index access_grants_church_idx on public.access_grants (church_id);
create index access_grants_granted_by_idx on public.access_grants (granted_by);
alter table public.access_grants enable row level security;
revoke all on public.access_grants from public, anon, authenticated;
grant all on public.access_grants to service_role;

-- A waiting plan lands on a church its person owns, unless that church already has one.
create or replace function public.owner_waiting_plan()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
    waiting public.access_grants%rowtype;
begin
    select g.* into waiting from public.access_grants g
    join auth.users u on lower(u.email) = g.email
    where u.id = new.user_id and u.email_confirmed_at is not null and g.plan is not null
    for update of g;
    if not found or (select l.plan from public.church_limits(new.church_id) l) <> 'free' then
        return new;
    end if;
    insert into public.church_subscriptions (church_id, plan, status) values (new.church_id, waiting.plan, 'active')
    on conflict (church_id) do update set plan = excluded.plan, status = 'active', updated_at = now();
    delete from public.access_grants where id = waiting.id;
    insert into public.platform_admin_log (admin_id, action, target_church, target_user, detail)
    values (waiting.granted_by, 'give_plan', new.church_id, new.user_id, jsonb_build_object('plan', waiting.plan));
    return new;
exception when others then
    -- it keeps waiting; making a church must not fail over it
    raise warning 'a waiting plan was not given: %', sqlerrm;
    return new;
end;
$$;
create trigger members_waiting_plan after insert or update of role on public.church_members
    for each row when (new.role = 'owner') execute function public.owner_waiting_plan();

-- The places waiting for someone, once their address is confirmed.
create or replace function public.user_waiting_places()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
    waiting public.access_grants%rowtype;
begin
    for waiting in select * from public.access_grants where email = lower(new.email) and church_id is not null for update loop
        begin
            if not exists (select 1 from public.church_members where church_id = waiting.church_id and user_id = new.id) then
                insert into public.church_members (church_id, user_id, role) values (waiting.church_id, new.id, waiting.role);
            end if;
            delete from public.access_grants where id = waiting.id;
            insert into public.platform_admin_log (admin_id, action, target_church, target_user, detail)
            values (waiting.granted_by, 'add_person', waiting.church_id, new.id, jsonb_build_object('role', waiting.role));
        exception when others then
            -- the church filled up, say: it keeps waiting, and signing in goes on
            raise warning 'a waiting place was not given: %', sqlerrm;
        end;
    end loop;
    return new;
end;
$$;
create trigger on_auth_user_waiting_places after insert or update of email, email_confirmed_at on auth.users
    for each row when (new.email_confirmed_at is not null) execute function public.user_waiting_places();

create or replace function public.platform_add_person(target uuid, person_email text, new_role text)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare
    address text := lower(trim(coalesce(person_email, '')));
    person uuid;
    room integer;
begin
    perform public.require_platform_admin();
    if address !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'That is not an email address' using errcode = '22023';
    end if;
    if new_role is null or new_role not in ('owner', 'admin', 'editor', 'viewer') then
        raise exception 'No such role' using errcode = '22023';
    end if;
    -- one at a time per church, so two adds can't both take the last place
    perform 1 from public.churches where id = target for update;
    if not found then
        raise exception 'No such church' using errcode = 'P0002';
    end if;

    select id into person from auth.users where lower(email) = address and email_confirmed_at is not null order by created_at limit 1;
    if person is not null then
        if exists (select 1 from public.church_members where church_id = target and user_id = person) then
            raise exception 'They are already in this church. Change their role in the list.' using errcode = 'P0001';
        end if;
        insert into public.church_members (church_id, user_id, role) values (target, person, new_role);
        delete from public.access_grants where email = address and church_id = target;
        insert into public.platform_admin_log (admin_id, action, target_church, target_user, detail)
        values ((select auth.uid()), 'add_person', target, person, jsonb_build_object('role', new_role));
        return 'added';
    end if;

    select l.max_members into room from public.church_limits(target) l;
    if (select count(*) from public.church_members where church_id = target)
       + (select count(*) from public.access_grants where church_id = target and email <> address) >= room then
        raise exception 'This plan has room for % people, counting those still to sign in.', room using errcode = 'P0001';
    end if;
    insert into public.access_grants (email, church_id, role, granted_by) values (address, target, new_role, (select auth.uid()))
    on conflict (email, church_id) where church_id is not null do update set role = excluded.role, granted_by = excluded.granted_by;
    insert into public.platform_admin_log (admin_id, action, target_church, detail)
    values ((select auth.uid()), 'invite_person', target, jsonb_build_object('email', address, 'role', new_role));
    return 'waiting';
end;
$$;

create or replace function public.platform_give_plan(person_email text, new_plan text)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare
    address text := lower(trim(coalesce(person_email, '')));
    owned uuid[];
begin
    perform public.require_platform_admin();
    if address !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'That is not an email address' using errcode = '22023';
    end if;
    if new_plan is null or new_plan not in ('church', 'multi_campus') then
        raise exception 'No such plan' using errcode = '22023';
    end if;

    select array_agg(m.church_id) into owned
    from public.church_members m join auth.users u on u.id = m.user_id
    where lower(u.email) = address and u.email_confirmed_at is not null and m.role = 'owner';
    if cardinality(owned) > 1 then
        raise exception 'They own more than one church. Choose its plan under Churches.' using errcode = 'P0001';
    end if;
    if cardinality(owned) = 1 then
        perform public.platform_set_plan(owned[1], new_plan);
        delete from public.access_grants where email = address and plan is not null;
        return 'given';
    end if;

    insert into public.access_grants (email, plan, granted_by) values (address, new_plan, (select auth.uid()))
    on conflict (email) where plan is not null do update set plan = excluded.plan, granted_by = excluded.granted_by;
    insert into public.platform_admin_log (admin_id, action, detail)
    values ((select auth.uid()), 'promise_plan', jsonb_build_object('email', address, 'plan', new_plan));
    return 'waiting';
end;
$$;

create or replace function public.platform_waiting()
returns table (id uuid, email text, church_id uuid, church text, role text, plan text, created_at timestamptz, has_account boolean)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
    perform public.require_platform_admin();
    return query
        select g.id, g.email, g.church_id, c.name, g.role, g.plan, g.created_at,
               exists (select 1 from auth.users u where lower(u.email) = g.email and u.email_confirmed_at is not null)
        from public.access_grants g left join public.churches c on c.id = g.church_id
        order by g.created_at desc;
end;
$$;

create or replace function public.platform_cancel_waiting(target uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
    gone public.access_grants%rowtype;
begin
    perform public.require_platform_admin();
    delete from public.access_grants where id = target returning * into gone;
    if not found then
        raise exception 'That is no longer waiting' using errcode = 'P0002';
    end if;
    insert into public.platform_admin_log (admin_id, action, target_church, detail)
    values ((select auth.uid()), 'cancel_waiting', gone.church_id, jsonb_build_object('email', gone.email, 'was', coalesce(gone.role, gone.plan)));
end;
$$;

do $$
declare
    fn text;
begin
    foreach fn in array array['platform_add_person(uuid, text, text)', 'platform_give_plan(text, text)', 'platform_waiting()', 'platform_cancel_waiting(uuid)'] loop
        execute format('revoke execute on function public.%s from public, anon', fn);
        execute format('grant execute on function public.%s to authenticated', fn);
    end loop;
end $$;
revoke execute on function public.owner_waiting_plan() from public, anon, authenticated;
revoke execute on function public.user_waiting_places() from public, anon, authenticated;
