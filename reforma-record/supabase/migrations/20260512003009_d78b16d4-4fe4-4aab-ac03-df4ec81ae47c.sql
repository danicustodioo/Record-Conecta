
-- ============== ENUMS ==============
CREATE TYPE public.app_role AS ENUM ('admin', 'analista');
CREATE TYPE public.regime_tributario AS ENUM ('SIMPLES_I','SIMPLES_II','SIMPLES_III','SIMPLES_IV','SIMPLES_V','LUCRO_PRESUMIDO','LUCRO_REAL');
CREATE TYPE public.analise_status AS ENUM ('RASCUNHO','EM_ANALISE','CONCLUIDO');
CREATE TYPE public.documento_tipo AS ENUM ('DRE','BALANCO','FORNECEDORES','FOLHA','SAIDAS');
CREATE TYPE public.extracao_status AS ENUM ('PENDENTE','PROCESSANDO','CONCLUIDO','ERRO_MANUAL');

-- ============== USUARIOS ==============
CREATE TABLE public.usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- ============== USER ROLES ==============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin') $$;

-- ============== CLIENTES ==============
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT NOT NULL UNIQUE,
  setor TEXT NOT NULL,
  subsetor TEXT,
  regime_atual regime_tributario NOT NULL,
  rbt12 NUMERIC(15,2) NOT NULL DEFAULT 0,
  num_funcionarios INTEGER DEFAULT 0,
  pct_b2b NUMERIC(5,2) DEFAULT 0,
  pct_b2c NUMERIC(5,2) DEFAULT 100,
  email_cliente TEXT,
  observacoes TEXT,
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clientes_responsavel ON public.clientes(responsavel_id);

-- ============== ANALISES ==============
CREATE TABLE public.analises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  status analise_status NOT NULL DEFAULT 'RASCUNHO',
  dados_dre JSONB,
  dados_balanco JSONB,
  dados_fornecedores JSONB,
  dados_folha JSONB,
  dados_saidas JSONB,
  resultados_calculo JSONB,
  recomendacao_regime TEXT,
  recomendacao_texto TEXT,
  link_token UUID UNIQUE DEFAULT gen_random_uuid(),
  link_expira_em TIMESTAMPTZ,
  link_acessos INTEGER NOT NULL DEFAULT 0,
  pdf_url TEXT,
  pptx_url TEXT,
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.analises ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_analises_cliente ON public.analises(cliente_id);
CREATE INDEX idx_analises_responsavel ON public.analises(responsavel_id);
CREATE INDEX idx_analises_token ON public.analises(link_token);

-- ============== DOCUMENTOS ==============
CREATE TABLE public.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analise_id UUID NOT NULL REFERENCES public.analises(id) ON DELETE CASCADE,
  tipo documento_tipo NOT NULL,
  nome_arquivo TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  dados_extraidos JSONB,
  status_extracao extracao_status NOT NULL DEFAULT 'PENDENTE',
  erro_mensagem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_documentos_analise ON public.documentos(analise_id);

-- ============== LINK ACESSOS ==============
CREATE TABLE public.link_acessos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analise_id UUID NOT NULL REFERENCES public.analises(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.link_acessos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_link_acessos_analise ON public.link_acessos(analise_id);

-- ============== CONFIGURACOES ==============
CREATE TABLE public.configuracoes (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- ============== TRIGGERS updated_at ==============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_clientes_touch BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_analises_touch BEFORE UPDATE ON public.analises FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_documentos_touch BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_configuracoes_touch BEFORE UPDATE ON public.configuracoes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== AUTO-CRIAR USUARIO + ROLE ANALISTA NO SIGNUP ==============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuarios (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)), NEW.email);

  -- 1º usuário do sistema vira admin; demais viram analista
  IF (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'analista');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============== RLS POLICIES ==============

-- usuarios: todo autenticado lê, próprio usuário edita seu nome, admin tudo
CREATE POLICY usuarios_select ON public.usuarios FOR SELECT TO authenticated USING (true);
CREATE POLICY usuarios_update_self ON public.usuarios FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY usuarios_admin_all ON public.usuarios FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_roles: usuário vê seus próprios; admin gerencia tudo
CREATE POLICY user_roles_select_self ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY user_roles_admin_write ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- clientes: admin tudo; analista só os seus
CREATE POLICY clientes_admin_all ON public.clientes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY clientes_analista_select ON public.clientes FOR SELECT TO authenticated
  USING (responsavel_id = auth.uid());
CREATE POLICY clientes_analista_insert ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (responsavel_id = auth.uid());
CREATE POLICY clientes_analista_update ON public.clientes FOR UPDATE TO authenticated
  USING (responsavel_id = auth.uid()) WITH CHECK (responsavel_id = auth.uid());
CREATE POLICY clientes_analista_delete ON public.clientes FOR DELETE TO authenticated
  USING (responsavel_id = auth.uid());

-- analises
CREATE POLICY analises_admin_all ON public.analises FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY analises_analista_select ON public.analises FOR SELECT TO authenticated
  USING (responsavel_id = auth.uid());
CREATE POLICY analises_analista_insert ON public.analises FOR INSERT TO authenticated
  WITH CHECK (responsavel_id = auth.uid());
CREATE POLICY analises_analista_update ON public.analises FOR UPDATE TO authenticated
  USING (responsavel_id = auth.uid()) WITH CHECK (responsavel_id = auth.uid());
CREATE POLICY analises_analista_delete ON public.analises FOR DELETE TO authenticated
  USING (responsavel_id = auth.uid());

-- documentos: deriva de analises
CREATE POLICY documentos_admin_all ON public.documentos FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY documentos_analista_select ON public.documentos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.analises a WHERE a.id = analise_id AND a.responsavel_id = auth.uid()));
CREATE POLICY documentos_analista_insert ON public.documentos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.analises a WHERE a.id = analise_id AND a.responsavel_id = auth.uid()));
CREATE POLICY documentos_analista_update ON public.documentos FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.analises a WHERE a.id = analise_id AND a.responsavel_id = auth.uid()));
CREATE POLICY documentos_analista_delete ON public.documentos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.analises a WHERE a.id = analise_id AND a.responsavel_id = auth.uid()));

-- link_acessos: somente admin lê; insert via server function (service role)
CREATE POLICY link_acessos_admin_select ON public.link_acessos FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.analises a WHERE a.id = analise_id AND a.responsavel_id = auth.uid()));

-- configuracoes: todos autenticados leem; somente admin escreve
CREATE POLICY configuracoes_select ON public.configuracoes FOR SELECT TO authenticated USING (true);
CREATE POLICY configuracoes_admin_write ON public.configuracoes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============== STORAGE BUCKET ==============
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos-dominio', 'documentos-dominio', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "documentos_admin_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'documentos-dominio' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'documentos-dominio' AND public.is_admin(auth.uid()));

CREATE POLICY "documentos_analista_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documentos-dominio' AND auth.uid() IS NOT NULL);

CREATE POLICY "documentos_analista_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos-dominio' AND auth.uid() IS NOT NULL);

CREATE POLICY "documentos_analista_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documentos-dominio' AND auth.uid() IS NOT NULL);

-- ============== SEED CONFIGURACOES ==============
INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
('reforma_aliquotas', jsonb_build_object(
  'CBS_RATE', 0.088, 'IBS_RATE', 0.177, 'IVA_DUAL', 0.265,
  'REDUCAO_SAUDE', 0.60, 'REDUCAO_EDUCACAO', 0.60, 'REDUCAO_TRANSPORTE', 0.30,
  'CPP_PATRONAL', 0.20, 'RAT', 0.01,
  'TERCEIROS_HOTELARIA', 0.058, 'TERCEIROS_COMERCIO', 0.055, 'TERCEIROS_INDUSTRIA', 0.062,
  'TERCEIROS_SAUDE', 0.058, 'TERCEIROS_SERVICOS', 0.058
), 'Alíquotas de referência da Reforma Tributária — LC 214/2025'),
('prazo_opcao', jsonb_build_object('data', '2026-09-30T23:59:59-03:00'), 'Prazo final para opção pelo Simples Híbrido')
ON CONFLICT (chave) DO NOTHING;
