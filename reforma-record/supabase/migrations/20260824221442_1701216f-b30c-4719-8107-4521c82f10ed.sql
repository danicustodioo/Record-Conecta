-- Remove blanket access to every bucket
DROP POLICY IF EXISTS "allow authenticated uploads all buckets" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated select all buckets" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated delete all buckets" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated update all buckets" ON storage.objects;

-- Remove open policies on the pdfs bucket
DROP POLICY IF EXISTS "allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated select" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated delete" ON storage.objects;

-- Ownership-scoped policies: files must live under a folder named after the user's id
CREATE POLICY "pdfs_owner_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'pdfs'
  AND (public.is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
);

CREATE POLICY "pdfs_owner_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'pdfs'
  AND (public.is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
);

CREATE POLICY "pdfs_owner_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'pdfs'
  AND (public.is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
)
WITH CHECK (
  bucket_id = 'pdfs'
  AND (public.is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
);

CREATE POLICY "pdfs_owner_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'pdfs'
  AND (public.is_admin(auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)
);