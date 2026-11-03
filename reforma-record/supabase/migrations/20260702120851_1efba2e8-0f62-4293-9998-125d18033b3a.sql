DROP POLICY IF EXISTS "Autenticados podem ver fornecedores" ON public.fornecedores_entradas;
DROP POLICY IF EXISTS "Autenticados podem inserir fornecedores" ON public.fornecedores_entradas;
DROP POLICY IF EXISTS "Autenticados podem atualizar fornecedores" ON public.fornecedores_entradas;
DROP POLICY IF EXISTS "Autenticados podem excluir fornecedores" ON public.fornecedores_entradas;

CREATE POLICY "Admin/analista podem ver fornecedores"
  ON public.fornecedores_entradas FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'));

CREATE POLICY "Admin/analista podem inserir fornecedores"
  ON public.fornecedores_entradas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'));

CREATE POLICY "Admin/analista podem atualizar fornecedores"
  ON public.fornecedores_entradas FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'));

CREATE POLICY "Admin/analista podem excluir fornecedores"
  ON public.fornecedores_entradas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'));