-- Bulk setup from the command line (scripts/church-library/church.mts) is part of
-- the paid plans. A church on Church or Multi-campus, or a platform admin, may
-- load songs and media in bulk. The check is made here, in the database, where
-- the write happens, so the command line cannot skip it.
--
-- Adding a song or file one at a time in the app is unchanged: the free plan's
-- own limits (songs, people, media) still apply to everyone.

-- May this account bulk-load into this church? With no church (setting one up
-- from scratch) only a platform admin may: a new church starts on the free plan.
create or replace function public.can_bulk_import(target uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select public.is_platform_admin()
        or (
            target is not null
            and public.has_church_role(target, array['owner', 'admin', 'editor'])
            and (select l.plan <> 'free' from public.church_limits(target) l)
        )
$$;
revoke execute on function public.can_bulk_import(uuid) from public, anon;
grant execute on function public.can_bulk_import(uuid) to authenticated;

-- Songs, in one call. song_rows: [{ title, authors, copyright, ccli, sections, arrangement, source, source_id }].
-- Songs are matched on (source, source_id), so running it again updates in place.
create or replace function public.bulk_import_songs(target uuid, song_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    written integer;
begin
    if (select auth.uid()) is null or not public.can_bulk_import(target) then
        raise exception 'Bulk setup is part of the Church and Multi-campus plans.' using errcode = '42501';
    end if;
    if jsonb_typeof(song_rows) <> 'array' or jsonb_array_length(song_rows) not between 1 and 500 then
        raise exception 'Send between 1 and 500 songs at a time.' using errcode = '22023';
    end if;

    insert into public.songs as s (church_id, title, authors, copyright, ccli, sections, arrangement, source, source_id, created_by)
    select target, r.title, r.authors, r.copyright, r.ccli, coalesce(r.sections, '[]'::jsonb), coalesce(r.arrangement, '{}'), r.source, r.source_id, (select auth.uid())
    from jsonb_to_recordset(song_rows) as r (title text, authors text, copyright text, ccli text, sections jsonb, arrangement text[], source text, source_id text)
    where r.source in ('easyworship', 'file') and r.source_id is not null and length(trim(coalesce(r.title, ''))) > 0
    on conflict (church_id, source, source_id) do update set
        title = excluded.title, authors = excluded.authors, copyright = excluded.copyright, ccli = excluded.ccli,
        sections = excluded.sections, arrangement = excluded.arrangement, deleted_at = null;
    get diagnostics written = row_count;
    return written;
end;
$$;
revoke execute on function public.bulk_import_songs(uuid, jsonb) from public, anon;
grant execute on function public.bulk_import_songs(uuid, jsonb) to authenticated;

-- One uploaded file, recorded in the media list. The file itself goes to the
-- church-media bucket first, at <church id>/<id>/<file name>; this refuses it
-- when the church is over its plan's storage or the path is not the church's own.
create or replace function public.bulk_register_media(target uuid, media_id uuid, media_kind text, media_title text, media_path text, media_mime text, file_bytes bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    room bigint;
    used bigint;
begin
    if (select auth.uid()) is null or not public.can_bulk_import(target) then
        raise exception 'Bulk setup is part of the Church and Multi-campus plans.' using errcode = '42501';
    end if;
    if media_path !~ ('^' || target::text || '/' || media_id::text || '/[^/]+$') then
        raise exception 'That file is not stored in this church''s folder.' using errcode = '22023';
    end if;
    select l.media_bytes into room from public.church_limits(target) l;
    select coalesce(sum(m.bytes), 0) into used from public.media m where m.church_id = target and m.deleted_at is null;
    if used + coalesce(file_bytes, 0) > room then
        raise exception 'This plan holds % GB of media. Upgrade to add more.', room / 1073741824 using errcode = 'P0001';
    end if;
    insert into public.media (id, church_id, kind, title, storage_path, mime_type, bytes, created_by)
    values (media_id, target, media_kind, media_title, media_path, media_mime, file_bytes, (select auth.uid()))
    on conflict (id) do nothing;
end;
$$;
revoke execute on function public.bulk_register_media(uuid, uuid, text, text, text, text, bigint) from public, anon;
grant execute on function public.bulk_register_media(uuid, uuid, text, text, text, text, bigint) to authenticated;
