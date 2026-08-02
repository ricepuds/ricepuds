begin;

alter table public.science_lab_questions
  add column if not exists guest_student_id text,
  add column if not exists guest_name text,
  alter column author_id drop not null;

alter table public.science_lab_answers
  add column if not exists guest_student_id text,
  add column if not exists guest_name text,
  alter column author_id drop not null;

alter table public.science_lab_questions
  drop constraint if exists science_lab_questions_author_identity_check;
alter table public.science_lab_questions
  add constraint science_lab_questions_author_identity_check
  check (
    (
      author_id is not null
      and guest_student_id is null
      and guest_name is null
    )
    or (
      author_id is null
      and guest_student_id ~ '^[0-9]{4,10}$'
      and char_length(btrim(guest_name)) between 1 and 40
      and not is_anonymous
      and cardinality(image_paths) = 0
    )
  );

alter table public.science_lab_answers
  drop constraint if exists science_lab_answers_author_identity_check;
alter table public.science_lab_answers
  add constraint science_lab_answers_author_identity_check
  check (
    (
      author_id is not null
      and guest_student_id is null
      and guest_name is null
    )
    or (
      author_id is null
      and guest_student_id ~ '^[0-9]{4,10}$'
      and char_length(btrim(guest_name)) between 1 and 40
      and not is_anonymous
    )
  );

create index if not exists science_lab_questions_guest_rate_idx
  on public.science_lab_questions (guest_student_id, created_at desc)
  where author_id is null;
create index if not exists science_lab_answers_guest_rate_idx
  on public.science_lab_answers (guest_student_id, created_at desc)
  where author_id is null;

create or replace function public.set_science_lab_question_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  profile_name text;
  cleaned_guest_student_id text;
  cleaned_guest_name text;
begin
  if requester_id is null then
    cleaned_guest_student_id := btrim(coalesce(new.guest_student_id, ''));
    cleaned_guest_name := regexp_replace(
      btrim(coalesce(new.guest_name, '')),
      '\s+',
      ' ',
      'g'
    );
    if cleaned_guest_student_id !~ '^[0-9]{4,10}$' then
      raise exception using errcode = '22023', message = '학번은 숫자 4~10자리로 입력해 주세요.';
    end if;
    if char_length(cleaned_guest_name) not between 1 and 40 then
      raise exception using errcode = '22023', message = '이름은 1자 이상 40자 이하로 입력해 주세요.';
    end if;
    if cardinality(coalesce(new.image_paths, '{}'::text[])) <> 0 then
      raise exception using errcode = '42501', message = '사진 첨부는 로그인한 사용자만 이용할 수 있습니다.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'science-lab-guest-question:' || cleaned_guest_student_id,
        0
      )
    );
    if (
      select count(*)
        from public.science_lab_questions as question
       where question.author_id is null
         and question.guest_student_id = cleaned_guest_student_id
         and question.created_at > now() - interval '1 hour'
    ) >= 5 then
      raise exception using errcode = '54000', message = '비회원 질문은 시간당 5개까지 등록할 수 있습니다.';
    end if;

    new.author_id := null;
    new.author_name := cleaned_guest_name;
    new.guest_student_id := cleaned_guest_student_id;
    new.guest_name := cleaned_guest_name;
    new.is_anonymous := false;
    new.image_paths := '{}'::text[];
    return new;
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
  new.guest_student_id := null;
  new.guest_name := null;
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
  cleaned_guest_student_id text;
  cleaned_guest_name text;
begin
  if requester_id is null then
    cleaned_guest_student_id := btrim(coalesce(new.guest_student_id, ''));
    cleaned_guest_name := regexp_replace(
      btrim(coalesce(new.guest_name, '')),
      '\s+',
      ' ',
      'g'
    );
    if cleaned_guest_student_id !~ '^[0-9]{4,10}$' then
      raise exception using errcode = '22023', message = '학번은 숫자 4~10자리로 입력해 주세요.';
    end if;
    if char_length(cleaned_guest_name) not between 1 and 40 then
      raise exception using errcode = '22023', message = '이름은 1자 이상 40자 이하로 입력해 주세요.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'science-lab-guest-answer:' || cleaned_guest_student_id,
        0
      )
    );
    if (
      select count(*)
        from public.science_lab_answers as answer
       where answer.author_id is null
         and answer.guest_student_id = cleaned_guest_student_id
         and answer.created_at > now() - interval '1 hour'
    ) >= 10 then
      raise exception using errcode = '54000', message = '비회원 답변은 시간당 10개까지 등록할 수 있습니다.';
    end if;

    new.author_id := null;
    new.author_name := cleaned_guest_name;
    new.guest_student_id := cleaned_guest_student_id;
    new.guest_name := cleaned_guest_name;
    new.is_anonymous := false;
    return new;
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
  new.guest_student_id := null;
  new.guest_name := null;
  return new;
end;
$$;

drop function if exists public.get_science_lab_question_authors();
create function public.get_science_lab_question_authors()
returns table (
  question_id uuid,
  author_id uuid,
  author_name text,
  author_email text,
  author_student_id text
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
    coalesce(question.guest_name, profile.display_name, question.author_name, '사용자'),
    coalesce(users.email, '')::text,
    coalesce(question.guest_student_id, '')::text
  from public.science_lab_questions as question
  left join public.science_lab_profiles as profile
    on profile.user_id = question.author_id
  left join auth.users as users
    on users.id = question.author_id
  order by question.created_at desc;
end;
$$;

drop function if exists public.get_science_lab_answer_authors();
create function public.get_science_lab_answer_authors()
returns table (
  answer_id uuid,
  author_id uuid,
  author_name text,
  author_email text,
  author_student_id text
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
    coalesce(answer.guest_name, profile.display_name, answer.author_name, '사용자'),
    coalesce(users.email, '')::text,
    coalesce(answer.guest_student_id, '')::text
  from public.science_lab_answers as answer
  left join public.science_lab_profiles as profile
    on profile.user_id = answer.author_id
  left join auth.users as users
    on users.id = answer.author_id
  where answer.is_anonymous or answer.author_id is null
  order by answer.created_at asc;
end;
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

  if question_author_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(question_author_id::text, 0)
    );
    if public.is_science_lab_account_deletion_pending(question_author_id) then
      raise exception using
        errcode = '55000',
        message = '계정 삭제가 진행 중이라 질문 삭제를 새로 준비할 수 없습니다.';
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('science-lab-question-delete:' || p_question_id::text, 0)
  );

  select question.image_paths
    into question_image_paths
    from public.science_lab_questions as question
   where question.id = p_question_id
     and question.author_id is not distinct from question_author_id
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

create or replace function public.finalize_science_lab_question_delete(
  p_delete_ticket_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_requester_id uuid := auth.uid();
  target_question_id uuid;
  question_author_id uuid;
  question_image_paths text[];
begin
  if current_requester_id is null or not public.is_science_lab_admin() then
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
     and ticket.requester_id = current_requester_id
     and ticket.expires_at > now();
  if not found then
    raise exception using errcode = '42501', message = '질문 삭제 준비 정보가 없거나 만료되었습니다.';
  end if;

  if question_author_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(question_author_id::text, 0)
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('science-lab-question-delete:' || target_question_id::text, 0)
  );

  select ticket.object_paths
    into question_image_paths
    from public.science_lab_question_delete_tickets as ticket
    join public.science_lab_questions as question
      on question.id = ticket.question_id
     and question.image_paths = ticket.object_paths
     and question.author_id is not distinct from question_author_id
   where ticket.ticket_id = p_delete_ticket_id
     and ticket.question_id = target_question_id
     and ticket.requester_id = current_requester_id
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

revoke insert on public.science_lab_questions, public.science_lab_answers from anon;
grant insert (content, guest_student_id, guest_name)
  on public.science_lab_questions to anon;
grant insert (question_id, content, guest_student_id, guest_name)
  on public.science_lab_answers to anon;

drop policy if exists "Guests can create identified questions" on public.science_lab_questions;
create policy "Guests can create identified questions"
  on public.science_lab_questions
  for insert
  to anon
  with check (
    author_id is null
    and guest_student_id ~ '^[0-9]{4,10}$'
    and char_length(btrim(guest_name)) between 1 and 40
    and not is_anonymous
    and cardinality(image_paths) = 0
  );

drop policy if exists "Guests can create identified answers" on public.science_lab_answers;
create policy "Guests can create identified answers"
  on public.science_lab_answers
  for insert
  to anon
  with check (
    author_id is null
    and guest_student_id ~ '^[0-9]{4,10}$'
    and char_length(btrim(guest_name)) between 1 and 40
    and not is_anonymous
  );

revoke all on function public.set_science_lab_question_author() from public, anon, authenticated;
revoke all on function public.set_science_lab_answer_author() from public, anon, authenticated;
revoke all on function public.get_science_lab_question_authors() from public, anon, authenticated;
grant execute on function public.get_science_lab_question_authors() to authenticated;
revoke all on function public.get_science_lab_answer_authors() from public, anon, authenticated;
grant execute on function public.get_science_lab_answer_authors() to authenticated;
revoke all on function public.prepare_science_lab_question_delete(uuid) from public, anon, authenticated;
grant execute on function public.prepare_science_lab_question_delete(uuid) to authenticated;
revoke all on function public.finalize_science_lab_question_delete(uuid) from public, anon, authenticated;
grant execute on function public.finalize_science_lab_question_delete(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
