-- Bloco 14: enquadramento setorial e alíquota por linha de receita

create table if not exists public.regimes_setoriais (
  id uuid primary key default gen_random_uuid(),
  tipo_receita text not null unique,
  descricao text not null,
  reducao numeric(4,3) not null default 0,
  monofasico boolean not null default false,
  gera_credito_adquirente boolean not null default true,
  requer_validacao_societaria boolean not null default false,
  artigo text not null,
  status text not null default 'lei',
  created_at timestamptz not null default now()
);

grant select on public.regimes_setoriais to authenticated;
grant all on public.regimes_setoriais to service_role;
alter table public.regimes_setoriais enable row level security;

drop policy if exists "regimes_setoriais_select" on public.regimes_setoriais;
create policy "regimes_setoriais_select" on public.regimes_setoriais
  for select to authenticated using (true);

drop policy if exists "regimes_setoriais_admin_write" on public.regimes_setoriais;
create policy "regimes_setoriais_admin_write" on public.regimes_setoriais
  for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into public.regimes_setoriais
(tipo_receita, descricao, reducao, monofasico, gera_credito_adquirente, requer_validacao_societaria, artigo, status)
values
('saude_anexo_iii','Serviços de saúde listados no Anexo III',0.600,false,true,false,'LC 214/2025, art. 130 e Anexo III','lei'),
('profissao_regulamentada','Profissões intelectuais regulamentadas',0.300,false,true,true,'LC 214/2025, art. 127','lei'),
('construcao_civil','Serviços de construção civil',0.500,false,true,false,'LC 214/2025, arts. 252, V e 261','lei'),
('incorporacao_imobiliaria','Alienação de unidades de incorporação',0.500,false,true,false,'LC 214/2025, arts. 252 e 261','lei'),
('hotelaria','Hotelaria, parques de diversão e temáticos',0.400,false,false,false,'LC 214/2025, arts. 281 e 283','lei'),
('bar_restaurante','Alimentação e bebida não alcoólica preparadas no local',0.400,false,false,false,'LC 214/2025, arts. 275 e 276','lei'),
('combustivel_revenda','Revenda de combustível — monofásico',0.000,true,false,false,'LC 214/2025, arts. 172 a 180','lei'),
('locacao_imovel','Locação, cessão onerosa e arrendamento de imóvel',0.700,false,true,false,'LC 214/2025, art. 261, parágrafo único','lei'),
('regular','Regime regular — alíquota cheia',0.000,false,true,false,'LC 214/2025, art. 47','lei')
on conflict (tipo_receita) do nothing;

-- Receitas segregadas por cliente/análise (cenário = analises)
create table if not exists public.receitas_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  analise_id uuid references public.analises(id) on delete cascade,
  tipo_receita text not null references public.regimes_setoriais(tipo_receita),
  descricao_livre text,
  valor_periodo numeric(14,2) not null,
  meses int not null default 12,
  valor_anualizado numeric(14,2) generated always as (valor_periodo / nullif(meses,0) * 12) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_receitas_cliente on public.receitas_cliente(cliente_id, analise_id);

grant select, insert, update, delete on public.receitas_cliente to authenticated;
grant all on public.receitas_cliente to service_role;
alter table public.receitas_cliente enable row level security;

drop policy if exists "receitas_cliente_owner_all" on public.receitas_cliente;
create policy "receitas_cliente_owner_all" on public.receitas_cliente
  for all to authenticated
  using (exists (select 1 from public.clientes c where c.id = cliente_id and c.responsavel_id = auth.uid()))
  with check (exists (select 1 from public.clientes c where c.id = cliente_id and c.responsavel_id = auth.uid()));

drop policy if exists "receitas_cliente_admin_all" on public.receitas_cliente;
create policy "receitas_cliente_admin_all" on public.receitas_cliente
  for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Dimensão setorial nos fornecedores
alter table public.fornecedores_entradas
  add column if not exists cnae text,
  add column if not exists tipo_receita_fornecedor text default 'regular';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fornecedores_entradas_tipo_receita_fkey'
  ) then
    alter table public.fornecedores_entradas
      add constraint fornecedores_entradas_tipo_receita_fkey
      foreign key (tipo_receita_fornecedor) references public.regimes_setoriais(tipo_receita);
  end if;
end $$;

-- Validação societária e versionamento
alter table public.clientes
  add column if not exists socios_habilitados boolean default null;

alter table public.analises
  add column if not exists aliquota_cbs_utilizada numeric(6,4),
  add column if not exists data_base_calculo timestamptz default now(),
  add column if not exists versao_engine text default 'v14';