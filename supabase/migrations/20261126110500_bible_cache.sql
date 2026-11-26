-- A licensed Bible was read from Scriptural, all of it, on every download. Each
-- version is now kept once in a private bucket (the server hands out short-lived
-- links; there are deliberately no storage policies for it), and a church may
-- download a version five times a day.
-- Deploy this file before the bible-download function.

insert into storage.buckets (id, name, public)
values ('bible-cache', 'bible-cache', false)
on conflict (id) do nothing;

create table public.bible_downloads (
    church_id uuid not null references public.churches (id) on delete cascade,
    version text not null,
    day date not null,
    downloads integer not null default 0,
    primary key (church_id, version, day)
);
alter table public.bible_downloads enable row level security;
revoke all on public.bible_downloads from public, anon, authenticated;
grant all on public.bible_downloads to service_role;

-- Counts one download; false when today's five are used.
create or replace function public.count_bible_download(target uuid, version_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    so_far integer;
begin
    insert into public.bible_downloads as d (church_id, version, day, downloads)
    values (target, version_code, current_date, 1)
    on conflict (church_id, version, day) do update set downloads = d.downloads + 1
    returning d.downloads into so_far;
    return so_far <= 5;
end;
$$;
revoke execute on function public.count_bible_download(uuid, text) from public, anon, authenticated;
grant execute on function public.count_bible_download(uuid, text) to service_role;
