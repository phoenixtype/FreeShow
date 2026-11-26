-- Managing people: a list with emails for owners and admins, role changes,
-- removal, ownership transfer, and invites that carry a role.
-- Every function checks the caller itself and is open to signed-in accounts only.

-- Who is in this church. Emails show to owners and admins only.
create or replace function public.church_people(target uuid)
returns table (member_id uuid, member_email text, member_role text, joined_at timestamptz, is_me boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    can_see_email boolean;
begin
    if not public.has_church_role(target, array['owner', 'admin', 'editor', 'viewer']) then
        raise exception 'Not a member of this church' using errcode = '42501';
    end if;
    can_see_email := public.has_church_role(target, array['owner', 'admin']);
    return query
        select m.user_id,
               case when can_see_email then u.email::text else null end,
               m.role,
               m.created_at,
               m.user_id = (select auth.uid())
        from public.church_members m
        join auth.users u on u.id = m.user_id
        where m.church_id = target
        order by (m.role = 'owner') desc, m.created_at;
end;
$$;
revoke execute on function public.church_people(uuid) from public, anon;
grant execute on function public.church_people(uuid) to authenticated;

-- Owners and admins change someone's role to admin, editor or viewer.
-- The owner's role moves only through transfer_ownership, so a church always has one.
-- Only an owner can make or change an admin.
create or replace function public.set_member_role(target uuid, member uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    caller_role text;
    their_role text;
begin
    if new_role not in ('admin', 'editor', 'viewer') then
        raise exception 'Choose admin, editor or viewer' using errcode = '22023';
    end if;
    select m.role into caller_role from public.church_members m where m.church_id = target and m.user_id = (select auth.uid());
    if caller_role is null or caller_role not in ('owner', 'admin') then
        raise exception 'Only an owner or admin can change roles' using errcode = '42501';
    end if;
    select m.role into their_role from public.church_members m where m.church_id = target and m.user_id = member for update;
    if their_role is null then
        raise exception 'That person is not in this church' using errcode = 'P0002';
    end if;
    if their_role = 'owner' then
        raise exception 'The owner stays the owner. Transfer ownership first.' using errcode = '42501';
    end if;
    if caller_role = 'admin' and (their_role = 'admin' or new_role = 'admin') then
        raise exception 'Only the owner can make or change an admin' using errcode = '42501';
    end if;
    update public.church_members m set role = new_role where m.church_id = target and m.user_id = member;
end;
$$;
revoke execute on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

-- Owners and admins remove a person; anyone may remove themselves except the owner.
create or replace function public.remove_member(target uuid, member uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    caller_role text;
    their_role text;
begin
    select m.role into caller_role from public.church_members m where m.church_id = target and m.user_id = (select auth.uid());
    if caller_role is null then
        raise exception 'Not a member of this church' using errcode = '42501';
    end if;
    select m.role into their_role from public.church_members m where m.church_id = target and m.user_id = member for update;
    if their_role is null then
        raise exception 'That person is not in this church' using errcode = 'P0002';
    end if;
    if their_role = 'owner' then
        raise exception 'The owner cannot leave or be removed. Transfer ownership first.' using errcode = '42501';
    end if;
    if member <> (select auth.uid()) then
        if caller_role not in ('owner', 'admin') then
            raise exception 'Only an owner or admin can remove people' using errcode = '42501';
        end if;
        if caller_role = 'admin' and their_role = 'admin' then
            raise exception 'Only the owner can remove an admin' using errcode = '42501';
        end if;
    end if;
    delete from public.church_members m where m.church_id = target and m.user_id = member;
end;
$$;
revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- The owner hands the church to another member and becomes an admin.
create or replace function public.transfer_ownership(target uuid, new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public.has_church_role(target, array['owner']) then
        raise exception 'Only the owner can transfer ownership' using errcode = '42501';
    end if;
    if new_owner = (select auth.uid()) then
        raise exception 'Choose someone else' using errcode = '22023';
    end if;
    perform 1 from public.church_members m where m.church_id = target and m.user_id = new_owner for update;
    if not found then
        raise exception 'That person is not in this church' using errcode = 'P0002';
    end if;
    update public.church_members m set role = 'owner' where m.church_id = target and m.user_id = new_owner;
    update public.church_members m set role = 'admin' where m.church_id = target and m.user_id = (select auth.uid());
end;
$$;
revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- An invite may name a role. Only the owner can invite an admin.
drop policy "admins create invites" on public.church_invites;
create policy "admins create invites" on public.church_invites for insert to authenticated
    with check (
        public.has_church_role(church_id, array['owner', 'admin'])
        and created_by = (select auth.uid())
        and (role <> 'admin' or public.has_church_role(church_id, array['owner']))
    );
