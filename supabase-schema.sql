create table if not exists public.science_lab_reservations (
  id text primary key,
  room text not null,
  date text not null,
  time text not null,
  class_name text,
  purpose text,
  created_at text not null,
  created_at_sort timestamptz not null default now()
);

create table if not exists public.science_lab_notices (
  id text primary key,
  content text not null,
  created_at text not null,
  created_at_sort timestamptz not null default now()
);

alter table public.science_lab_reservations enable row level security;
alter table public.science_lab_notices enable row level security;

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
  using (auth.role() = 'authenticated');

drop policy if exists "Anyone can read science lab notices" on public.science_lab_notices;
create policy "Anyone can read science lab notices"
  on public.science_lab_notices
  for select
  using (true);

drop policy if exists "Authenticated users can create science lab notices" on public.science_lab_notices;
create policy "Authenticated users can create science lab notices"
  on public.science_lab_notices
  for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can delete science lab notices" on public.science_lab_notices;
create policy "Authenticated users can delete science lab notices"
  on public.science_lab_notices
  for delete
  using (auth.role() = 'authenticated');
