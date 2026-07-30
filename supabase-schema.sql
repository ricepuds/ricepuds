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

create table if not exists public.science_lab_question_delete_tickets (
  ticket_id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique
    references public.science_lab_questions(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  object_paths text[] not null default '{}'::text[]
    check (cardinality(object_paths) between 0 and 3),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists science_lab_question_delete_tickets_requester_expiry_idx
  on public.science_lab_question_delete_tickets (requester_id, expires_at);
create index if not exists science_lab_question_delete_tickets_object_paths_idx
  on public.science_lab_question_delete_tickets using gin (object_paths);

alter table public.science_lab_question_delete_tickets enable row level security;
revoke all on public.science_lab_question_delete_tickets from public, anon, authenticated;

create table if not exists public.science_lab_account_delete_tickets (
  ticket_id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null unique references auth.users(id) on delete cascade,
  target_email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (requester_id <> target_user_id)
);

create table if not exists public.science_lab_account_delete_objects (
  ticket_id uuid not null
    references public.science_lab_account_delete_tickets(ticket_id) on delete cascade,
  bucket_id text not null,
  object_path text not null,
  owner_id text not null,
  primary key (ticket_id, bucket_id, object_path)
);

create index if not exists science_lab_account_delete_tickets_requester_expiry_idx
  on public.science_lab_account_delete_tickets (requester_id, expires_at);
create index if not exists science_lab_account_delete_tickets_target_expiry_idx
  on public.science_lab_account_delete_tickets (target_user_id, expires_at);
create index if not exists science_lab_account_delete_objects_lookup_idx
  on public.science_lab_account_delete_objects (
    bucket_id,
    object_path,
    owner_id,
    ticket_id
  );

alter table public.science_lab_account_delete_tickets enable row level security;
alter table public.science_lab_account_delete_objects enable row level security;
revoke all on public.science_lab_account_delete_tickets from public, anon, authenticated;
revoke all on public.science_lab_account_delete_objects from public, anon, authenticated;

create or replace function public.is_science_lab_account_deletion_pending(
  p_target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.science_lab_account_delete_tickets as ticket
     where ticket.target_user_id = p_target_user_id
       and ticket.expires_at > now()
  );
$$;

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

  if public.is_science_lab_account_deletion_pending(requester_id) then
    raise exception using
      errcode = '55000',
      message = '계정 삭제가 진행 중이라 사진을 준비할 수 없습니다.';
  end if;

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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requester_id::text, 0)
  );
  if public.is_science_lab_account_deletion_pending(requester_id) then
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
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.science_lab_answers
  add column if not exists is_anonymous boolean not null default false;

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

    -- This historical correction must run once only. Later owner edits must
    -- survive harmless schema re-runs.
    if lower(coalesce((
      select users.raw_user_meta_data ->> 'science_lab_name_pair_fixed_v1'
        from auth.users as users
       where users.id = target_user_id
    ), 'false')) = 'true' then
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
           jsonb_set(
             coalesce(users.raw_user_meta_data, '{}'::jsonb),
             '{name}',
             to_jsonb(desired.display_name::text),
             true
           ),
           '{profile_name_set}',
           'true'::jsonb,
           true
         ),
         '{science_lab_name_pair_fixed_v1}',
         'true'::jsonb,
         true
       )
     where users.id = target_user_id
       and lower(coalesce(users.raw_user_meta_data ->> 'science_lab_name_pair_fixed_v1', 'false')) <> 'true';

    update public.science_lab_questions as question
       set author_name = desired.display_name
     where question.author_id = target_user_id
       and not question.is_anonymous
       and question.author_name is distinct from desired.display_name;

    update public.science_lab_answers as answer
       set author_name = desired.display_name
     where answer.author_id = target_user_id
       and not answer.is_anonymous
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
  requester_id uuid := auth.uid();
  profile_name text;
begin
  if requester_id is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requester_id::text, 0)
  );
  if public.is_science_lab_account_deletion_pending(requester_id) then
    raise exception using
      errcode = '55000',
      message = '계정 삭제가 진행 중이라 질문을 등록할 수 없습니다.';
  end if;

  select profile.display_name
    into profile_name
    from public.science_lab_profiles as profile
   where profile.user_id = requester_id;

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

  perform upload.object_path
    from public.science_lab_question_image_uploads as upload
   where upload.owner_id = requester_id
     and upload.object_path = any(new.image_paths)
     and upload.attached_question_id is null
     and upload.cancelled_at is null
     and upload.expires_at > now()
   order by upload.object_path
   for update;

  if (
    select count(*)
      from public.science_lab_question_image_uploads as upload
     where upload.owner_id = requester_id
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
             and upload.owner_id = requester_id
             and upload.attached_question_id is null
             and upload.cancelled_at is null
             and upload.expires_at > now()
             and object.name = candidate.path
             and object.owner_id = requester_id::text
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

  new.author_id := requester_id;
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
  requester_id uuid := auth.uid();
  profile_name text;
begin
  if requester_id is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requester_id::text, 0)
  );
  if public.is_science_lab_account_deletion_pending(requester_id) then
    raise exception using
      errcode = '55000',
      message = '계정 삭제가 진행 중이라 답변을 등록할 수 없습니다.';
  end if;

  select profile.display_name
    into profile_name
    from public.science_lab_profiles as profile
   where profile.user_id = requester_id;

  if profile_name is null then
    raise exception using errcode = 'P0001', message = '계정 이름을 먼저 설정해 주세요.';
  end if;

  new.author_id := requester_id;
  new.is_anonymous := coalesce(new.is_anonymous, false);
  new.author_name := case when new.is_anonymous then '익명' else profile_name end;
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
  requester_id uuid := auth.uid();
  cleaned_name text;
begin
  if requester_id is null then
    raise exception using errcode = '42501', message = '로그인이 필요합니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requester_id::text, 0)
  );
  if public.is_science_lab_account_deletion_pending(requester_id) then
    raise exception using
      errcode = '55000',
      message = '계정 삭제가 진행 중이라 이름을 변경할 수 없습니다.';
  end if;

  cleaned_name := regexp_replace(btrim(coalesce(new_display_name, '')), '\s+', ' ', 'g');
  if char_length(cleaned_name) not between 1 and 40 then
    raise exception using errcode = '22023', message = '이름은 1자 이상 40자 이하로 입력해 주세요.';
  end if;

  update public.science_lab_profiles as profile
     set display_name = cleaned_name,
         name_change_available = false,
         updated_at = now()
   where profile.user_id = requester_id
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
   where users.id = requester_id;

  update public.science_lab_questions as question
     set author_name = cleaned_name
   where question.author_id = requester_id
     and not question.is_anonymous;

  update public.science_lab_answers as answer
     set author_name = cleaned_name
   where answer.author_id = requester_id
     and not answer.is_anonymous;

  return query select cleaned_name, false;
end;
$$;

create or replace function public.is_science_lab_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
      from auth.users as requester
     where requester.id = auth.uid()
       and lower(btrim(coalesce(requester.email, ''))) in (
         'rices2114@gmail.com',
         '2min095156@gmail.com',
         'stst5192@naver.com'
       )
  );
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
  if not public.is_science_lab_admin() then
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

create or replace function public.get_science_lab_answer_authors()
returns table (
  answer_id uuid,
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
  if not public.is_science_lab_admin() then
    raise exception using errcode = '42501', message = '관리자만 작성자를 확인할 수 있습니다.';
  end if;

  return query
  select
    answer.id,
    answer.author_id,
    coalesce(profile.display_name, answer.author_name, '사용자'),
    coalesce(users.email, '')::text
  from public.science_lab_answers as answer
  left join public.science_lab_profiles as profile
    on profile.user_id = answer.author_id
  left join auth.users as users
    on users.id = answer.author_id
  where answer.is_anonymous
  order by answer.created_at asc;
end;
$$;

create or replace function public.can_admin_remove_science_lab_question_image(
  object_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_science_lab_admin())
    and exists (
      select 1
        from public.science_lab_question_delete_tickets as ticket
        join public.science_lab_questions as question
          on question.id = ticket.question_id
         and question.image_paths = ticket.object_paths
       where ticket.requester_id = (select auth.uid())
         and ticket.expires_at > now()
         and ticket.object_paths @> array[object_name]::text[]
    );
$$;

create or replace function public.prepare_science_lab_question_delete(
  p_question_id uuid
)
returns table (delete_ticket_id uuid, object_paths text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  question_author_id uuid;
  question_image_paths text[];
begin
  if not public.is_science_lab_admin() then
    raise exception using errcode = '42501', message = '관리자만 질문을 삭제할 수 있습니다.';
  end if;
  if p_question_id is null then
    raise exception using errcode = '22023', message = '삭제할 질문 정보가 올바르지 않습니다.';
  end if;

  select question.author_id
    into question_author_id
    from public.science_lab_questions as question
   where question.id = p_question_id;
  if not found then
    raise exception using errcode = 'P0002', message = '삭제할 질문을 찾지 못했습니다.';
  end if;

  -- Account and question deletion always lock the author before the question.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(question_author_id::text, 0)
  );
  if public.is_science_lab_account_deletion_pending(question_author_id) then
    raise exception using
      errcode = '55000',
      message = '계정 삭제가 진행 중이라 질문 삭제를 새로 준비할 수 없습니다.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('science-lab-question-delete:' || p_question_id::text, 0)
  );

  select question.image_paths
   into question_image_paths
    from public.science_lab_questions as question
   where question.id = p_question_id
     and question.author_id = question_author_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = '삭제할 질문을 찾지 못했습니다.';
  end if;

  question_image_paths := coalesce(question_image_paths, '{}'::text[]);
  if cardinality(question_image_paths) > 3
     or cardinality(question_image_paths) <> (
       select count(distinct candidate.path)
         from unnest(question_image_paths) as candidate(path)
     )
     or exists (
       select 1
         from unnest(question_image_paths) as candidate(path)
        where candidate.path is null
           or candidate.path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
     ) then
    raise exception using errcode = '22023', message = '질문의 첨부 사진 정보가 올바르지 않습니다.';
  end if;

  delete from public.science_lab_question_delete_tickets as ticket
   where ticket.expires_at <= now();

  return query
  insert into public.science_lab_question_delete_tickets as ticket (
    ticket_id,
    question_id,
    requester_id,
    object_paths,
    expires_at,
    created_at
  ) values (
    gen_random_uuid(),
    p_question_id,
    requester_id,
    question_image_paths,
    now() + interval '5 minutes',
    now()
  )
  on conflict (question_id) do update
    set ticket_id = gen_random_uuid(),
        requester_id = excluded.requester_id,
        object_paths = excluded.object_paths,
        expires_at = excluded.expires_at,
        created_at = excluded.created_at
  returning ticket.ticket_id, ticket.object_paths;
end;
$$;

drop function if exists public.delete_science_lab_question(uuid);

create or replace function public.finalize_science_lab_question_delete(
  p_delete_ticket_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  target_question_id uuid;
  question_author_id uuid;
  question_image_paths text[];
begin
  if requester_id is null or not public.is_science_lab_admin() then
    raise exception using errcode = '42501', message = '관리자만 질문을 삭제할 수 있습니다.';
  end if;
  if p_delete_ticket_id is null then
    raise exception using errcode = '22023', message = '질문 삭제 준비 정보가 올바르지 않습니다.';
  end if;

  select ticket.question_id, question.author_id
    into target_question_id, question_author_id
    from public.science_lab_question_delete_tickets as ticket
    join public.science_lab_questions as question
      on question.id = ticket.question_id
   where ticket.ticket_id = p_delete_ticket_id
     and ticket.requester_id = requester_id
     and ticket.expires_at > now();
  if not found then
    raise exception using errcode = '42501', message = '질문 삭제 준비 정보가 없거나 만료되었습니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(question_author_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('science-lab-question-delete:' || target_question_id::text, 0)
  );

  select ticket.object_paths
    into question_image_paths
    from public.science_lab_question_delete_tickets as ticket
    join public.science_lab_questions as question
      on question.id = ticket.question_id
     and question.image_paths = ticket.object_paths
     and question.author_id = question_author_id
   where ticket.ticket_id = p_delete_ticket_id
     and ticket.question_id = target_question_id
     and ticket.requester_id = requester_id
     and ticket.expires_at > now()
   for update of ticket, question;

  if not found then
    raise exception using errcode = '42501', message = '질문 삭제 준비 정보가 변경되었거나 만료되었습니다.';
  end if;

  if exists (
    select 1
      from storage.objects as object
     where object.bucket_id = 'science-lab-question-images'
       and object.name = any(coalesce(question_image_paths, '{}'::text[]))
  ) then
    raise exception using errcode = 'P0001', message = '첨부 사진을 먼저 삭제해 주세요.';
  end if;

  delete from public.science_lab_question_image_uploads as upload
   where upload.attached_question_id = target_question_id;
  delete from public.science_lab_questions as question
   where question.id = target_question_id;
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

create or replace function public.get_science_lab_accounts_v2()
returns table (
  account_id uuid,
  display_name text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  name_change_available boolean,
  can_delete boolean
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
       and lower(btrim(coalesce(requester.email, ''))) = 'rices2114@gmail.com'
  ) then
    raise exception using errcode = '42501', message = '계정 목록을 확인할 권한이 없습니다.';
  end if;

  return query
  select
    account.id,
    coalesce(
      profile.display_name,
      nullif(split_part(coalesce(account.email, ''), '@', 1), ''),
      '사용자'
    )::text,
    coalesce(account.email, '')::text,
    account.created_at,
    account.last_sign_in_at,
    coalesce(profile.name_change_available, false),
    (
      account.id <> auth.uid()
      and lower(btrim(coalesce(account.email, ''))) <> ''
      and lower(btrim(coalesce(account.email, ''))) <> 'rices2114@gmail.com'
    )
  from auth.users as account
  left join public.science_lab_profiles as profile
    on profile.user_id = account.id
  order by account.created_at desc;
end;
$$;

create or replace function public.owner_update_science_lab_account_name(
  p_target_user_id uuid,
  p_display_name text
)
returns table (
  account_id uuid,
  display_name text,
  name_change_available boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  cleaned_name text;
  target_created_at timestamptz;
begin
  if requester_id is null or not exists (
    select 1
      from auth.users as requester
     where requester.id = requester_id
       and lower(btrim(coalesce(requester.email, ''))) = 'rices2114@gmail.com'
  ) then
    raise exception using errcode = '42501', message = '계정 이름을 수정할 권한이 없습니다.';
  end if;

  cleaned_name := regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
  if char_length(cleaned_name) not between 1 and 40 then
    raise exception using errcode = '22023', message = '이름은 1자 이상 40자 이하로 입력해 주세요.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_target_user_id::text, 0)
  );
  if public.is_science_lab_account_deletion_pending(p_target_user_id) then
    raise exception using
      errcode = '55000',
      message = '계정 삭제가 진행 중이라 이름을 수정할 수 없습니다.';
  end if;

  select account.created_at
    into target_created_at
    from auth.users as account
   where account.id = p_target_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = '수정할 계정을 찾지 못했습니다.';
  end if;

  insert into public.science_lab_profiles as profile (
    user_id,
    display_name,
    name_change_available,
    created_at,
    updated_at
  ) values (
    p_target_user_id,
    cleaned_name,
    false,
    target_created_at,
    now()
  )
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        name_change_available = false,
        updated_at = now();

  update auth.users as account
     set raw_user_meta_data = jsonb_set(
       jsonb_set(
         coalesce(account.raw_user_meta_data, '{}'::jsonb),
         '{name}',
         to_jsonb(cleaned_name),
         true
       ),
       '{profile_name_set}',
       'true'::jsonb,
       true
     )
   where account.id = p_target_user_id;

  update public.science_lab_questions as question
     set author_name = cleaned_name
   where question.author_id = p_target_user_id
     and not question.is_anonymous;

  update public.science_lab_answers as answer
     set author_name = cleaned_name
   where answer.author_id = p_target_user_id
     and not answer.is_anonymous;

  return query select p_target_user_id, cleaned_name, false;
end;
$$;

-- Disable the legacy broad helper while its old Storage policies are replaced
-- later in this script. It is dropped after those policies are gone.
create or replace function public.can_owner_remove_science_lab_account_image(
  object_name text,
  object_owner_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

drop function if exists public.get_science_lab_account_storage_paths(uuid);
drop function if exists public.owner_delete_science_lab_account(uuid);

create or replace function public.can_owner_remove_science_lab_account_object(
  p_bucket_id text,
  p_object_path text,
  p_object_owner_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.science_lab_account_delete_tickets as ticket
      join public.science_lab_account_delete_objects as snapshot
        on snapshot.ticket_id = ticket.ticket_id
      join auth.users as requester
        on requester.id = ticket.requester_id
      join auth.users as target
        on target.id = ticket.target_user_id
     where ticket.requester_id = auth.uid()
       and lower(btrim(coalesce(requester.email, ''))) = 'rices2114@gmail.com'
       and ticket.target_user_id <> ticket.requester_id
       and lower(btrim(coalesce(target.email, ''))) <> 'rices2114@gmail.com'
       and ticket.expires_at > now()
       and snapshot.bucket_id = p_bucket_id
       and snapshot.object_path = p_object_path
       and snapshot.owner_id = p_object_owner_id
       and ticket.target_user_id::text = p_object_owner_id
  );
$$;

create or replace function public.prepare_science_lab_account_delete(
  p_target_user_id uuid
)
returns table (delete_ticket_id uuid, storage_objects jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  target_email text;
  new_ticket_id uuid;
begin
  if requester_id is null or not exists (
    select 1
      from auth.users as requester
     where requester.id = requester_id
       and lower(btrim(coalesce(requester.email, ''))) = 'rices2114@gmail.com'
  ) then
    raise exception using errcode = '42501', message = '계정 삭제를 준비할 권한이 없습니다.';
  end if;
  if p_target_user_id is null then
    raise exception using errcode = '22023', message = '삭제할 계정 정보가 올바르지 않습니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_target_user_id::text, 0)
  );

  select lower(btrim(coalesce(account.email, '')))
    into target_email
    from auth.users as account
   where account.id = p_target_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = '삭제할 계정을 찾지 못했습니다.';
  end if;
  if p_target_user_id = requester_id or target_email = 'rices2114@gmail.com' then
    raise exception using errcode = '42501', message = '소유자 계정은 삭제할 수 없습니다.';
  end if;

  delete from public.science_lab_account_delete_tickets as ticket
   where ticket.expires_at <= now()
      or ticket.target_user_id = p_target_user_id;

  insert into public.science_lab_account_delete_tickets (
    requester_id,
    target_user_id,
    target_email,
    expires_at
  ) values (
    requester_id,
    p_target_user_id,
    target_email,
    now() + interval '15 minutes'
  )
  returning ticket_id into new_ticket_id;

  insert into public.science_lab_account_delete_objects (
    ticket_id,
    bucket_id,
    object_path,
    owner_id
  )
  select
    new_ticket_id,
    object.bucket_id::text,
    object.name::text,
    object.owner_id::text
  from storage.objects as object
  where object.owner_id = p_target_user_id::text;

  return query
  select
    new_ticket_id,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'bucket_id', snapshot.bucket_id,
            'object_path', snapshot.object_path
          )
          order by snapshot.bucket_id, snapshot.object_path
        )
        from public.science_lab_account_delete_objects as snapshot
        where snapshot.ticket_id = new_ticket_id
      ),
      '[]'::jsonb
    );
end;
$$;

create or replace function public.finalize_science_lab_account_delete(
  p_delete_ticket_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  target_user_id uuid;
  target_email text;
begin
  if requester_id is null or not exists (
    select 1
      from auth.users as requester
     where requester.id = requester_id
       and lower(btrim(coalesce(requester.email, ''))) = 'rices2114@gmail.com'
  ) then
    raise exception using errcode = '42501', message = '계정을 삭제할 권한이 없습니다.';
  end if;
  if p_delete_ticket_id is null then
    raise exception using errcode = '22023', message = '계정 삭제 준비 정보가 올바르지 않습니다.';
  end if;

  select ticket.target_user_id
    into target_user_id
    from public.science_lab_account_delete_tickets as ticket
   where ticket.ticket_id = p_delete_ticket_id
     and ticket.requester_id = requester_id
     and ticket.expires_at > now();
  if not found then
    raise exception using errcode = '42501', message = '계정 삭제 준비 정보가 없거나 만료되었습니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_user_id::text, 0)
  );

  select lower(btrim(coalesce(account.email, '')))
    into target_email
    from auth.users as account
   where account.id = target_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = '삭제할 계정을 찾지 못했습니다.';
  end if;
  if target_user_id = requester_id or target_email = 'rices2114@gmail.com' then
    raise exception using errcode = '42501', message = '소유자 계정은 삭제할 수 없습니다.';
  end if;

  perform 1
    from public.science_lab_account_delete_tickets as ticket
   where ticket.ticket_id = p_delete_ticket_id
     and ticket.requester_id = requester_id
     and ticket.target_user_id = target_user_id
     and ticket.target_email = target_email
     and ticket.expires_at > now()
   for update;
  if not found then
    raise exception using errcode = '42501', message = '계정 삭제 준비 정보가 변경되었거나 만료되었습니다.';
  end if;

  if exists (
    select 1
      from public.science_lab_account_delete_objects as snapshot
      join storage.objects as object
        on object.bucket_id = snapshot.bucket_id
       and object.name = snapshot.object_path
     where snapshot.ticket_id = p_delete_ticket_id
  ) then
    raise exception using errcode = 'P0001', message = '준비된 계정 파일을 먼저 모두 삭제해 주세요.';
  end if;

  if exists (
    select 1
      from storage.objects as object
     where object.owner_id = target_user_id::text
  ) then
    raise exception using errcode = 'P0001', message = '계정에 새 파일이 남아 있어 삭제할 수 없습니다.';
  end if;

  delete from public.science_lab_question_image_uploads as upload
   where upload.owner_id = target_user_id;
  delete from auth.users as account
   where account.id = target_user_id;
end;
$$;

create index if not exists science_lab_questions_created_at_idx
  on public.science_lab_questions (created_at desc);
create index if not exists science_lab_questions_author_id_idx
  on public.science_lab_questions (author_id);
create index if not exists science_lab_answers_question_created_at_idx
  on public.science_lab_answers (question_id, created_at asc);
create index if not exists science_lab_answers_author_id_idx
  on public.science_lab_answers (author_id);
create index if not exists science_lab_question_image_uploads_attached_question_idx
  on public.science_lab_question_image_uploads (attached_question_id)
  where attached_question_id is not null;

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
grant select (id, question_id, author_name, content, is_anonymous, created_at) on public.science_lab_answers to anon, authenticated;
revoke insert, update, delete on public.science_lab_questions, public.science_lab_answers from anon, authenticated;
grant insert (content, is_anonymous, image_paths) on public.science_lab_questions to authenticated;
grant insert (question_id, content, is_anonymous) on public.science_lab_answers to authenticated;

revoke all on function public.create_science_lab_profile() from public, anon, authenticated;
revoke all on function public.is_science_lab_account_deletion_pending(uuid) from public, anon, authenticated;
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
revoke all on function public.get_science_lab_answer_authors() from public, anon, authenticated;
grant execute on function public.get_science_lab_answer_authors() to authenticated;
revoke all on function public.is_science_lab_admin() from public, anon, authenticated;
grant execute on function public.is_science_lab_admin() to authenticated;
revoke all on function public.can_admin_remove_science_lab_question_image(text) from public, anon, authenticated;
grant execute on function public.can_admin_remove_science_lab_question_image(text) to authenticated;
revoke all on function public.prepare_science_lab_question_delete(uuid) from public, anon, authenticated;
grant execute on function public.prepare_science_lab_question_delete(uuid) to authenticated;
revoke all on function public.finalize_science_lab_question_delete(uuid) from public, anon, authenticated;
grant execute on function public.finalize_science_lab_question_delete(uuid) to authenticated;
revoke all on function public.get_science_lab_accounts() from public, anon, authenticated;
grant execute on function public.get_science_lab_accounts() to authenticated;
revoke all on function public.get_science_lab_accounts_v2() from public, anon, authenticated;
grant execute on function public.get_science_lab_accounts_v2() to authenticated;
revoke all on function public.owner_update_science_lab_account_name(uuid, text) from public, anon, authenticated;
grant execute on function public.owner_update_science_lab_account_name(uuid, text) to authenticated;
revoke all on function public.can_owner_remove_science_lab_account_image(text, text) from public, anon, authenticated;
revoke all on function public.can_owner_remove_science_lab_account_object(text, text, text) from public, anon, authenticated;
grant execute on function public.can_owner_remove_science_lab_account_object(text, text, text) to authenticated;
revoke all on function public.prepare_science_lab_account_delete(uuid) from public, anon, authenticated;
grant execute on function public.prepare_science_lab_account_delete(uuid) to authenticated;
revoke all on function public.finalize_science_lab_account_delete(uuid) from public, anon, authenticated;
grant execute on function public.finalize_science_lab_account_delete(uuid) to authenticated;

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
  using (public.is_science_lab_admin());

drop policy if exists "Admins can update science lab reservation status" on public.science_lab_reservations;
create policy "Admins can update science lab reservation status"
  on public.science_lab_reservations
  for update
  using (public.is_science_lab_admin())
  with check (public.is_science_lab_admin());

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
  with check (public.is_science_lab_admin());

drop policy if exists "Authenticated users can delete science lab notices" on public.science_lab_notices;
drop policy if exists "Admins can delete science lab notices" on public.science_lab_notices;
create policy "Admins can delete science lab notices"
  on public.science_lab_notices
  for delete
  using (public.is_science_lab_admin());

drop policy if exists "Anyone can read science lab reservation blocks" on public.science_lab_reservation_blocks;
create policy "Anyone can read science lab reservation blocks"
  on public.science_lab_reservation_blocks
  for select
  using (true);

drop policy if exists "Admins can create science lab reservation blocks" on public.science_lab_reservation_blocks;
create policy "Admins can create science lab reservation blocks"
  on public.science_lab_reservation_blocks
  for insert
  with check (public.is_science_lab_admin());

drop policy if exists "Admins can delete science lab reservation blocks" on public.science_lab_reservation_blocks;
create policy "Admins can delete science lab reservation blocks"
  on public.science_lab_reservation_blocks
  for delete
  using (public.is_science_lab_admin());

drop policy if exists "Anyone can read science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Anyone can read science lab inventory edits"
  on public.science_lab_inventory_edits
  for select
  using (true);

drop policy if exists "Admins can create science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Admins can create science lab inventory edits"
  on public.science_lab_inventory_edits
  for insert
  with check (public.is_science_lab_admin());

drop policy if exists "Admins can update science lab inventory edits" on public.science_lab_inventory_edits;
create policy "Admins can update science lab inventory edits"
  on public.science_lab_inventory_edits
  for update
  using (public.is_science_lab_admin())
  with check (public.is_science_lab_admin());

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
  using (public.is_science_lab_admin());

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

drop policy if exists "Admins can remove attached question images" on storage.objects;
drop policy if exists "Admins can inspect attached question images" on storage.objects;
create policy "Admins can inspect attached question images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'science-lab-question-images'
    and (select public.can_admin_remove_science_lab_question_image(name))
  );

create policy "Admins can remove attached question images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'science-lab-question-images'
    and (select public.can_admin_remove_science_lab_question_image(name))
  );

drop policy if exists "Owner can remove managed account images" on storage.objects;
drop policy if exists "Owner can inspect managed account images" on storage.objects;
drop policy if exists "Owner can remove managed account objects" on storage.objects;
drop policy if exists "Owner can inspect managed account objects" on storage.objects;
create policy "Owner can inspect managed account objects"
  on storage.objects
  for select
  to authenticated
  using (
    (select public.can_owner_remove_science_lab_account_object(
      bucket_id,
      name,
      owner_id
    ))
  );

create policy "Owner can remove managed account objects"
  on storage.objects
  for delete
  to authenticated
  using (
    (select public.can_owner_remove_science_lab_account_object(
      bucket_id,
      name,
      owner_id
    ))
  );

drop function if exists public.can_owner_remove_science_lab_account_image(text, text);

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
