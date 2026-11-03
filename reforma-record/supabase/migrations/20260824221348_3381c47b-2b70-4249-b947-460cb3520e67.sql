DROP POLICY IF EXISTS "allow authenticated uploads all buckets" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated select all buckets" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated delete all buckets" ON storage.objects;
DROP POLICY IF EXISTS "allow authenticated update all buckets" ON storage.objects;

CREATE POLICY "allow authenticated uploads all buckets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "allow authenticated select all buckets"
ON storage.objects FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "allow authenticated delete all buckets"
ON storage.objects FOR DELETE
TO authenticated
USING (true);

CREATE POLICY "allow authenticated update all buckets"
ON storage.objects FOR UPDATE
TO authenticated
USING (true);