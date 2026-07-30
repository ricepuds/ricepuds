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

create table if not exists public.science_lab_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  name_change_available boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  image_paths text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

alter table public.science_lab_questions
  add column if not exists is_anonymous boolean not null default false;
alter table public.science_lab_questions
  add column if not exists image_paths text[] not null default '{}'::text[];
alter table public.science_lab_questions
  drop constraint if exists science_lab_questions_image_count_check;
alter table public.science_lab_questions
  add constraint science_lab_questions_image_count_check
  check (cardinality(image_paths) between 0 and 3);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'science-lab-question-images',
  'science-lab-question-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.science_lab_question_image_uploads (
  object_path text primary key
    check (object_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  expires_at timestamptz not null,
  -- Keep the audit row when a question is removed. Storage objects must be
  -- deleted through the Storage API before the question can be removed.
  attached_question_id uuid references public.science_lab_questions(id) on delete restrict,
  attached_at timestamptz,
  cancelled_at timestamptz,
  claimed_at timestamptz,
  claim_txid bigint,
  created_at timestamptz not null default now(),
  check (attached_question_id is not null or attached_at is null),
  constraint science_lab_question_image_uploads_claim_check
    check ((claimed_at is null) = (claim_txid is null))
);

alter table public.science_lab_question_image_uploads
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_txid bigint;
alter table public.science_lab_question_image_uploads
  drop constraint if exists science_lab_question_image_uploads_claim_check;
alter table public.science_lab_question_image_uploads
  add constraint science_lab_question_image_uploads_claim_check
  check ((claimed_at is null) = (claim_txid is null));

create index if not exists science_lab_question_image_uploads_owner_created_idx
  on public.science_lab_question_image_uploads (owner_id, created_at desc);
create index if not exists science_lab_question_image_uploads_pending_idx
  on public.science_lab_question_image_uploads (owner_id, expires_at)
  where attached_question_id is null and cancelled_at is null;

alter table public.science_lab_question_image_uploads enable row level security;
revoke all on public.science_lab_question_image_uploads from public, anon, authenticated;

create or replace function public.reserve_science_lab_question_images(
  p_mime_types text[]
)
returns table (object_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  requested_count integer := coalesce(cardinality(p_mime_types), 0);
  requested_mime_type text;
  object_extension text;
  reserved_path text;
begin
  if requester_id is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;
  if requested_count not between 1 and 3 then
    raise exception using errcode = '22023', message = '사진은 한 번에 1~3장만 준비할 수 있습니다.';
  end if;

  -- Serialize each account's reservations so simultaneous requests cannot
  -- race past the pending/hourly/daily quota checks below.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requester_id::text, 0)
  );

  delete from public.science_lab_question_image_uploads as upload
   where upload.owner_id = requester_id
     and upload.created_at < now() - interval '7 days'
     and upload.attached_question_id is null
     and not exists (
       select 1
         from storage.objects as object
        where object.bucket_id = 'science-lab-question-images'
          and object.name = upload.object_path
     );

  if (
    select count(*) + requested_count
      from public.science_lab_question_image_uploads as upload
     where upload.owner_id = requester_id
       and upload.attached_question_id is null
       and upload.cancelled_at is null
       and upload.expires_at > now()
  ) > 6 then
    raise exception using errcode = '54000', message = '처리 중인 사진이 많습니다. 잠시 후 다시 시도해 주세요.';
  end if;

  if (
    select count(*) + requested_count
      from public.science_lab_question_image_uploads as upload
     where upload.owner_id = requester_id
       and upload.created_at > now() - interval '1 hour'
  ) > 12 then
    raise exception using errcode = '54000', message = '시간당 사진 첨부 한도를 초과했습니다.';
  end if;

  if (
    select count(*) + requested_count
      from public.science_lab_question_image_uploads as upload
     where upload.owner_id = requester_id
       and upload.created_at > now() - interval '1 day'
  ) > 30 then
    raise exception using errcode = '54000', message = '하루 사진 첨부 한도를 초과했습니다.';
  end if;

  if (
    (
      select count(*)
        from storage.objects as object
       where object.bucket_id = 'science-lab-question-images'
         and object.owner_id = requester_id::text
    ) + (
      select count(*)
        from public.science_lab_question_image_uploads as upload
       where upload.owner_id = requester_id
         and upload.attached_question_id is null
         and upload.cancelled_at is null
         and upload.expires_at > now()
         and not exists (
           select 1
             from storage.objects as object
            where object.bucket_id = 'science-lab-question-images'
              and object.name = upload.object_path
         )
    ) + requested_count
  ) > 60 then
    raise exception using errcode = '54000', message = '계정의 사진 저장 한도를 초과했습니다.';
  end if;

  foreach requested_mime_type in array p_mime_types loop
    requested_mime_type := lower(btrim(coalesce(requested_mime_type, '')));
    object_extension := case requested_mime_type
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'image/webp' then 'webp'
      else null
    end;
    if object_extension is null then
      raise exception using errcode = '22023', message = 'JPG, PNG, WebP 사진만 첨부할 수 있습니다.';
    end if;

    reserved_path := gen_random_uuid()::text || '.' || object_extension;
    insert into public.science_lab_question_image_uploads (
      object_path,
      owner_id,
      mime_type,
      expires_at
    ) values (
      reserved_path,
      requester_id,
      requested_mime_type,
      now() + interval '15 minutes'
    );

    object_path := reserved_path;
    return next;
  end loop;
end;
$$;

create or replace function public.can_upload_science_lab_question_image(
  p_object_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  claimed_path text;
  current_txid bigint := pg_catalog.txid_current();
begin
  if requester_id is null then
    return false;
  end if;

  -- Claim the path atomically in the Storage INSERT transaction. Repeated
  -- policy evaluation in that same transaction is allowed, but a later
  -- upload (including after deletion) cannot reuse the reservation.
  update public.science_lab_question_image_uploads as upload
     set claimed_at = coalesce(upload.claimed_at, now()),
         claim_txid = coalesce(upload.claim_txid, current_txid)
   where upload.object_path = p_object_path
     and upload.owner_id = requester_id
     and upload.attached_question_id is null
     and upload.cancelled_at is null
     and upload.expires_at > now()
     and (upload.claimed_at is null or upload.claim_txid = current_txid)
  returning upload.object_path into claimed_path;

  return claimed_path is not null;
end;
$$;

create or replace function public.can_remove_science_lab_question_image(
  p_object_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  removable_path text;
begin
  if requester_id is null then
    return false;
  end if;

  -- Use the same lock order as question attachment so an ambiguous submit
  -- response cannot delete a file while the question is being committed.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requester_id::text, 0)
  );

  select upload.object_path
    into removable_path
    from public.science_lab_question_image_uploads as upload
   where upload.object_path = p_object_path
     and upload.owner_id = requester_id
     and upload.attached_question_id is null
   for update;

  return removable_path is not null;
end;
$$;

create or replace function public.cancel_science_lab_question_images(
  p_object_paths text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
begin
  if requester_id is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;
  if coalesce(cardinality(p_object_paths), 0) not between 1 and 3 then
    raise exception using errcode = '22023', message = '취소할 사진 경로가 올바르지 않습니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requester_id::text, 0)
  );
  if exists (
    select 1
      from unnest(p_object_paths) as candidate(path)
     where not exists (
       select 1
         from public.science_lab_question_image_uploads as upload
        where upload.object_path = candidate.path
          and upload.owner_id = requester_id
          and upload.attached_question_id is null
     )
  ) then
    raise exception using errcode = '42501', message = '사진 업로드 취소 권한이 없습니다.';
  end if;
  if exists (
    select 1
      from storage.objects as object
     where object.bucket_id = 'science-lab-question-images'
       and object.name = any(p_object_paths)
  ) then
    raise exception using errcode = 'P0001', message = '저장소 사진을 먼저 삭제해 주세요.';
  end if;

  update public.science_lab_question_image_uploads as upload
     set cancelled_at = coalesce(upload.cancelled_at, now())
   where upload.owner_id = requester_id
     and upload.object_path = any(p_object_paths)
     and upload.attached_question_id is null;
end;
$$;

create table if not exists public.science_lab_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.science_lab_questions(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default '사용자',
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- 잘못 뒤바뀐 두 계정의 이름을 이메일 기준으로 정확히 교정하고,
-- 프로필, 인증 메타데이터, 기존 공개 작성자명까지 동기화합니다.
do $$
declare
  desired record;
  target_user_id uuid;
  target_created_at timestamptz;
begin
  for desired in
    select *
      from (values
        ('2min095156@gmail.com'::text, '김형민'::text),
        ('stst5192@naver.com'::text, '윤슬기'::text)
      ) as names(email, display_name)
  loop
    select users.id, users.created_at
      into target_user_id, target_created_at
      from auth.users as users
     where lower(btrim(coalesce(users.email, ''))) = desired.email
     limit 1;

    if not found then
      raise warning 'Science Lab account not found: %', desired.email;
      continue;
    end if;

    insert into public.science_lab_profiles as profile (
      user_id,
      display_name,
      name_change_available,
      created_at,
      updated_at
    ) values (
      target_user_id,
      desired.display_name,
      false,
      target_created_at,
      now()
    )
    on conflict (user_id) do update
      set display_name = excluded.display_name,
          name_change_available = false,
          updated_at = now()
    where profile.display_name is distinct from excluded.display_name
       or profile.name_change_available is distinct from false;

    update auth.users as users
       set raw_user_meta_data = jsonb_set(
         jsonb_set(
           coalesce(users.raw_user_meta_data, '{}'::jsonb),
           '{name}',
           to_jsonb(desired.display_name::text),
           true
         ),
         '{profile_name_set}',
         'true'::jsonb,
         true
       )
     where users.id = target_user_id
       and (
         users.raw_user_meta_data ->> 'name' is distinct from desired.display_name
         or lower(coalesce(users.raw_user_meta_data ->> 'profile_name_set', 'false')) <> 'true'
       );

    update public.science_lab_questions as question
       set author_name = desired.display_name
     where question.author_id = target_user_id
       and not question.is_anonymous
       and question.author_name is distinct from desired.display_name;

    update public.science_lab_answers as answer
       set author_name = desired.display_name
     where answer.author_id = target_user_id
       and answer.author_name is distinct from desired.display_name;
  end loop;
end;
$$;

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

  new.image_paths := coalesce(new.image_paths, '{}'::text[]);
  if cardinality(new.image_paths) > 3 then
    raise exception using errcode = '22023', message = '질문에는 사진을 최대 3장까지 첨부할 수 있습니다.';
  end if;

  if cardinality(new.image_paths) <> (
    select count(distinct candidate.path)
      from unnest(new.image_paths) as candidate(path)
  ) then
    raise exception using errcode = '22023', message = '같은 사진을 중복 첨부할 수 없습니다.';
  end if;

  if cardinality(new.image_paths) > 0 then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(auth.uid()::text, 0)
    );
  end if;

  perform upload.object_path
    from public.science_lab_question_image_uploads as upload
   where upload.owner_id = auth.uid()
     and upload.object_path = any(new.image_paths)
     and upload.attached_question_id is null
     and upload.cancelled_at is null
     and upload.expires_at > now()
   order by upload.object_path
   for update;

  if (
    select count(*)
      from public.science_lab_question_image_uploads as upload
     where upload.owner_id = auth.uid()
       and upload.object_path = any(new.image_paths)
       and upload.attached_question_id is null
       and upload.cancelled_at is null
       and upload.expires_at > now()
  ) <> cardinality(new.image_paths) then
    raise exception using errcode = '42501', message = '유효한 사진 업로드 준비 정보가 없습니다.';
  end if;

  if exists (
    select 1
      from unnest(new.image_paths) as candidate(path)
     where candidate.path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
        or not exists (
          select 1
            from public.science_lab_question_image_uploads as upload
            join storage.objects as object
              on object.bucket_id = 'science-lab-question-images'
             and object.name = upload.object_path
           where upload.object_path = candidate.path
             and upload.owner_id = auth.uid()
             and upload.attached_question_id is null
             and upload.cancelled_at is null
             and upload.expires_at > now()
             and object.name = candidate.path
             and object.owner_id = auth.uid()::text
             and upload.mime_type = lower(coalesce(object.metadata ->> 'mimetype', ''))
             and (
               (candidate.path ~ '\.jpg$' and lower(coalesce(object.metadata ->> 'mimetype', '')) = 'image/jpeg')
               or (candidate.path ~ '\.png$' and lower(coalesce(object.metadata ->> 'mimetype', '')) = 'image/png')
               or (candidate.path ~ '\.webp$' and lower(coalesce(object.metadata ->> 'mimetype', '')) = 'image/webp')
             )
             and (
               case
                 when coalesce(object.metadata ->> 'size', '') ~ '^[0-9]+$'
                   then (object.metadata ->> 'size')::bigint
                 else null
               end
             ) between 1 and 5242880
        )
  ) then
    raise exception using errcode = '42501', message = '업로드한 본인의 사진만 질문에 첨부할 수 있습니다.';
  end if;

  new.author_id := auth.uid();
  new.author_name := case when new.is_anonymous then '익명' else profile_name end;
  return new;
end;
$$;

create or replace function public.attach_science_lab_question_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attached_count integer;
begin
  if cardinality(coalesce(new.image_paths, '{}'::text[])) = 0 then
    return new;
  end if;

  -- The BEFORE trigger already locked and validated these rows. Linking them
  -- AFTER INSERT avoids referencing a question row that does not exist yet.
  update public.science_lab_question_image_uploads as upload
     set attached_question_id = new.id,
         attached_at = now()
   where upload.owner_id = new.author_id
     and upload.object_path = any(new.image_paths)
     and upload.attached_question_id is null
     and upload.cancelled_at is null
     and upload.expires_at > now();

  get diagnostics attached_count = row_count;
  if attached_count <> cardinality(new.image_paths) then
    raise exception using errcode = '42501', message = '사진 첨부 정보를 질문에 연결하지 못했습니다.';
  end if;

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

drop trigger if exists attach_science_lab_question_images_after_insert
  on public.science_lab_questions;
create trigger attach_science_lab_question_images_after_insert
  after insert on public.science_lab_questions
  for each row execute function public.attach_science_lab_question_images();

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

alter table public.science_lab_reservations enable row level security;
alter table public.science_lab_notices enable row level security;
alter table public.science_lab_reservation_blocks enable row level security;
alter table public.science_lab_inventory_edits enable row level security;
alter table public.science_lab_profiles enable row level security;
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

revoke all on public.science_lab_profiles from anon, authenticated;
grant select (display_name, name_change_available)
  on public.science_lab_profiles to authenticated;

revoke select on public.science_lab_questions, public.science_lab_answers from anon, authenticated;
grant select (id, author_name, content, is_anonymous, image_paths, created_at) on public.science_lab_questions to anon, authenticated;
grant select (id, question_id, author_name, content, created_at) on public.science_lab_answers to anon, authenticated;
revoke insert, update, delete on public.science_lab_questions, public.science_lab_answers from anon, authenticated;
grant insert (content, is_anonymous, image_paths) on public.science_lab_questions to authenticated;
grant insert (question_id, content) on public.science_lab_answers to authenticated;

revoke all on function public.create_science_lab_profile() from public, anon, authenticated;
revoke all on function public.set_science_lab_question_author() from public, anon, authenticated;
revoke all on function public.attach_science_lab_question_images() from public, anon, authenticated;
revoke all on function public.set_science_lab_answer_author() from public, anon, authenticated;
revoke all on function public.reserve_science_lab_question_images(text[]) from public, anon, authenticated;
grant execute on function public.reserve_science_lab_question_images(text[]) to authenticated;
revoke all on function public.can_upload_science_lab_question_image(text) from public, anon, authenticated;
grant execute on function public.can_upload_science_lab_question_image(text) to authenticated;
revoke all on function public.can_remove_science_lab_question_image(text) from public, anon, authenticated;
grant execute on function public.can_remove_science_lab_question_image(text) to authenticated;
revoke all on function public.cancel_science_lab_question_images(text[]) from public, anon, authenticated;
grant execute on function public.cancel_science_lab_question_images(text[]) to authenticated;
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

drop policy if exists "Authenticated users can upload question images" on storage.objects;
create policy "Authenticated users can upload question images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'science-lab-question-images'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and public.can_upload_science_lab_question_image(name)
    and (
      (name ~ '\.jpg$' and lower(coalesce(metadata ->> 'mimetype', '')) = 'image/jpeg')
      or (name ~ '\.png$' and lower(coalesce(metadata ->> 'mimetype', '')) = 'image/png')
      or (name ~ '\.webp$' and lower(coalesce(metadata ->> 'mimetype', '')) = 'image/webp')
    )
  );

drop policy if exists "Users can inspect own question images" on storage.objects;
create policy "Users can inspect own question images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'science-lab-question-images'
    and owner_id = (select auth.uid()::text)
  );

drop policy if exists "Users can remove unused question images" on storage.objects;
create policy "Users can remove unused question images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'science-lab-question-images'
    and owner_id = (select auth.uid()::text)
    and public.can_remove_science_lab_question_image(name)
  );

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
