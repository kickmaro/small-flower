create extension if not exists pgcrypto;

create type public.employee_role as enum ('employee', 'hr');
create type public.record_type as enum ('work', 'annual', 'sick', 'personal', 'official', 'unpaid');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id text not null unique,
  full_name text not null,
  role public.employee_role not null default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.worksite_settings (
  id integer primary key default 1 check (id = 1),
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null check (radius_meters >= 20),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  record_date date not null,
  record_type public.record_type not null default 'work',
  start_time time,
  end_time time,
  break_minutes integer not null default 0,
  leave_days numeric(3, 1) not null default 0,
  leave_period text not null default '',
  note text not null default '',
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_in_accuracy integer,
  clock_in_distance integer,
  clock_in_captured_at timestamptz,
  clock_out_lat double precision,
  clock_out_lng double precision,
  clock_out_accuracy integer,
  clock_out_distance integer,
  clock_out_captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint one_work_record_per_day unique (user_id, record_date, record_type)
);

create index attendance_records_month_idx on public.attendance_records (record_date);
create index attendance_records_user_month_idx on public.attendance_records (user_id, record_date);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger attendance_records_touch_updated_at
before update on public.attendance_records
for each row execute function public.touch_updated_at();

create or replace function public.is_hr()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'hr'
      and is_active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.worksite_settings enable row level security;
alter table public.attendance_records enable row level security;

create policy "profiles own or hr read"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_hr());

create policy "profiles hr update"
on public.profiles
for update
to authenticated
using (public.is_hr())
with check (public.is_hr());

create policy "worksite authenticated read"
on public.worksite_settings
for select
to authenticated
using (true);

create policy "worksite hr write"
on public.worksite_settings
for all
to authenticated
using (public.is_hr())
with check (public.is_hr());

create policy "attendance own or hr read"
on public.attendance_records
for select
to authenticated
using (user_id = auth.uid() or public.is_hr());

create policy "attendance employee insert own"
on public.attendance_records
for insert
to authenticated
with check (user_id = auth.uid() or public.is_hr());

create policy "attendance employee update own"
on public.attendance_records
for update
to authenticated
using (user_id = auth.uid() or public.is_hr())
with check (user_id = auth.uid() or public.is_hr());

create policy "attendance employee delete own"
on public.attendance_records
for delete
to authenticated
using (user_id = auth.uid() or public.is_hr());
