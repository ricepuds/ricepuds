create table if not exists public.science_lab_reservations (
  id text primary key,
  room text not null,
  date text not null,
  time text not null,
  class_name text,
  applicant_student_id text,
  applicant_name text,
  purpose text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at text not null,
  created_at_sort timestamptz not null default now()
);

alter table public.science_lab_reservations
  add column if not exists status text not null default 'pending';

alter table public.science_lab_reservations
  add column if not exists applicant_student_id text,
  add column if not exists applicant_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'science_lab_reservations_status_check'
  ) then
    alter table public.science_lab_reservations
      add constraint science_lab_reservations_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create table if not exists public.science_lab_notices (
  id text primary key,
  content text not null,
  created_at text not null,
  created_at_sort timestamptz not null default now()
);

create table if not exists public.science_lab_inventory_edits (
  item_id text not null,
  field_name text not null check (field_name in ('category', 'name', 'detail', 'quantity', 'location')),
  field_value text not null,
  updated_at timestamptz not null default now(),
  primary key (item_id, field_name)
);

alter table public.science_lab_reservations enable row level security;
alter table public.science_lab_notices enable row level security;
alter table public.science_lab_inventory_edits enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on public.science_lab_reservations to anon, authenticated;
grant update (status), delete on public.science_lab_reservations to authenticated;
grant select on public.science_lab_notices to anon, authenticated;
grant insert, delete on public.science_lab_notices to authenticated;
grant select on public.science_lab_inventory_edits to anon, authenticated;
grant insert, update, delete on public.science_lab_inventory_edits to authenticated;

drop policy if exists "Anyone can read science lab reservations" on public.science_lab_reservations;
create policy "Anyone can read science lab reservations"
  on public.science_lab_reservations
  for select
  using (true);

drop policy if exists "Anyone can create science lab reservations" on public.science_lab_reservations;
create policy "Anyone can create science lab reservations"
  on public.science_lab_reservations
  for insert
  with check (true);

drop policy if exists "Authenticated users can clear science lab reservations" on public.science_lab_reservations;
create policy "Authenticated users can clear science lab reservations"
  on public.science_lab_reservations
  for delete
  using (lower(auth.jwt() ->> 'email') = 'rices2114@gmail.com');

drop policy if exists "Admins can update science lab reservation status" on public.science_lab_reservations;
create policy "Admins can update science lab reservation status"
  on public.science_lab_reservations
  for update
  using (lower(auth.jwt() ->> 'email') = 'rices2114@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'rices2114@gmail.com');

drop policy if exists "Anyone can read science lab notices" on public.science_lab_notices;
create policy "Anyone can read science lab notices"
  on public.science_lab_notices
  for select
  using (true);

drop policy if exists "Authenticated users can create science lab notices" on public.science_lab_notices;
create policy "Authenticated users can create science lab notices"
  on public.science_lab_notices
  for insert
  with check (lower(auth.jwt() ->> 'email') = 'rices2114@gmail.com');

drop policy if exists "Authenticated users can delete science lab notices" on public.science_lab_notices;
create policy "Authenticated users can delete science lab notices"
  on public.science_lab_notices
  for delete
  using (lower(auth.jwt() ->> 'email') = 'rices2114@gmail.com');

drop policy if exists "Anyone can read science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Anyone can read science lab inventory edits"
  on public.science_lab_inventory_edits
  for select
  using (true);

drop policy if exists "Admins can create science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Admins can create science lab inventory edits"
  on public.science_lab_inventory_edits
  for insert
  with check (lower(auth.jwt() ->> 'email') = 'rices2114@gmail.com');

drop policy if exists "Admins can update science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Admins can update science lab inventory edits"
  on public.science_lab_inventory_edits
  for update
  using (lower(auth.jwt() ->> 'email') = 'rices2114@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'rices2114@gmail.com');

drop policy if exists "Admins can delete science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Admins can delete science lab inventory edits"
  on public.science_lab_inventory_edits
  for delete
  using (lower(auth.jwt() ->> 'email') = 'rices2114@gmail.com');
