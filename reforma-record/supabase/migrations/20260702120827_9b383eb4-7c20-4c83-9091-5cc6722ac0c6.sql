-- Tabela de fornecedores extraídos por cliente
CREATE TABLE IF NOT EXISTS public.fornecedores_entradas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo_inicio DATE,
  periodo_fim DATE,
  nome VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18),
  cpf VARCHAR(14),
  uf CHAR(2),
  tipo_imposto VARCHAR(20),
  valor_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Dados da Receita Federal
  regime VARCHAR(20), -- NORMAL, SIMPLES, MEI, IRREGULAR, PF, PENDENTE
  situacao_receita VARCHAR(30),
  nome_receita TEXT,
  data_consulta_regime TIMESTAMPTZ,
  -- Cálculo de crédito CBS
  credito_cbs NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Controle
  cnpj_inserido_manualmente BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedores_cliente ON public.fornecedores_entradas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_fornecedores_regime ON public.fornecedores_entradas(regime);
CREATE INDEX IF NOT EXISTS idx_fornecedores_periodo ON public.fornecedores_entradas(cliente_id, periodo_inicio, periodo_fim);

-- GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores_entradas TO authenticated;
GRANT ALL ON public.fornecedores_entradas TO service_role;

-- RLS
ALTER TABLE public.fornecedores_entradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver fornecedores"
  ON public.fornecedores_entradas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados podem inserir fornecedores"
  ON public.fornecedores_entradas FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar fornecedores"
  ON public.fornecedores_entradas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Autenticados podem excluir fornecedores"
  ON public.fornecedores_entradas FOR DELETE TO authenticated USING (true);

-- Trigger updated_at
CREATE TRIGGER trg_fornecedores_updated_at
  BEFORE UPDATE ON public.fornecedores_entradas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Parâmetros CBS editáveis
ALTER TABLE public.parametros_reforma
  ADD COLUMN IF NOT EXISTS aliquota_cbs NUMERIC(5,4) NOT NULL DEFAULT 0.0880;
ALTER TABLE public.parametros_reforma
  ADD COLUMN IF NOT EXISTS credito_simples_estimado NUMERIC(5,4) NOT NULL DEFAULT 0.0320;