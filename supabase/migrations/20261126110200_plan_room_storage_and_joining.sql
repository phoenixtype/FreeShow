-- Plan limits that hold where the write happens.
--
-- E4: nothing is deleted when a church drops to a smaller plan. Everyone keeps
--     reading and downloading, but a church over its limits cannot add songs,
--     media or members until it is back under them or upgrades.
--     church_within_plan(church) is the one question the policies ask.
-- A3: media storage is counted from the files themselves (storage.objects), not
--     from a size the caller sends, and uploads stop when there is no room.
--     Editors may delete their church's files, which frees the room.
-- A14: the member cap is checked with the church row locked, so two joins at
--     once cannot both take the last place; and joining a church you are
--     already in no longer burns the invite.
--
-- Deploy order: this file first (the app and CLI call functions that keep their
-- names and arguments). No function deploy depends on it.

-- The _internal pair is the plain calculation, for the server and for other
-- database functions (a person joining is not a member yet, so a members-only
-- answer would be no answer at all).

-- Bytes the church's folder holds in the church-media bucket.
create or replace function public.church_storage_used(target uuid)
returns bigint
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
    select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
    where o.bucket_id = 'church-media' and o.name like (target::text || '/%')
$$;
revoke execute on function public.church_storage_used(uuid) from public, anon, authenticated;
grant execute on function public.church_storage_used(uuid) to service_role;

-- True when people, songs and media are all within the plan's limits.
create or replace function public.church_within_plan_internal(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select (select count(*) from public.church_members m where m.church_id = target) <= l.max_members
       and (l.max_songs is null or (select count(*) from public.songs s where s.church_id = target and s.deleted_at is null) <= l.max_songs)
       and public.church_storage_used(target) <= l.media_bytes
    from public.church_limits_internal(target) l
$$;
revoke execute on function public.church_within_plan_internal(uuid) from public, anon, authenticated;
grant execute on function public.church_within_plan_internal(uuid) to service_role;

-- What the policies and the app ask. Answers members, platform admins and the
-- server only; anyone else gets null, which a policy treats as no.
create or replace function public.church_within_plan(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select public.church_within_plan_internal(target)
    where (select auth.uid()) is null
       or public.has_church_role(target, array['owner', 'admin', 'editor', 'viewer'])
       or public.is_platform_admin()
$$;
revoke execute on function public.church_within_plan(uuid) from public, anon;
grant execute on function public.church_within_plan(uuid) to authenticated, service_role;

-- Bytes of media the church's plan still has room for (never below zero).
create or replace function public.church_storage_room(target uuid)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select greatest(l.media_bytes - public.church_storage_used(target), 0)::bigint
    from public.church_limits_internal(target) l
    where (select auth.uid()) is null
       or public.has_church_role(target, array['owner', 'admin', 'editor', 'viewer'])
       or public.is_platform_admin()
$$;
revoke execute on function public.church_storage_room(uuid) from public, anon;
grant execute on function public.church_storage_room(uuid) to authenticated, service_role;

-- New media only while within the plan (songs are held by enforce_song_limit
-- below). Reading and changing what is already there is untouched.
drop policy "editors add media" on public.media;
create policy "editors add media" on public.media for insert to authenticated
    with check (public.has_church_role(church_id, array['owner', 'admin', 'editor']) and public.church_within_plan(church_id));
-- Media is recorded through bulk_register_media, which checks the real file size.
revoke insert on public.media from authenticated;

-- Files: upload only while the church is within its plan and has room; editors
-- may delete (a path segment is cast only after it matches a uuid shape).
drop policy "editors upload church media" on storage.objects;
create policy "editors upload church media" on storage.objects for insert to authenticated
    with check (case when bucket_id = 'church-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.has_church_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin', 'editor'])
            and public.church_within_plan(((storage.foldername(name))[1])::uuid)
            and public.church_storage_room(((storage.foldername(name))[1])::uuid) > 0
        else false end);
-- replacing a file can make it bigger, so it needs room too
drop policy "editors replace church media" on storage.objects;
create policy "editors replace church media" on storage.objects for update to authenticated
    using (case when bucket_id = 'church-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.has_church_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin', 'editor']) else false end)
    with check (case when bucket_id = 'church-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.has_church_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin', 'editor'])
            and public.church_within_plan(((storage.foldername(name))[1])::uuid)
            and public.church_storage_room(((storage.foldername(name))[1])::uuid) > 0
        else false end);
create policy "editors delete church media" on storage.objects for delete to authenticated
    using (case when bucket_id = 'church-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.has_church_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin', 'editor']) else false end);

-- The file is uploaded first; its size here comes from storage, not from the caller.
create or replace function public.bulk_register_media(target uuid, media_id uuid, media_kind text, media_title text, media_path text, media_mime text, file_bytes bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    room bigint;
    stored bigint;
begin
    if (select auth.uid()) is null or not public.can_bulk_import(target) then
        raise exception 'Bulk setup is part of the Church and Multi-campus plans.' using errcode = '42501';
    end if;
    if media_path !~ ('^' || target::text || '/' || media_id::text || '/[^/]+$') then
        raise exception 'That file is not stored in this church''s folder.' using errcode = '22023';
    end if;
    select (o.metadata ->> 'size')::bigint into stored
    from storage.objects o where o.bucket_id = 'church-media' and o.name = media_path;
    if stored is null then
        raise exception 'Upload the file first, then record it.' using errcode = '22023';
    end if;
    select l.media_bytes into room from public.church_limits_internal(target) l;
    if public.church_storage_used(target) > room then
        raise exception 'This plan holds % GB of media. Upgrade to add more.', room / 1073741824 using errcode = 'P0001';
    end if;
    if public.church_within_plan_internal(target) is false then
        raise exception 'Your church is over its plan, so new files cannot be added. Remove people or songs, or upgrade.' using errcode = 'P0001';
    end if;
    insert into public.media (id, church_id, kind, title, storage_path, mime_type, bytes, created_by)
    values (media_id, target, media_kind, media_title, media_path, media_mime, stored, (select auth.uid()))
    on conflict (id) do nothing;
end;
$$;
revoke execute on function public.bulk_register_media(uuid, uuid, text, text, text, text, bigint) from public, anon;
grant execute on function public.bulk_register_media(uuid, uuid, text, text, text, text, bigint) to authenticated;

-- The two limit triggers read the plain calculation (church_limits now answers
-- members only, and a person joining is not a member yet).
create or replace function public.enforce_song_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    cap integer;
begin
    -- The app sends an edited song as "insert, or update if it is there": that is
    -- a change, not a new song, and it is always allowed.
    if exists (
        select 1 from public.songs s
        where s.church_id = new.church_id and s.source = new.source and s.source_id = new.source_id and s.deleted_at is null
    ) then
        return new;
    end if;
    select l.max_songs into cap from public.church_limits_internal(new.church_id) l;
    if cap is not null and (select count(*) from public.songs s where s.church_id = new.church_id and s.deleted_at is null) >= cap then
        raise exception 'The free plan holds % songs. Upgrade to add more.', cap using errcode = 'P0001';
    end if;
    if public.church_within_plan_internal(new.church_id) is false then
        raise exception 'Your church is over its plan, so new songs cannot be added. Remove people or files, or upgrade.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;

create or replace function public.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    cap integer;
begin
    -- one join at a time per church, so two cannot both take the last place
    perform 1 from public.churches c where c.id = new.church_id for update;
    select l.max_members into cap from public.church_limits_internal(new.church_id) l;
    if (select count(*) from public.church_members m where m.church_id = new.church_id) >= cap then
        raise exception 'This plan has room for % people. Upgrade to add more.', cap using errcode = 'P0001';
    end if;
    -- over on songs or files: no new people either
    if public.church_within_plan_internal(new.church_id) is false then
        raise exception 'Your church is over its plan, so new people cannot be added. Remove songs or files, or upgrade.' using errcode = 'P0001';
    end if;
    return new;
end;
$$;

-- Joining a church you are already in returns it and leaves the invite unused.
create or replace function public.join_church(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    invite public.church_invites%rowtype;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in first' using errcode = '42501';
    end if;
    select * into invite from public.church_invites i
    where i.code = upper(regexp_replace(invite_code, '[^A-Za-z0-9]', '', 'g'))
      and i.used_at is null and i.expires_at > now()
    for update;
    if not found then
        raise exception 'That invite code is not valid any more' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.church_members m where m.church_id = invite.church_id and m.user_id = (select auth.uid())) then
        return invite.church_id;
    end if;
    insert into public.church_members (church_id, user_id, role)
    values (invite.church_id, (select auth.uid()), invite.role)
    on conflict (church_id, user_id) do nothing;
    update public.church_invites set used_by = (select auth.uid()), used_at = now() where id = invite.id;
    return invite.church_id;
end;
$$;
revoke execute on function public.join_church(text) from public, anon;
grant execute on function public.join_church(text) to authenticated;
