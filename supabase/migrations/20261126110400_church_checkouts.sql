-- The Stripe Checkout a church has open, so billing-checkout can close it before
-- opening another (two open pages could both be paid). Server only.
-- Deploy this file before the billing-checkout function.

create table public.church_checkouts (
    church_id uuid primary key references public.churches (id) on delete cascade,
    session_id text not null,
    created_at timestamptz not null default now()
);

-- no policies: only the server reads or writes it
alter table public.church_checkouts enable row level security;
revoke all on public.church_checkouts from public, anon, authenticated;
grant all on public.church_checkouts to service_role;
