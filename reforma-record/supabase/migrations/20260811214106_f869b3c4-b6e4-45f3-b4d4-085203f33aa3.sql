-- 1) Ownership scope for fornecedores_entradas
DROP POLICY IF EXISTS "Admin/analista podem ver fornecedores" ON public.fornecedores_entradas;
DROP POLICY IF EXISTS "Admin/analista podem inserir fornecedores" ON public.fornecedores_entradas;
DROP POLICY IF EXISTS "Admin/analista podem atualizar fornecedores" ON public.fornecedores_entradas;
DROP POLICY IF EXISTS "Admin/analista podem excluir fornecedores" ON public.fornecedores_entradas;

CREATE POLICY "fornecedores_admin_all" ON public.fornecedores_entradas
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "fornecedores_owner_select" ON public.fornecedores_entradas
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = fornecedores_entradas.cliente_id AND c.responsavel_id = auth.uid()));

CREATE POLICY "fornecedores_owner_insert" ON public.fornecedores_entradas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = fornecedores_entradas.cliente_id AND c.responsavel_id = auth.uid()));

CREATE POLICY "fornecedores_owner_update" ON public.fornecedores_entradas
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = fornecedores_entradas.cliente_id AND c.responsavel_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = fornecedores_entradas.cliente_id AND c.responsavel_id = auth.uid()));

CREATE POLICY "fornecedores_owner_delete" ON public.fornecedores_entradas
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = fornecedores_entradas.cliente_id AND c.responsavel_id = auth.uid()));

-- 2) Ownership-checked UPDATE policy on documentos-dominio storage bucket
DROP POLICY IF EXISTS "documentos_dominio_owner_update" ON storage.objects;

CREATE POLICY "documentos_dominio_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos-dominio'
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.documentos d
        JOIN public.analises a ON a.id = d.analise_id
        WHERE d.storage_path = storage.objects.name
          AND a.responsavel_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'documentos-dominio'
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.documentos d
        JOIN public.analises a ON a.id = d.analise_id
        WHERE d.storage_path = storage.objects.name
          AND a.responsavel_id = auth.uid()
      )
    )
  );
