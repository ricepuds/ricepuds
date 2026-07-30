-- Supabase SQL Editor에서 한 번 실행해 계정 이름과 질문방 권한을 설정합니다.
begin;

create table if not exists public.science_lab_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  name_change_available boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.science_lab_profiles enable row level security;

create or replace function public.create_science_lab_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_name text;
begin
  initial_name := left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '사용자'
  ), 40);
  insert into public.science_lab_profiles (
    user_id,
    display_name,
    name_change_available
  ) values (
    new.id,
    initial_name,
    false
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_science_lab_profile_after_signup on auth.users;
create trigger create_science_lab_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_science_lab_profile();

-- 이 스크립트 적용 전에 가입한 계정만 이름을 한 번 변경할 수 있습니다.
insert into public.science_lab_profiles (
  user_id,
  display_name,
  name_change_available,
  created_at,
  updated_at
)
select
  users.id,
  left(coalesce(
    nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    '사용자'
  ), 40),
  lower(coalesce(users.raw_user_meta_data ->> 'profile_name_set', 'false')) <> 'true',
  users.created_at,
  now()
from auth.users as users
on conflict (user_id) do nothing;

create table if not exists public.science_lab_questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default '사용자',
  content text not null check (char_length(btrim(content)) between 1 and 500),
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.science_lab_questions
  add column if not exists is_anonymous boolean not null default false;

create table if not exists public.science_lab_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.science_lab_questions(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default '사용자',
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create or replace function public.set_science_lab_question_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;

  select profile.display_name
    into profile_name
    from public.science_lab_profiles as profile
   where profile.user_id = auth.uid();

  if profile_name is null then
    raise exception using errcode = 'P0001', message = '계정 이름을 먼저 설정해 주세요.';
  end if;

  new.author_id := auth.uid();
  new.author_name := case when new.is_anonymous then '익명' else profile_name end;
  return new;
end;
$$;

create or replace function public.set_science_lab_answer_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;

  select profile.display_name
    into profile_name
    from public.science_lab_profiles as profile
   where profile.user_id = auth.uid();

  if profile_name is null then
    raise exception using errcode = 'P0001', message = '계정 이름을 먼저 설정해 주세요.';
  end if;

  new.author_id := auth.uid();
  new.author_name := profile_name;
  return new;
end;
$$;

drop trigger if exists set_science_lab_question_author_before_insert
  on public.science_lab_questions;
create trigger set_science_lab_question_author_before_insert
  before insert on public.science_lab_questions
  for each row execute function public.set_science_lab_question_author();

drop trigger if exists set_science_lab_answer_author_before_insert
  on public.science_lab_answers;
create trigger set_science_lab_answer_author_before_insert
  before insert on public.science_lab_answers
  for each row execute function public.set_science_lab_answer_author();

create or replace function public.set_my_science_lab_name(new_display_name text)
returns table (display_name text, name_change_available boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;

  cleaned_name := regexp_replace(btrim(coalesce(new_display_name, '')), '\s+', ' ', 'g');
  if char_length(cleaned_name) not between 1 and 40 then
    raise exception using errcode = '22023', message = '이름은 1자 이상 40자 이하로 입력해 주세요.';
  end if;

  update public.science_lab_profiles as profile
     set display_name = cleaned_name,
         name_change_available = false,
         updated_at = now()
   where profile.user_id = auth.uid()
     and profile.name_change_available;

  if not found then
    raise exception using errcode = 'P0001', message = '이름 변경 기회를 이미 사용했습니다.';
  end if;

  update auth.users as users
     set raw_user_meta_data = jsonb_set(
       jsonb_set(coalesce(users.raw_user_meta_data, '{}'::jsonb), '{name}', to_jsonb(cleaned_name), true),
       '{profile_name_set}',
       to_jsonb(true),
       true
     )
   where users.id = auth.uid();

  update public.science_lab_questions as question
     set author_name = cleaned_name
   where question.author_id = auth.uid()
     and not question.is_anonymous;

  update public.science_lab_answers as answer
     set author_name = cleaned_name
   where answer.author_id = auth.uid();

  return query select cleaned_name, false;
end;
$$;

create or replace function public.get_science_lab_question_authors()
returns table (
  question_id uuid,
  author_id uuid,
  author_name text,
  author_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) not in (
    'rices2114@gmail.com',
    '2min095156@gmail.com',
    'stst5192@naver.com'
  ) then
    raise exception using errcode = '42501', message = '관리자만 작성자를 확인할 수 있습니다.';
  end if;

  return query
  select
    question.id,
    question.author_id,
    coalesce(profile.display_name, question.author_name, '사용자'),
    coalesce(users.email, '')::text
  from public.science_lab_questions as question
  left join public.science_lab_profiles as profile
    on profile.user_id = question.author_id
  left join auth.users as users
    on users.id = question.author_id
  order by question.created_at desc;
end;
$$;

create or replace function public.get_science_lab_accounts()
returns table (
  display_name text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  name_change_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
      from auth.users as requester
     where requester.id = auth.uid()
       and lower(coalesce(requester.email, '')) = 'rices2114@gmail.com'
  ) then
    raise exception using
      errcode = '42501',
      message = '계정 목록을 확인할 권한이 없습니다.';
  end if;

  return query
  select
    coalesce(
      profile.display_name,
      nullif(split_part(coalesce(account.email, ''), '@', 1), ''),
      '사용자'
    )::text,
    coalesce(account.email, '')::text,
    account.created_at,
    account.last_sign_in_at,
    coalesce(profile.name_change_available, false)
  from auth.users as account
  left join public.science_lab_profiles as profile
    on profile.user_id = account.id
  order by account.created_at desc;
end;
$$;

create index if not exists science_lab_questions_created_at_idx
  on public.science_lab_questions (created_at desc);
create index if not exists science_lab_answers_question_created_at_idx
  on public.science_lab_answers (question_id, created_at asc);

alter table public.science_lab_questions enable row level security;
alter table public.science_lab_answers enable row level security;

grant usage on schema public to anon, authenticated;

revoke all on public.science_lab_profiles from anon, authenticated;
grant select (display_name, name_change_available)
  on public.science_lab_profiles to authenticated;

revoke select on public.science_lab_questions, public.science_lab_answers
  from anon, authenticated;
grant select (id, author_name, content, is_anonymous, created_at)
  on public.science_lab_questions to anon, authenticated;
grant select (id, question_id, author_name, content, created_at)
  on public.science_lab_answers to anon, authenticated;
revoke insert, update, delete on public.science_lab_questions, public.science_lab_answers
  from anon, authenticated;
grant insert (content, is_anonymous)
  on public.science_lab_questions to authenticated;
grant insert (question_id, content)
  on public.science_lab_answers to authenticated;

revoke all on function public.create_science_lab_profile() from public, anon, authenticated;
revoke all on function public.set_science_lab_question_author() from public, anon, authenticated;
revoke all on function public.set_science_lab_answer_author() from public, anon, authenticated;
revoke all on function public.set_my_science_lab_name(text) from public, anon, authenticated;
grant execute on function public.set_my_science_lab_name(text) to authenticated;
revoke all on function public.get_science_lab_question_authors() from public, anon, authenticated;
grant execute on function public.get_science_lab_question_authors() to authenticated;
revoke all on function public.get_science_lab_accounts() from public, anon, authenticated;
grant execute on function public.get_science_lab_accounts() to authenticated;

drop policy if exists "Users can read own science lab profile" on public.science_lab_profiles;
create policy "Users can read own science lab profile"
  on public.science_lab_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

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
