-- A church at its song limit can still save edits to songs it already has, and
-- cannot go over the limit by saving two songs at once or by un-deleting.
--
-- Before: the limit ran on every insert, and the app saves with an insert that
-- turns into an update (on_conflict), so a free church at 500 songs could not
-- save a correction. Two songs saved together both read the same count.
create or replace function public.enforce_song_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    cap integer;
begin
    if tg_op = 'INSERT' then
        -- a song the library already has under this source id: the insert becomes an update
        if new.source is not null and new.source_id is not null and exists (
            select 1 from public.songs s
            where s.church_id = new.church_id and s.source = new.source and s.source_id = new.source_id
        ) then
            return new;
        end if;
    elsif not (old.deleted_at is not null and new.deleted_at is null) then
        -- an edit, or a delete: nothing is added
        return new;
    end if;

    -- one count at a time per church
    perform 1 from public.churches c where c.id = new.church_id for update;
    select l.max_songs into cap from public.church_limits(new.church_id) l;
    if new.deleted_at is null and cap is not null
       and (select count(*) from public.songs s where s.church_id = new.church_id and s.deleted_at is null) >= cap then
        raise exception 'The free plan holds % songs. Upgrade to add more.', cap using errcode = 'P0001';
    end if;
    return new;
end;
$$;
revoke execute on function public.enforce_song_limit() from public, anon, authenticated;

drop trigger if exists songs_limit on public.songs;
create trigger songs_limit before insert on public.songs for each row execute function public.enforce_song_limit();
create trigger songs_limit_undelete before update of deleted_at on public.songs
    for each row when (old.deleted_at is not null and new.deleted_at is null)
    execute function public.enforce_song_limit();
