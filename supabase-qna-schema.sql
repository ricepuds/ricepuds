-- Supabase SQL Editor에서 한 번 실행해 질문방 테이블과 권한을 생성합니다.
begin;

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

alter table public.science_lab_questions enable row level security;
alter table public.science_lab_answers enable row level security;

grant usage on schema public to anon, authenticated;
revoke select on public.science_lab_questions, public.science_lab_answers from anon, authenticated;
grant select (id, author_name, content, created_at) on public.science_lab_questions to anon, authenticated;
grant select (id, question_id, author_name, content, created_at) on public.science_lab_answers to anon, authenticated;
revoke insert, update, delete on public.science_lab_questions, public.science_lab_answers from anon, authenticated;
grant insert (content) on public.science_lab_questions to authenticated;
grant insert (question_id, content) on public.science_lab_answers to authenticated;

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

notify pgrst, 'reload schema';

commit;
