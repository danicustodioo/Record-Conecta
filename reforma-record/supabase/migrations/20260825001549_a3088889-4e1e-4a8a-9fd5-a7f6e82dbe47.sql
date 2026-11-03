-- 1. Catálogo de documentos
CREATE TABLE IF NOT EXISTS public.tipos_documento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  descricao text NOT NULL,
  por_que_precisamos text NOT NULL,
  periodo_minimo text,
  obrigatorio_sempre boolean NOT NULL DEFAULT false,
  condicao text,
  extraivel boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tipos_documento TO authenticated;
GRANT ALL ON public.tipos_documento TO service_role;
ALTER TABLE public.tipos_documento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tipos_documento_select" ON public.tipos_documento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_documento_admin_write" ON public.tipos_documento
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 2. Documentos por cliente
CREATE TABLE IF NOT EXISTS public.documentos_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  codigo_documento text NOT NULL REFERENCES public.tipos_documento(codigo),
  arquivo_path text,
  nome_arquivo text,
  status text NOT NULL DEFAULT 'pendente',
  resumo_extracao jsonb,
  extraido_em timestamptz,
  conferido_por uuid REFERENCES auth.users(id),
  conferido_em timestamptz,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docs_cliente ON public.documentos_cliente(cliente_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos_cliente TO authenticated;
GRANT ALL ON public.documentos_cliente TO service_role;
ALTER TABLE public.documentos_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documentos_cliente_admin_all" ON public.documentos_cliente
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "documentos_cliente_owner_all" ON public.documentos_cliente
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = documentos_cliente.cliente_id AND c.responsavel_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = documentos_cliente.cliente_id AND c.responsavel_id = auth.uid()));

CREATE TRIGGER trg_documentos_cliente_touch BEFORE UPDATE ON public.documentos_cliente
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Campos de cadastro
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS cnae_principal text,
  ADD COLUMN IF NOT EXISTS cnaes_secundarios text[],
  ADD COLUMN IF NOT EXISTS natureza_juridica text,
  ADD COLUMN IF NOT EXISTS porte text,
  ADD COLUMN IF NOT EXISTS opcao_simples boolean,
  ADD COLUMN IF NOT EXISTS situacao_cadastral text,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS aliquota_iss_municipal numeric(6,4),
  ADD COLUMN IF NOT EXISTS perfil_clientes text,
  ADD COLUMN IF NOT EXISTS tem_patrimonio_afetacao boolean,
  ADD COLUMN IF NOT EXISTS obras_afetadas text,
  ADD COLUMN IF NOT EXISTS tem_contrato_anterior_16012025 boolean;

-- 4. Segregação de receita: conferência e sugestão
ALTER TABLE public.receitas_cliente
  ADD COLUMN IF NOT EXISTS descricao_operacao text,
  ADD COLUMN IF NOT EXISTS cfop text,
  ADD COLUMN IF NOT EXISTS cst text,
  ADD COLUMN IF NOT EXISTS imposto_destacado text,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS requer_atencao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conferido_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS conferido_em timestamptz;

-- 5. Seed do catálogo
INSERT INTO public.tipos_documento
(codigo, nome, descricao, por_que_precisamos, periodo_minimo, obrigatorio_sempre, condicao, extraivel, ordem) VALUES
('cnpj','CNPJ do cliente','Número do CNPJ — consulta automática na Receita Federal','Define CNAE, natureza jurídica, porte e opção pelo Simples. É o que classifica o enquadramento setorial do cliente na LC 214/2025.',NULL,true,NULL,true,1),
('dre','DRE','Demonstração do Resultado do Exercício exportada do Domínio','Base de todos os quatro cenários: receita bruta, custos, despesas, resultado.','6 meses',true,NULL,true,2),
('balanco','Balanço Patrimonial','Balanço na data mais recente','Imobilizado e depreciação acumulada, usados no Lucro Real.','data mais recente',true,NULL,true,3),
('folha','Folha de pagamento','Resumo mensal da folha','Proventos, FGTS, INSS, RAT e FAP — calculam o CPP em todos os cenários.','6 meses',true,NULL,true,4),
('entradas','Acompanhamento de Entradas','Relatório de compras por fornecedor','Identifica fornecedores e CNPJs para apurar o crédito de CBS no Lucro Real e no Simples Híbrido.','3 meses',true,NULL,true,5),
('saidas','Livro de saídas / notas emitidas','Registro de saídas com item, CFOP e CST','Separa a receita por tipo de operação. É o que define qual alíquota setorial da LC 214/2025 se aplica a cada parte do faturamento.','3 meses',true,NULL,true,6),
('contrato_social','Contrato social e alterações','Contrato social consolidado','Verifica se os sócios têm habilitação profissional relacionada ao objeto social — requisito do art. 127, §1º, II para a redução de 30%.','vigente',false,'profissao_regulamentada',true,7),
('pgdas','PGDAS-D / extrato do Simples','Declarações dos últimos 12 meses','Confirma o RBT12 e a alíquota efetiva real do DAS, em vez de estimar pela DRE.','12 meses',false,'regime_simples',true,8),
('faturamento_tomador','Faturamento por tomador','Relação de clientes com valor faturado','Define o perfil B2B ou B2C. Determina se o Simples Híbrido faz sentido e o impacto da vedação de crédito ao adquirente.','6 meses',false,NULL,true,9),
('sped','SPED Fiscal / EFD-Contribuições','Arquivos SPED, quando houver','Fonte mais confiável de item, CFOP, CST e crédito. Substitui entradas e saídas onde existir.','3 meses',false,'regime_normal',true,10),
('matricula_afetacao','Matrícula com termo de afetação','Matrícula do imóvel com averbação de afetação','O patrimônio de afetação com RET tira aquela receita da comparação LP × LR — passa a 4% sobre receita recebida, sem crédito (arts. 485 e 486).',NULL,false,'construcao_incorporacao',false,11),
('contratos_longo_prazo','Contratos firmados até 16/01/2025','Contratos de obra ou locação de longo prazo','Contratos anteriores à publicação da LC 214/2025 têm regra de transição própria (arts. 487 a 490).',NULL,false,'construcao_locacao',false,12),
('lei_iss','Alíquota de ISS do município','Lei municipal ou nota fiscal com ISS destacado','O ISS permanece vigente em 2027 e só começa a ser extinto em 2029. A alíquota efetiva varia por município e por atividade.',NULL,true,NULL,false,13)
ON CONFLICT (codigo) DO NOTHING;