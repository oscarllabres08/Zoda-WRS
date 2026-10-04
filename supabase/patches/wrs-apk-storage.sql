-- Optional bucket for small files only.
-- Supabase FREE plan: max 50 MB per upload — our APKs (~93 MB) do NOT fit.
-- Download site uses EAS artifact URLs instead (see download-site/README.md).
-- Run in Supabase Dashboard → SQL Editor only if you upgrade plan or use smaller builds.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wrs-apks',
  'wrs-apks',
  true,
  104857600,
  array['application/vnd.android.package-archive', 'application/octet-stream']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read wrs-apks" on storage.objects;
create policy "public read wrs-apks"
on storage.objects for select
using (bucket_id = 'wrs-apks');
