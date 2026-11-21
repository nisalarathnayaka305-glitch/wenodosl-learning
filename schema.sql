-- WenodoSL Learning Hub schema (Supabase / PostgreSQL)
-- Run once in Supabase SQL Editor. Keep RLS enabled.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text unique,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student','lms_admin','super_admin')),
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  level text not null default 'All levels' check (level in ('Beginner','Intermediate','Advanced','All levels')),
  deadline date,
  is_published boolean not null default false,
  legacy_folder text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  main_folder text not null default 'Lessons',
  subfolder text not null default '',
  title text not null,
  description text not null default '',
  content_type text not null default 'link' check (content_type in ('video','pdf','document','slides','link','file')),
  resource_url text not null,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  position integer not null default 0,
  is_published boolean not null default true,
  legacy_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed boolean not null default false,
  last_position_seconds integer not null default 0 check (last_position_seconds >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  description text not null default '',
  time_limit_seconds integer not null default 420 check (time_limit_seconds between 30 and 7200),
  questions_per_attempt integer not null default 10 check (questions_per_attempt between 1 and 100),
  question_count integer not null default 0 check (question_count >= 0),
  max_attempts integer not null default 0 check (max_attempts >= 0), -- 0 = unlimited
  is_published boolean not null default false,
  external_url text,
  legacy_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Correct answers are in this table. Learners cannot select it directly.
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question text not null,
  question_type text not null default 'mcq' check (question_type in ('mcq','written')),
  options jsonb not null default '[]'::jsonb,
  correct_option text,
  model_answer text,
  explanation text not null default '',
  marking_guide text not null default '',
  marks numeric(8,2) not null default 1 check (marks > 0),
  difficulty text not null default 'Medium' check (difficulty in ('Easy','Medium','Hard')),
  position integer not null default 0,
  is_active boolean not null default true,
  legacy_id text unique,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (question_type <> 'mcq' or correct_option in ('A','B','C','D'))
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_ids uuid[] not null,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  time_taken_seconds integer not null default 0,
  score numeric(10,2) not null default 0,
  max_score numeric(10,2) not null default 0,
  percentage numeric(6,2) not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  pending_review integer not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress','submitted','expired'))
);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  answer text not null default '',
  is_correct boolean,
  marks_awarded numeric(8,2) not null default 0,
  feedback text not null default '',
  pending_review boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  unique (attempt_id, question_id)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  is_published boolean not null default false,
  publish_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.discussions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  certificate_code text not null unique default encode(gen_random_bytes(8),'hex'),
  issued_at timestamptz not null default now(),
  unique(user_id,course_id)
);

create index if not exists lessons_course_idx on public.lessons(course_id, position);
create index if not exists quizzes_course_idx on public.quizzes(course_id);
create index if not exists questions_quiz_idx on public.quiz_questions(quiz_id, position) where is_active;
create index if not exists attempts_user_idx on public.quiz_attempts(user_id, started_at desc);
create index if not exists attempts_quiz_user_idx on public.quiz_attempts(quiz_id,user_id,status);
create index if not exists announcements_live_idx on public.announcements(is_published,publish_at desc);
create index if not exists discussions_course_idx on public.discussions(course_id,created_at desc);

create or replace function public.refresh_quiz_question_count()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if tg_op='DELETE' then
    update public.quizzes set question_count=(select count(*) from public.quiz_questions where quiz_id=old.quiz_id and is_active=true) where id=old.quiz_id;
    return old;
  elsif tg_op='UPDATE' then
    update public.quizzes set question_count=(select count(*) from public.quiz_questions where quiz_id=new.quiz_id and is_active=true) where id=new.quiz_id;
    if old.quiz_id is distinct from new.quiz_id then update public.quizzes set question_count=(select count(*) from public.quiz_questions where quiz_id=old.quiz_id and is_active=true) where id=old.quiz_id; end if;
    return new;
  else
    update public.quizzes set question_count=(select count(*) from public.quiz_questions where quiz_id=new.quiz_id and is_active=true) where id=new.quiz_id;
    return new;
  end if;
end;
$$;
drop trigger if exists quiz_question_count_changed on public.quiz_questions;
create trigger quiz_question_count_changed after insert or update or delete on public.quiz_questions for each row execute function public.refresh_quiz_question_count();


create or replace function public.is_lms_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('lms_admin','super_admin')); $$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='super_admin'); $$;

revoke all on function public.is_lms_admin() from public, anon;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_lms_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.prevent_profile_role_escalation()
returns trigger language plpgsql set search_path=public
as $$
begin
  if (new.role is distinct from old.role or new.email is distinct from old.email) and current_user not in ('postgres','supabase_admin') and coalesce(auth.role(),'') not in ('service_role','supabase_admin') then
    raise exception 'Only a trusted administrator can change account roles or email addresses.';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation before update on public.profiles for each row execute function public.prevent_profile_role_escalation();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,email,username,full_name,role)
  values(new.id,coalesce(new.email,''),nullif(new.raw_user_meta_data->>'username',''),coalesce(new.raw_user_meta_data->>'full_name',''),'student')
  on conflict(id) do update set email=excluded.email, full_name=case when public.profiles.full_name='' then excluded.full_name else public.profiles.full_name end;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

-- Authenticated users receive table privileges; RLS below controls every row.
grant usage on schema public to authenticated;
grant select,insert,update,delete on table public.profiles,public.courses,public.lessons,public.lesson_progress,public.bookmarks,public.quizzes,public.quiz_questions,public.quiz_attempts,public.quiz_answers,public.announcements,public.discussions,public.discussion_replies,public.notifications,public.certificates to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.bookmarks enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.announcements enable row level security;
alter table public.discussions enable row level security;
alter table public.discussion_replies enable row level security;
alter table public.notifications enable row level security;
alter table public.certificates enable row level security;

-- Remove previous policies on re-run for predictable setup.
do $$ declare p record; begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename = any(array['profiles','courses','lessons','lesson_progress','bookmarks','quizzes','quiz_questions','quiz_attempts','quiz_answers','announcements','discussions','discussion_replies','notifications','certificates']) loop
    execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

create policy profiles_select_self_or_admin on public.profiles for select to authenticated using (id=auth.uid() or public.is_lms_admin());
create policy profiles_update_self on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy courses_read_published_or_admin on public.courses for select to authenticated using (is_published or public.is_lms_admin());
create policy courses_insert_admin on public.courses for insert to authenticated with check (public.is_lms_admin());
create policy courses_update_admin on public.courses for update to authenticated using (public.is_lms_admin()) with check (public.is_lms_admin());
create policy courses_delete_admin on public.courses for delete to authenticated using (public.is_lms_admin());

create policy lessons_read_published_or_admin on public.lessons for select to authenticated using (is_published and exists(select 1 from public.courses c where c.id=course_id and c.is_published) or public.is_lms_admin());
create policy lessons_insert_admin on public.lessons for insert to authenticated with check (public.is_lms_admin());
create policy lessons_update_admin on public.lessons for update to authenticated using (public.is_lms_admin()) with check (public.is_lms_admin());
create policy lessons_delete_admin on public.lessons for delete to authenticated using (public.is_lms_admin());

create policy progress_read_self_or_admin on public.lesson_progress for select to authenticated using (user_id=auth.uid() or public.is_lms_admin());
create policy progress_insert_self on public.lesson_progress for insert to authenticated with check (user_id=auth.uid());
create policy progress_update_self on public.lesson_progress for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy progress_delete_self on public.lesson_progress for delete to authenticated using (user_id=auth.uid());

create policy bookmarks_read_self on public.bookmarks for select to authenticated using (user_id=auth.uid());
create policy bookmarks_insert_self on public.bookmarks for insert to authenticated with check (user_id=auth.uid());
create policy bookmarks_delete_self on public.bookmarks for delete to authenticated using (user_id=auth.uid());

create policy quizzes_read_published_or_admin on public.quizzes for select to authenticated using (is_published or public.is_lms_admin());
create policy quizzes_insert_admin on public.quizzes for insert to authenticated with check (public.is_lms_admin());
create policy quizzes_update_admin on public.quizzes for update to authenticated using (public.is_lms_admin()) with check (public.is_lms_admin());
create policy quizzes_delete_admin on public.quizzes for delete to authenticated using (public.is_lms_admin());

-- Learners must not query quiz_questions directly because correct_option is stored there.
create policy questions_admin_only on public.quiz_questions for all to authenticated using (public.is_lms_admin()) with check (public.is_lms_admin());

create policy attempts_read_self_or_admin on public.quiz_attempts for select to authenticated using (user_id=auth.uid() or public.is_lms_admin());
create policy answers_read_self_or_admin on public.quiz_answers for select to authenticated using (exists(select 1 from public.quiz_attempts a where a.id=attempt_id and (a.user_id=auth.uid() or public.is_lms_admin())));
create policy announcements_read_live on public.announcements for select to authenticated using ((is_published and publish_at<=now()) or public.is_lms_admin());
create policy announcements_insert_admin on public.announcements for insert to authenticated with check (public.is_lms_admin());
create policy announcements_update_admin on public.announcements for update to authenticated using (public.is_lms_admin()) with check (public.is_lms_admin());
create policy announcements_delete_admin on public.announcements for delete to authenticated using (public.is_lms_admin());

create policy discussions_read_auth on public.discussions for select to authenticated using (exists(select 1 from public.courses c where c.id=course_id and c.is_published) or public.is_lms_admin());
create policy discussions_insert_self on public.discussions for insert to authenticated with check (user_id=auth.uid());
create policy discussions_update_owner_or_admin on public.discussions for update to authenticated using (user_id=auth.uid() or public.is_lms_admin()) with check (user_id=auth.uid() or public.is_lms_admin());
create policy discussions_delete_owner_or_admin on public.discussions for delete to authenticated using (user_id=auth.uid() or public.is_lms_admin());
create policy replies_read_auth on public.discussion_replies for select to authenticated using (exists(select 1 from public.discussions d where d.id=discussion_id));
create policy replies_insert_self on public.discussion_replies for insert to authenticated with check (user_id=auth.uid());
create policy replies_update_owner_or_admin on public.discussion_replies for update to authenticated using (user_id=auth.uid() or public.is_lms_admin()) with check (user_id=auth.uid() or public.is_lms_admin());
create policy replies_delete_owner_or_admin on public.discussion_replies for delete to authenticated using (user_id=auth.uid() or public.is_lms_admin());

create policy notifications_read_self on public.notifications for select to authenticated using (user_id=auth.uid());
create policy notifications_update_self on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy certificates_read_self_or_admin on public.certificates for select to authenticated using (user_id=auth.uid() or public.is_lms_admin());

-- Secure quiz start: random question selection and safe question payload (no correct answers).
create or replace function public.start_quiz(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_quiz public.quizzes%rowtype; v_ids uuid[]; v_questions jsonb; v_attempt public.quiz_attempts%rowtype; v_count integer;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select q.* into v_quiz from public.quizzes q join public.courses c on c.id=q.course_id where q.id=p_quiz_id and q.is_published=true and c.is_published=true;
  if not found then raise exception 'Quiz not found or not published.'; end if;
  update public.quiz_attempts set status='expired' where quiz_id=p_quiz_id and user_id=auth.uid() and status='in_progress' and deadline_at<now();
  select count(*) into v_count from public.quiz_attempts where quiz_id=p_quiz_id and user_id=auth.uid() and status in ('in_progress','submitted');
  if v_quiz.max_attempts>0 and v_count>=v_quiz.max_attempts then raise exception 'You have reached the maximum number of attempts for this quiz.'; end if;
  select array_agg(x.id order by x.rnd) into v_ids from (select id,random() as rnd from public.quiz_questions where quiz_id=p_quiz_id and is_active order by rnd limit v_quiz.questions_per_attempt) x;
  if coalesce(array_length(v_ids,1),0)=0 then raise exception 'No questions are available in this quiz yet.'; end if;
  insert into public.quiz_attempts(quiz_id,user_id,question_ids,deadline_at)
  values(p_quiz_id,auth.uid(),v_ids,now()+make_interval(secs=>v_quiz.time_limit_seconds)) returning * into v_attempt;
  select jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'question_type',q.question_type,'options',q.options,'marks',q.marks,'difficulty',q.difficulty) order by array_position(v_ids,q.id))
  into v_questions from public.quiz_questions q where q.id=any(v_ids);
  return jsonb_build_object('attempt_id',v_attempt.id,'deadline_at',v_attempt.deadline_at,'quiz_title',v_quiz.title,'questions',coalesce(v_questions,'[]'::jsonb));
end;
$$;

create or replace function public.submit_quiz(p_attempt_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_attempt public.quiz_attempts%rowtype; v_q public.quiz_questions%rowtype; v_question_id uuid; v_answer text; v_score numeric:=0; v_max numeric:=0; v_correct integer:=0; v_wrong integer:=0; v_pending integer:=0; v_elapsed integer:=0; v_is_correct boolean; v_awarded numeric;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into v_attempt from public.quiz_attempts where id=p_attempt_id and user_id=auth.uid() for update;
  if not found then raise exception 'Quiz attempt not found.'; end if;
  if v_attempt.status<>'in_progress' then raise exception 'This quiz attempt has already been submitted.'; end if;
  if now()>v_attempt.deadline_at then update public.quiz_attempts set status='expired' where id=p_attempt_id; raise exception 'Quiz time has expired. Please start a new attempt.'; end if;
  v_elapsed:=greatest(0,floor(extract(epoch from (now()-v_attempt.started_at)))::integer);
  foreach v_question_id in array v_attempt.question_ids loop
    select * into v_q from public.quiz_questions where id=v_question_id;
    if not found then raise exception 'A quiz question is no longer available.'; end if;
    select coalesce(x->>'answer','') into v_answer from jsonb_array_elements(coalesce(p_answers,'[]'::jsonb)) as ans(value) where ans.value->>'id'=v_q.id::text limit 1;
    v_answer:=coalesce(v_answer,''); v_max:=v_max+v_q.marks; v_awarded:=0; v_is_correct:=null;
    if v_q.question_type='written' then v_pending:=v_pending+1;
    else
      v_is_correct:=upper(trim(v_answer))=upper(coalesce(v_q.correct_option,''));
      if v_is_correct then v_awarded:=v_q.marks;v_correct:=v_correct+1;else v_wrong:=v_wrong+1;end if;
      v_score:=v_score+v_awarded;
    end if;
    insert into public.quiz_answers(attempt_id,question_id,answer,is_correct,marks_awarded,feedback,pending_review)
    values(p_attempt_id,v_q.id,left(v_answer,3000),v_is_correct,v_awarded,case when v_q.question_type='written' then 'Awaiting manual review' else v_q.explanation end,v_q.question_type='written');
  end loop;
  update public.quiz_attempts set submitted_at=now(),time_taken_seconds=v_elapsed,score=v_score,max_score=v_max,percentage=case when v_max>0 then round(v_score/v_max*100,2) else 0 end,correct_count=v_correct,wrong_count=v_wrong,pending_review=v_pending,status='submitted' where id=p_attempt_id;
  return jsonb_build_object('score',v_score,'max_score',v_max,'percentage',case when v_max>0 then round(v_score/v_max*100,2) else 0 end,'correct_count',v_correct,'wrong_count',v_wrong,'pending_review',v_pending,'time_taken_seconds',v_elapsed);
end;
$$;

revoke all on function public.start_quiz(uuid) from public, anon;
revoke all on function public.submit_quiz(uuid,jsonb) from public, anon;
grant execute on function public.start_quiz(uuid) to authenticated;
grant execute on function public.submit_quiz(uuid,jsonb) to authenticated;

-- LMS admins can review written answers; learners can only read their own answer rows.
create or replace function public.grade_written_answer(p_answer_id uuid,p_marks numeric,p_feedback text)
returns void language plpgsql security definer set search_path=public
as $$
declare v_answer public.quiz_answers%rowtype; v_attempt public.quiz_attempts%rowtype; v_max numeric;
begin
  if not public.is_lms_admin() then raise exception 'Only LMS administrators can grade written answers.'; end if;
  select * into v_answer from public.quiz_answers where id=p_answer_id and pending_review=true for update;
  if not found then raise exception 'Pending written answer not found.'; end if;
  select * into v_attempt from public.quiz_attempts where id=v_answer.attempt_id for update;
  select marks into v_max from public.quiz_questions where id=v_answer.question_id;
  if p_marks<0 or p_marks>v_max then raise exception 'Marks must be between 0 and %.',v_max; end if;
  update public.quiz_answers set marks_awarded=p_marks,feedback=left(coalesce(p_feedback,''),1000),pending_review=false,reviewed_by=auth.uid(),reviewed_at=now() where id=p_answer_id;
  update public.quiz_attempts set score=score+p_marks,pending_review=greatest(0,pending_review-1),percentage=case when max_score>0 then round((score+p_marks)/max_score*100,2) else 0 end where id=v_attempt.id;
end;
$$;
revoke all on function public.grade_written_answer(uuid,numeric,text) from public, anon;
grant execute on function public.grade_written_answer(uuid,numeric,text) to authenticated;


create or replace function public.issue_course_certificate(p_course_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_total integer; v_done integer; v_unpassed integer; v_cert public.certificates%rowtype;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if not exists(select 1 from public.courses where id=p_course_id and is_published=true) then raise exception 'Course not found or not published.'; end if;
  select count(*) into v_total from public.lessons where course_id=p_course_id and is_published=true;
  select count(*) into v_done from public.lesson_progress lp join public.lessons l on l.id=lp.lesson_id where lp.user_id=auth.uid() and lp.completed=true and l.course_id=p_course_id and l.is_published=true;
  if v_total=0 or v_done<v_total then raise exception 'Complete all published lessons before requesting a certificate.'; end if;
  select count(*) into v_unpassed from public.quizzes q where q.course_id=p_course_id and q.is_published=true and not exists(
    select 1 from public.quiz_attempts a where a.quiz_id=q.id and a.user_id=auth.uid() and a.status='submitted' and a.percentage>=70 and a.pending_review=0
  );
  if v_unpassed>0 then raise exception 'Pass every published quiz with at least 70%% and complete written-answer reviews first.'; end if;
  insert into public.certificates(user_id,course_id) values(auth.uid(),p_course_id)
  on conflict(user_id,course_id) do nothing;
  select * into v_cert from public.certificates where user_id=auth.uid() and course_id=p_course_id;
  return jsonb_build_object('certificate_code',v_cert.certificate_code,'issued_at',v_cert.issued_at);
end;
$$;
revoke all on function public.issue_course_certificate(uuid) from public, anon;
grant execute on function public.issue_course_certificate(uuid) to authenticated;

-- Private file bucket. Only LMS admins can upload; authenticated learners can read signed resources.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('learning-files','learning-files',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp','video/mp4','video/webm','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict(id) do nothing;
drop policy if exists learning_files_read_auth on storage.objects;
drop policy if exists learning_files_insert_admin on storage.objects;
drop policy if exists learning_files_update_admin on storage.objects;
drop policy if exists learning_files_delete_admin on storage.objects;
create policy learning_files_read_auth on storage.objects for select to authenticated using (bucket_id='learning-files' and (public.is_lms_admin() or exists(select 1 from public.lessons l join public.courses c on c.id=l.course_id where l.resource_url='storage://'||storage.objects.name and l.is_published=true and c.is_published=true)));
create policy learning_files_insert_admin on storage.objects for insert to authenticated with check (bucket_id='learning-files' and public.is_lms_admin());
create policy learning_files_update_admin on storage.objects for update to authenticated using (bucket_id='learning-files' and public.is_lms_admin()) with check (bucket_id='learning-files' and public.is_lms_admin());
create policy learning_files_delete_admin on storage.objects for delete to authenticated using (bucket_id='learning-files' and public.is_lms_admin());

-- After the first admin signs up/in, promote that account from the SQL editor:
-- update public.profiles set role='super_admin' where email='your-admin-email@example.com';
