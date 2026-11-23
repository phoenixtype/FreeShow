-- Church library: each church keeps its songs, media and service plans here,
-- and every computer running Scriptural Project syncs a full copy.
--
-- Access is by membership. Roles: owner and admin manage the church and its
-- members; editor changes the library; viewer reads it (a projection
-- computer only needs viewer). Every table has RLS; nothing is public.

create extension if not exists pg_trgm with schema extensions;

-- CHURCHES AND MEMBERS --

create table public.churches (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) between 2 and 120),
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.church_members (
    church_id uuid not null references public.churches (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
    created_at timestamptz not null default now(),
    primary key (church_id, user_id)
);
create index church_members_user_idx on public.church_members (user_id);

create table public.church_invites (
    id uuid primary key default gen_random_uuid(),
    church_id uuid not null references public.churches (id) on delete cascade,
    code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    role text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default now() + interval '14 days',
    used_by uuid references auth.users (id) on delete set null,
    used_at timestamptz
);
create index church_invites_church_idx on public.church_invites (church_id);

-- Does the caller hold one of these roles in this church? Asked once per
-- statement by the policies below.
create or replace function public.has_church_role(target uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from public.church_members m
        where m.church_id = target and m.user_id = (select auth.uid()) and m.role = any (roles)
    )
$$;
revoke execute on function public.has_church_role(uuid, text[]) from public, anon;
grant execute on function public.has_church_role(uuid, text[]) to authenticated;

-- Creating a church makes its creator the owner, in one step.
create or replace function public.create_church(church_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    new_id uuid;
begin
    if (select auth.uid()) is null then
        raise exception 'Sign in first' using errcode = '42501';
    end if;
    insert into public.churches (name, created_by) values (trim(church_name), (select auth.uid())) returning id into new_id;
    insert into public.church_members (church_id, user_id, role) values (new_id, (select auth.uid()), 'owner');
    return new_id;
end;
$$;
revoke execute on function public.create_church(text) from public, anon;
grant execute on function public.create_church(text) to authenticated;

-- Joining with an invite code someone in the church shared.
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
    insert into public.church_members (church_id, user_id, role)
    values (invite.church_id, (select auth.uid()), invite.role)
    on conflict (church_id, user_id) do nothing;
    update public.church_invites set used_by = (select auth.uid()), used_at = now() where id = invite.id;
    return invite.church_id;
end;
$$;
revoke execute on function public.join_church(text) from public, anon;
grant execute on function public.join_church(text) to authenticated;

-- LIBRARY --

-- A song's words, as sections in order. Each section:
--   { "label": "Verse 1", "type": "verse" | "chorus" | "pre-chorus" | "bridge" | "tag" | "intro" | "outro" | "other",
--     "lines": ["...", "..."] }
-- "arrangement" lists section labels in the order they are sung (repeats allowed).
create table public.songs (
    id uuid primary key default gen_random_uuid(),
    church_id uuid not null references public.churches (id) on delete cascade,
    title text not null check (length(trim(title)) > 0),
    authors text,
    copyright text,
    ccli text,
    song_key text,
    tempo integer check (tempo is null or tempo between 20 and 300),
    sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
    arrangement text[] not null default '{}',
    notes text,
    tags text[] not null default '{}',
    source text,
    source_id text,
    search tsvector generated always as (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(authors, '')), 'B') ||
        setweight(jsonb_to_tsvector('simple', sections, '["string"]'), 'C')
    ) stored,
    created_by uuid references auth.users (id) on delete set null,
    updated_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    unique (church_id, source, source_id)
);
create index songs_church_updated_idx on public.songs (church_id, updated_at);
create index songs_search_idx on public.songs using gin (search);
create index songs_title_trgm_idx on public.songs using gin (title extensions.gin_trgm_ops);

-- Images, videos, PDFs and decks; the file is in the church-media bucket at
-- <church_id>/<id>/<file name>.
create table public.media (
    id uuid primary key default gen_random_uuid(),
    church_id uuid not null references public.churches (id) on delete cascade,
    kind text not null check (kind in ('image', 'video', 'audio', 'pdf', 'deck', 'other')),
    title text not null,
    storage_path text not null,
    mime_type text,
    bytes bigint,
    tags text[] not null default '{}',
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);
create index media_church_updated_idx on public.media (church_id, updated_at);

-- A meeting's running order. items: [{ "type": "song" | "scripture" | "media" | "note", "id"?: uuid, "reference"?: text, "text"?: text }]
create table public.service_plans (
    id uuid primary key default gen_random_uuid(),
    church_id uuid not null references public.churches (id) on delete cascade,
    title text not null,
    plan_date date,
    items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);
create index service_plans_church_updated_idx on public.service_plans (church_id, updated_at);

-- Sync reads "everything changed since my last sync", so updated_at moves on
-- every change (a soft delete included) and is never set by the client.
create or replace function public.touch_row()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
    new.updated_at := now();
    if tg_table_name in ('songs') then
        new.updated_by := (select auth.uid());
    end if;
    return new;
end;
$$;
create trigger churches_touch before update on public.churches for each row execute function public.touch_row();
create trigger songs_touch before insert or update on public.songs for each row execute function public.touch_row();
create trigger media_touch before update on public.media for each row execute function public.touch_row();
create trigger service_plans_touch before update on public.service_plans for each row execute function public.touch_row();

-- ROW LEVEL SECURITY --

alter table public.churches enable row level security;
alter table public.church_members enable row level security;
alter table public.church_invites enable row level security;
alter table public.songs enable row level security;
alter table public.media enable row level security;
alter table public.service_plans enable row level security;

create policy "members read their church" on public.churches for select to authenticated
    using (public.has_church_role(id, array['owner', 'admin', 'editor', 'viewer']));
create policy "admins rename their church" on public.churches for update to authenticated
    using (public.has_church_role(id, array['owner', 'admin']))
    with check (public.has_church_role(id, array['owner', 'admin']));

create policy "members see who else is in" on public.church_members for select to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin', 'editor', 'viewer']));
create policy "admins change roles" on public.church_members for update to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin']))
    with check (public.has_church_role(church_id, array['owner', 'admin']) and role <> 'owner');
create policy "admins remove members, anyone leaves" on public.church_members for delete to authenticated
    using ((public.has_church_role(church_id, array['owner', 'admin']) and role <> 'owner') or (user_id = (select auth.uid()) and role <> 'owner'));

create policy "admins see invites" on public.church_invites for select to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin']));
create policy "admins create invites" on public.church_invites for insert to authenticated
    with check (public.has_church_role(church_id, array['owner', 'admin']) and created_by = (select auth.uid()));
create policy "admins revoke invites" on public.church_invites for delete to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin']));

-- songs, media and plans: members read, editors and up write
create policy "members read songs" on public.songs for select to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin', 'editor', 'viewer']));
create policy "editors add songs" on public.songs for insert to authenticated
    with check (public.has_church_role(church_id, array['owner', 'admin', 'editor']));
create policy "editors change songs" on public.songs for update to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin', 'editor']))
    with check (public.has_church_role(church_id, array['owner', 'admin', 'editor']));

create policy "members read media" on public.media for select to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin', 'editor', 'viewer']));
create policy "editors add media" on public.media for insert to authenticated
    with check (public.has_church_role(church_id, array['owner', 'admin', 'editor']));
create policy "editors change media" on public.media for update to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin', 'editor']))
    with check (public.has_church_role(church_id, array['owner', 'admin', 'editor']));

create policy "members read plans" on public.service_plans for select to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin', 'editor', 'viewer']));
create policy "editors add plans" on public.service_plans for insert to authenticated
    with check (public.has_church_role(church_id, array['owner', 'admin', 'editor']));
create policy "editors change plans" on public.service_plans for update to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin', 'editor']))
    with check (public.has_church_role(church_id, array['owner', 'admin', 'editor']));

-- Deletes are soft (deleted_at) so every computer learns of them on its next
-- sync; there is deliberately no DELETE policy on the library tables.

revoke all on public.churches, public.church_members, public.church_invites, public.songs, public.media, public.service_plans from anon;
grant select, update on public.churches to authenticated;
grant select, update, delete on public.church_members to authenticated;
grant select, insert, delete on public.church_invites to authenticated;
grant select, insert, update on public.songs, public.media, public.service_plans to authenticated;
grant all on public.churches, public.church_members, public.church_invites, public.songs, public.media, public.service_plans to service_role;

-- Free-text search over a church's songs: title, authors and every lyric line.
create or replace function public.search_songs(target uuid, query text, max_results integer default 30)
returns table (id uuid, title text, authors text, rank real)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
    if not public.has_church_role(target, array['owner', 'admin', 'editor', 'viewer']) then
        raise exception 'Not a member of this church' using errcode = '42501';
    end if;
    return query
        select s.id, s.title, s.authors,
               (ts_rank(s.search, websearch_to_tsquery('simple', query)) + similarity(s.title, query))::real as rank
        from public.songs s
        where s.church_id = target and s.deleted_at is null
          and (s.search @@ websearch_to_tsquery('simple', query) or s.title % query)
        order by rank desc
        limit least(greatest(max_results, 1), 100);
end;
$$;
revoke execute on function public.search_songs(uuid, text, integer) from public, anon;
grant execute on function public.search_songs(uuid, text, integer) to authenticated;

-- STORAGE --

insert into storage.buckets (id, name, public, file_size_limit)
values ('church-media', 'church-media', false, 524288000)
on conflict (id) do nothing;

-- the first path segment is the church id; checked only when it looks like one
create policy "members read church media" on storage.objects for select to authenticated
    using (case when bucket_id = 'church-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.has_church_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin', 'editor', 'viewer']) else false end);
create policy "editors upload church media" on storage.objects for insert to authenticated
    with check (case when bucket_id = 'church-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.has_church_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin', 'editor']) else false end);
create policy "editors replace church media" on storage.objects for update to authenticated
    using (case when bucket_id = 'church-media' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.has_church_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin', 'editor']) else false end);
