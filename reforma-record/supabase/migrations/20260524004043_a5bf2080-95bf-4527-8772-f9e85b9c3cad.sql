-- 1) Restrict usuarios SELECT: users see only themselves; admins see all
DROP POLICY IF EXISTS usuarios_select ON public.usuarios;
CREATE POLICY usuarios_select_self_or_admin
ON public.usuarios FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- 2) Scope storage policies on 'documentos-dominio' to analysis ownership.
-- Path convention is `${analise_id}/...` so the first folder name is the analise id.
DROP POLICY IF EXISTS documentos_analista_select ON storage.objects;
DROP POLICY IF EXISTS documentos_analista_insert ON storage.objects;
DROP POLICY IF EXISTS documentos_analista_delete ON storage.objects;

CREATE POLICY documentos_owner_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documentos-dominio'
  AND EXISTS (
    SELECT 1 FROM public.analises a
    WHERE a.id::text = (storage.foldername(name))[1]
      AND a.responsavel_id = auth.uid()
  )
);

CREATE POLICY documentos_owner_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos-dominio'
  AND EXISTS (
    SELECT 1 FROM public.analises a
    WHERE a.id::text = (storage.foldername(name))[1]
      AND a.responsavel_id = auth.uid()
  )
);

CREATE POLICY documentos_owner_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos-dominio'
  AND EXISTS (
    SELECT 1 FROM public.analises a
    WHERE a.id::text = (storage.foldername(name))[1]
      AND a.responsavel_id = auth.uid()
  )
);

-- 3) Explicit INSERT policy for link_acessos: only when the target analysis
-- has a non-expired share link. Allows public (shared-link visitors) to log access.
CREATE POLICY link_acessos_insert_via_valid_token
ON public.link_acessos FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.analises a
    WHERE a.id = link_acessos.analise_id
      AND a.link_token IS NOT NULL
      AND (a.link_expira_em IS NULL OR a.link_expira_em > now())
  )
);