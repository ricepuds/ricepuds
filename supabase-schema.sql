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
  status_reason text,
  created_at text not null,
  created_at_sort timestamptz not null default now()
);

alter table public.science_lab_reservations
  add column if not exists status text not null default 'pending';

alter table public.science_lab_reservations
  add column if not exists applicant_student_id text,
  add column if not exists applicant_name text,
  add column if not exists status_reason text;

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

create table if not exists public.science_lab_reservation_blocks (
  id text primary key,
  room text not null,
  date text not null,
  start_time text not null,
  end_time text not null,
  reason text not null,
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

create table if not exists public.science_lab_questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default left(coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(split_part(auth.jwt() ->> 'email', '@', 1), ''),
    '사용자'
  ), 40),
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.science_lab_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.science_lab_questions(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default left(coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(split_part(auth.jwt() ->> 'email', '@', 1), ''),
    '사용자'
  ), 40),
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists science_lab_questions_created_at_idx
  on public.science_lab_questions (created_at desc);
create index if not exists science_lab_answers_question_created_at_idx
  on public.science_lab_answers (question_id, created_at asc);

alter table public.science_lab_reservations enable row level security;
alter table public.science_lab_notices enable row level security;
alter table public.science_lab_reservation_blocks enable row level security;
alter table public.science_lab_inventory_edits enable row level security;
alter table public.science_lab_questions enable row level security;
alter table public.science_lab_answers enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on public.science_lab_reservations to anon, authenticated;
grant update (status, status_reason), delete on public.science_lab_reservations to authenticated;
grant select on public.science_lab_notices to anon, authenticated;
grant insert, delete on public.science_lab_notices to authenticated;
grant select on public.science_lab_reservation_blocks to anon, authenticated;
grant insert, delete on public.science_lab_reservation_blocks to authenticated;
grant select on public.science_lab_inventory_edits to anon, authenticated;
revoke update on public.science_lab_inventory_edits from anon, authenticated;
grant insert on public.science_lab_inventory_edits to anon;
grant insert, delete on public.science_lab_inventory_edits to authenticated;
grant update (field_value, updated_at) on public.science_lab_inventory_edits to anon, authenticated;
grant select on public.science_lab_questions, public.science_lab_answers to anon, authenticated;
revoke insert, update, delete on public.science_lab_questions, public.science_lab_answers from anon, authenticated;
grant insert (content) on public.science_lab_questions to authenticated;
grant insert (question_id, content) on public.science_lab_answers to authenticated;

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
  using (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'));

drop policy if exists "Admins can update science lab reservation status" on public.science_lab_reservations;
create policy "Admins can update science lab reservation status"
  on public.science_lab_reservations
  for update
  using (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'))
  with check (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'));

drop policy if exists "Anyone can read science lab notices" on public.science_lab_notices;
create policy "Anyone can read science lab notices"
  on public.science_lab_notices
  for select
  using (true);

drop policy if exists "Authenticated users can create science lab notices" on public.science_lab_notices;
drop policy if exists "Admins can create science lab notices" on public.science_lab_notices;
create policy "Admins can create science lab notices"
  on public.science_lab_notices
  for insert
  with check (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'));

drop policy if exists "Authenticated users can delete science lab notices" on public.science_lab_notices;
drop policy if exists "Admins can delete science lab notices" on public.science_lab_notices;
create policy "Admins can delete science lab notices"
  on public.science_lab_notices
  for delete
  using (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'));

drop policy if exists "Anyone can read science lab reservation blocks" on public.science_lab_reservation_blocks;
create policy "Anyone can read science lab reservation blocks"
  on public.science_lab_reservation_blocks
  for select
  using (true);

drop policy if exists "Admins can create science lab reservation blocks" on public.science_lab_reservation_blocks;
create policy "Admins can create science lab reservation blocks"
  on public.science_lab_reservation_blocks
  for insert
  with check (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'));

drop policy if exists "Admins can delete science lab reservation blocks" on public.science_lab_reservation_blocks;
create policy "Admins can delete science lab reservation blocks"
  on public.science_lab_reservation_blocks
  for delete
  using (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'));

drop policy if exists "Anyone can read science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Anyone can read science lab inventory edits"
  on public.science_lab_inventory_edits
  for select
  using (true);

drop policy if exists "Admins can create science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Admins can create science lab inventory edits"
  on public.science_lab_inventory_edits
  for insert
  with check (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'));

drop policy if exists "Admins can update science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Admins can update science lab inventory edits"
  on public.science_lab_inventory_edits
  for update
  using (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'))
  with check (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'));

drop policy if exists "Anyone can create quantity inventory edits" on public.science_lab_inventory_edits;
create policy "Anyone can create quantity inventory edits"
  on public.science_lab_inventory_edits
  for insert
  with check (field_name = 'quantity');

drop policy if exists "Anyone can update quantity inventory edits" on public.science_lab_inventory_edits;
create policy "Anyone can update quantity inventory edits"
  on public.science_lab_inventory_edits
  for update
  using (field_name = 'quantity')
  with check (field_name = 'quantity');

drop policy if exists "Admins can delete science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Admins can delete science lab inventory edits"
  on public.science_lab_inventory_edits
  for delete
  using (lower(auth.jwt() ->> 'email') in ('rices2114@gmail.com', '2min095156@gmail.com', 'stst5192@naver.com'));

drop policy if exists "Anyone can read science lab questions" on public.science_lab_questions;
create policy "Anyone can read science lab questions"
  on public.science_lab_questions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can create own questions" on public.science_lab_questions;
create policy "Authenticated users can create own questions"
  on public.science_lab_questions
  for insert
  to authenticated
  with check (auth.uid() = author_id);

drop policy if exists "Anyone can read science lab answers" on public.science_lab_answers;
create policy "Anyone can read science lab answers"
  on public.science_lab_answers
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Authenticated users can create own answers" on public.science_lab_answers;
create policy "Authenticated users can create own answers"
  on public.science_lab_answers
  for insert
  to authenticated
  with check (auth.uid() = author_id);
