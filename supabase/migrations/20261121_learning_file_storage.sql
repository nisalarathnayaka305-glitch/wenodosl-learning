-- WenodoSL private learning-file storage
-- Run this once in Supabase SQL Editor after deploying this branch.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('learning-files','learning-files',false,26214400,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "learning files read published lessons" on storage.objects;
create policy "learning files read published lessons" on storage.objects
for select to authenticated
using (
  bucket_id='learning-files'
  and exists (
    select 1 from public.lessons l
    where l.resource_url='storage://'||name
      and (
        (l.is_published and exists(select 1 from public.courses c where c.id=l.course_id and c.is_published))
        or public.is_lms_admin()
      )
  )
);

drop policy if exists "learning files insert admins" on storage.objects;
create policy "learning files insert admins" on storage.objects
for insert to authenticated
with check (bucket_id='learning-files' and public.is_lms_admin());

drop policy if exists "learning files update admins" on storage.objects;
create policy "learning files update admins" on storage.objects
for update to authenticated
using (bucket_id='learning-files' and public.is_lms_admin())
with check (bucket_id='learning-files' and public.is_lms_admin());

drop policy if exists "learning files delete admins" on storage.objects;
create policy "learning files delete admins" on storage.objects
for delete to authenticated
using (bucket_id='learning-files' and public.is_lms_admin());
