-- Bloco 15A — Parâmetros 2027 e motor de decisão do Simples Nacional (engine v15)
-- A tabela "parametros_calculo" citada na especificação não existe: os parâmetros
-- ficam em public.parametros_reforma, que já é lida pelo app.

-- ─────────── 1. Parâmetros ───────────
alter table public.parametros_reforma
  add column if not exists aliquota_cbs_referencia numeric(6,4),
  add column if not exists redutor_transicao_cbs numeric(6,4),
  add column if not exists aliquota_ibs_estadual numeric(6,4),
  add column if not exists aliquota_ibs_municipal numeric(6,4),
  add column if not exists status_aliquota text,
  add column if not exists fonte_aliquota text,
  add column if not exists data_referencia date;

-- A coluna antiga aliquota_cbs passa a guardar a CBS efetiva de 2027 (referência − redutor).

update public.parametros_reforma set
  aliquota_cbs_referencia = 0.1130,
  redutor_transicao_cbs   = 0.0010,
  aliquota_ibs_estadual   = 0.0005,
  aliquota_ibs_municipal  = 0.0005,
  aliquota_cbs            = 0.1120,
  status_aliquota         = 'calculada_tcu_pendente_senado',
  fonte_aliquota          = 'TCU, sessão plenária de 28/10/2026 — pendente de resolução do Senado Federal até 15/12/2026 (LC 214/2025, art. 14)',
  data_referencia         = '2026-10-28';

-- Se a tabela estiver vazia, cria a linha de 2027.
do $$
begin
  if not exists (select 1 from public.parametros_reforma) then
    insert into public.parametros_reforma
      (chave, descricao, aliquota_cbs, aliquota_cbs_referencia, redutor_transicao_cbs,
       aliquota_ibs_estadual, aliquota_ibs_municipal, status_aliquota, fonte_aliquota, data_referencia)
    values
      ('reforma_2027', 'Alíquotas de IBS/CBS para 2027–2028', 0.1120, 0.1130, 0.0010, 0.0005, 0.0005,
       'calculada_tcu_pendente_senado',
       'TCU, sessão plenária de 28/10/2026 — pendente de resolução do Senado Federal até 15/12/2026 (LC 214/2025, art. 14)',
       '2026-10-28');
  end if;
exception when others then
  raise notice 'parametros_reforma: linha padrão não criada (%). O app usa o padrão embutido.', sqlerrm;
end $$;

-- Seed antigo em configuracoes (8,8% / 17,7%) alinhado aos parâmetros de 2027.
update public.configuracoes
   set valor = valor || jsonb_build_object('CBS_RATE', 0.112, 'IBS_RATE', 0.001, 'IVA_DUAL', 0.113)
 where chave = 'reforma_aliquotas';
update public.configuracoes
   set valor = jsonb_build_object('data', '2026-12-20T23:59:59-03:00'),
       descricao = 'Fim da janela de cancelamento das opções para jan a jun/2027 (Res. CGSN 194/2026)'
 where chave = 'prazo_opcao';

-- ─────────── 2. Partilha do Simples Nacional ───────────
create table if not exists public.partilha_simples (
  id uuid primary key default gen_random_uuid(),
  anexo text not null,              -- 'I' | 'II' | 'III' | 'IV' | 'V'
  faixa int not null,               -- 1 a 6
  ano_inicio int not null,
  ano_fim int not null,
  aliquota_nominal numeric(6,4) not null,
  parcela_deduzir numeric(14,2) not null default 0,
  p_irpj numeric(6,4) not null,
  p_csll numeric(6,4) not null,
  p_cbs numeric(6,4) not null,
  p_cpp numeric(6,4) not null default 0,
  p_ipi numeric(6,4) not null default 0,
  p_icms numeric(6,4) not null default 0,
  p_iss numeric(6,4) not null default 0,
  p_ibs numeric(6,4) not null default 0,
  fonte text not null,
  unique (anexo, faixa, ano_inicio)
);

grant select on public.partilha_simples to authenticated;
grant all on public.partilha_simples to service_role;
alter table public.partilha_simples enable row level security;
drop policy if exists "leitura autenticada partilha_simples" on public.partilha_simples;
create policy "leitura autenticada partilha_simples"
  on public.partilha_simples for select to authenticated using (true);
drop policy if exists "partilha_simples_admin_write" on public.partilha_simples;
create policy "partilha_simples_admin_write" on public.partilha_simples
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 2027–2028. Gerado a partir de src/lib/tax-engine/simples-tabelas.ts (linhasPartilha2027).
-- 2029 a 2033: pendente do texto oficial dos Anexos XVIII a XXII — não carregado.
insert into public.partilha_simples
  (anexo, faixa, ano_inicio, ano_fim, aliquota_nominal, parcela_deduzir,
   p_irpj, p_csll, p_cbs, p_cpp, p_ipi, p_icms, p_iss, p_ibs, fonte)
values
('I',1,2027,2028,0.0400,0.00,0.0550,0.0350,0.1533,0.4150,0.0000,0.3400,0.0000,0.0017,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('I',2,2027,2028,0.0730,5940.00,0.0550,0.0350,0.1533,0.4150,0.0000,0.3400,0.0000,0.0017,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('I',3,2027,2028,0.0950,13860.00,0.0550,0.0350,0.1533,0.4200,0.0000,0.3350,0.0000,0.0017,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('I',4,2027,2028,0.1070,22500.00,0.0550,0.0350,0.1533,0.4200,0.0000,0.3350,0.0000,0.0017,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('I',5,2027,2028,0.1430,87300.00,0.0550,0.0350,0.1533,0.4200,0.0000,0.3350,0.0000,0.0017,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('I',6,2027,2028,0.1900,378000.00,0.1350,0.1000,0.3402,0.4210,0.0000,0.0000,0.0000,0.0038,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('II',1,2027,2028,0.0450,0.00,0.0550,0.0350,0.1385,0.3750,0.0750,0.3200,0.0000,0.0015,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('II',2,2027,2028,0.0780,5940.00,0.0550,0.0350,0.1385,0.3750,0.0750,0.3200,0.0000,0.0015,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('II',3,2027,2028,0.1000,13860.00,0.0550,0.0350,0.1385,0.3750,0.0750,0.3200,0.0000,0.0015,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('II',4,2027,2028,0.1120,22500.00,0.0550,0.0350,0.1385,0.3750,0.0750,0.3200,0.0000,0.0015,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('II',5,2027,2028,0.1470,85500.00,0.0550,0.0350,0.1385,0.3750,0.0750,0.3200,0.0000,0.0015,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('II',6,2027,2028,0.3000,720000.00,0.0850,0.0750,0.2522,0.2350,0.3500,0.0000,0.0000,0.0028,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('III',1,2027,2028,0.0600,0.00,0.0400,0.0350,0.1543,0.4340,0.0000,0.0000,0.3350,0.0017,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('III',2,2027,2028,0.1120,9360.00,0.0400,0.0350,0.1691,0.4340,0.0000,0.0000,0.3200,0.0019,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('III',3,2027,2028,0.1350,17640.00,0.0400,0.0350,0.1642,0.4340,0.0000,0.0000,0.3250,0.0018,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('III',4,2027,2028,0.1600,35640.00,0.0400,0.0350,0.1642,0.4340,0.0000,0.0000,0.3250,0.0018,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('III',5,2027,2028,0.2100,125640.00,0.0400,0.0350,0.1543,0.4340,0.0000,0.0000,0.3350,0.0017,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('III',6,2027,2028,0.3300,648000.00,0.3500,0.1500,0.1929,0.3050,0.0000,0.0000,0.0000,0.0021,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('IV',1,2027,2028,0.0450,0.00,0.1880,0.1520,0.2126,0.0000,0.0000,0.0000,0.4450,0.0024,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('IV',2,2027,2028,0.0900,8100.00,0.1980,0.1520,0.2473,0.0000,0.0000,0.0000,0.4000,0.0027,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('IV',3,2027,2028,0.1020,12420.00,0.2080,0.1520,0.2374,0.0000,0.0000,0.0000,0.4000,0.0026,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('IV',4,2027,2028,0.1400,39780.00,0.1780,0.1920,0.2275,0.0000,0.0000,0.0000,0.4000,0.0025,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('IV',5,2027,2028,0.2200,183780.00,0.1880,0.1920,0.2176,0.0000,0.0000,0.0000,0.4000,0.0024,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('IV',6,2027,2028,0.3300,828000.00,0.5350,0.2150,0.2473,0.0000,0.0000,0.0000,0.0000,0.0027,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('V',1,2027,2028,0.1550,0.00,0.2500,0.1500,0.1696,0.2885,0.0000,0.0000,0.1400,0.0019,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('V',2,2027,2028,0.1800,4500.00,0.2300,0.1500,0.1696,0.2785,0.0000,0.0000,0.1700,0.0019,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('V',3,2027,2028,0.1950,9900.00,0.2400,0.1500,0.1795,0.2385,0.0000,0.0000,0.1900,0.0020,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('V',4,2027,2028,0.2050,17100.00,0.2100,0.1500,0.1894,0.2385,0.0000,0.0000,0.2100,0.0021,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('V',5,2027,2028,0.2300,62100.00,0.2300,0.1250,0.1696,0.2385,0.0000,0.0000,0.2350,0.0019,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)'),
('V',6,2027,2028,0.3050,540000.00,0.3500,0.1550,0.1978,0.2950,0.0000,0.0000,0.0000,0.0022,'LC 214/2025, Anexos XVIII a XXII — derivada: CBS+IBS = PIS+Cofins da tabela vigente, IBS = 1,1% (conferir com o texto oficial)')

on conflict (anexo, faixa, ano_inicio) do nothing;

-- ─────────── 4. Perfil de clientes do contribuinte ───────────
create table if not exists public.perfil_clientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  categoria text not null
    check (categoria in ('pj_regime_regular','pj_simples','pessoa_fisica','orgao_publico','exterior')),
  percentual_receita numeric(6,4) not null check (percentual_receita >= 0 and percentual_receita <= 1),
  valor_anualizado numeric(14,2),
  origem text not null default 'manual' check (origem in ('manual','extraido_dominio','extraido_xml')),
  created_at timestamptz not null default now(),
  unique (cliente_id, categoria)
);

grant select, insert, update, delete on public.perfil_clientes to authenticated;
grant all on public.perfil_clientes to service_role;
alter table public.perfil_clientes enable row level security;

drop policy if exists "perfil_clientes_owner_all" on public.perfil_clientes;
create policy "perfil_clientes_owner_all" on public.perfil_clientes
  for all to authenticated
  using (exists (select 1 from public.clientes c where c.id = cliente_id and c.responsavel_id = auth.uid()))
  with check (exists (select 1 from public.clientes c where c.id = cliente_id and c.responsavel_id = auth.uid()));

drop policy if exists "perfil_clientes_admin_all" on public.perfil_clientes;
create policy "perfil_clientes_admin_all" on public.perfil_clientes
  for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ─────────── 7. Prazos e janelas ───────────
create table if not exists public.janelas_opcao (
  id uuid primary key default gen_random_uuid(),
  descricao text not null unique,
  data_inicio date not null,
  data_fim date not null,
  periodo_efeito text not null,
  irretratavel boolean not null default false,
  fonte text not null
);

grant select on public.janelas_opcao to authenticated;
grant all on public.janelas_opcao to service_role;
alter table public.janelas_opcao enable row level security;
drop policy if exists "janelas_opcao_select" on public.janelas_opcao;
create policy "janelas_opcao_select" on public.janelas_opcao for select to authenticated using (true);
drop policy if exists "janelas_opcao_admin_write" on public.janelas_opcao;
create policy "janelas_opcao_admin_write" on public.janelas_opcao
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.janelas_opcao (descricao, data_inicio, data_fim, periodo_efeito, irretratavel, fonte) values
('Opção pelo Simples Nacional para 2027','2026-09-01','2026-10-15','ano-calendário 2027',false,'Res. CGSN 194/2026'),
('Opção pelo regime regular de IBS e CBS','2026-09-01','2026-10-30','jan a jun/2027',false,'Res. CGSN 194/2026'),
('Cancelamento das opções','2026-11-03','2026-12-20','jan a jun/2027',true,'Res. CGSN 194/2026'),
('Resolução do Senado com a alíquota da CBS','2026-12-01','2026-12-15','2027',false,'LC 214/2025, art. 14'),
('Opção pelo regime regular — 2º semestre','2027-03-01','2027-03-31','jul a dez/2027',false,'Res. CGSN 186/2026')
on conflict (descricao) do nothing;

-- ─────────── Cadastro do cliente ───────────
alter table public.clientes
  add column if not exists optou_regime_regular boolean,
  add column if not exists data_opcao_regime_regular date,
  add column if not exists repasse_preco_confirmado boolean,       -- condição 4 da decisão
  add column if not exists pct_receita_iss_retido numeric(6,4),    -- 0..1
  add column if not exists sujeito_fator_r boolean,                -- false = atividade fora do Fator R
  add column if not exists folha_12m numeric(14,2);                -- folha 12 meses para o Fator R

-- ─────────── Regimes setoriais (complemento) ───────────
insert into public.regimes_setoriais
(tipo_receita, descricao, reducao, monofasico, gera_credito_adquirente, requer_validacao_societaria, artigo, status)
values
('educacao','Serviços de educação listados no Anexo II',0.600,false,true,false,'LC 214/2025, art. 129 e Anexo II','lei')
on conflict (tipo_receita) do nothing;

alter table public.analises alter column versao_engine set default 'v15';
