-- M1 · Identity, allowlist, app settings.

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  display_name text,
  role         text not null default 'owner',
  created_at   timestamptz not null default now()
);

create table app_allowlist (
  email      text primary key,
  is_active  boolean not null default true,
  note       text,
  added_at   timestamptz not null default now()
);

create table app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Auto-provision a profile row when a Supabase auth user is created.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
