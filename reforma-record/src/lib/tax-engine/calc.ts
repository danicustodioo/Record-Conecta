// Engine de cálculo dos cenários tributários (2026 e 2027).
// Funções puras — entrada/saída JSON serializável.
// Bloco 13: presunção mista, ISS efetivo obrigatório, CPP/FGTS da folha,
// base creditável estimada e lucro líquido sem dupla contagem.
// Bloco 14 (v14): CBS resolvida por linha de receita (enquadramento setorial
// da LC 214/2025) e crédito de fornecedor com dimensão setorial.

// Bloco 15A (v15): parâmetros 2027 lidos de `parametros_reforma`, partilha do
// Simples por período, Fator R, três cenários do Simples (A: unificado 2026,
// B: unificado 2027, C: regime regular de IBS/CBS), crédito legal de fornecedor
// optante do Simples, crédito transferido e preço de equilíbrio.

import { REFORMA, terceirosPorSetor, type Anexo } from "./reforma";
import {
  aliquotaEfetiva as aliquotaEfetivaDAS,
  encontrarFaixa,
  partilhaSimples,
  TABELA_SIMPLES,
  type FaixaSimples,
  type Partilha,
} from "./simples-tabelas";
import { elegibilidadePorRegime, type Elegibilidade, type RegimeKey } from "./elegibilidade";
import { aliquotas2027, PARAMETROS_PADRAO, type Aliquotas2027, type ParametrosReforma } from "./parametros";
import { analisarFatorR, type AnaliseFatorR } from "./fator-r";
import { hojeISO, janelaAberta, janelaCancelamento, JANELAS_PADRAO, fmtDataBR, type JanelaOpcao } from "./janelas";
import {
  REGIMES_SETORIAIS_FALLBACK,
  debitoCBS,
  regimePorTipo,
  type LinhaCBS,
  type LinhaReceita,
  type RegimeSetorial,
} from "@/lib/enquadramento";

export const ENGINE_VERSAO = "v15";

export type CategoriaCliente =
  | "pj_regime_regular"
  | "pj_simples"
  | "pessoa_fisica"
  | "orgao_publico"
  | "exterior";


export interface InputCalculo {
  setor: string;
  anexo: Anexo;
  rbt12: number; // receita 12m declarada no cadastro
  receita_anual: number; // receita bruta ANUALIZADA (obrigatória, > 0)
  receita_liquida_anual?: number; // receita líquida anualizada (deduções já retiradas)
  receita_servicos: number;
  receita_mercadorias: number;
  receita_produtos?: number;
  meses_dre?: number; // meses cobertos pela DRE (para rastreabilidade)
  fator_anualizacao?: number; // 12 / meses_dre
  cmv?: number;
  csp?: number;
  despesas_pessoal?: number;
  despesas_administrativas?: number;
  despesas_financeiras?: number;
  receitas_financeiras?: number;
  base_fgts_anual: number;
  folha_base_anual: number; // base CPP anualizada (proventos sem rescisões)
  folha_informada?: boolean;
  meses_folha?: number;
  cpp_anual_informado?: number; // CPP patronal apurado na folha (anualizado)
  fgts_anual_informado?: number; // FGTS apurado na folha (anualizado)
  fgts_alertas?: string[]; // validações da extração/normalização do FGTS
  cpp_rate_efetivo?: number; // alíquota efetiva observada (RAT × FAP + terceiros)
  iss_aliquota_efetiva?: number; // ex.: 0.017388 apurado nas saídas de serviço / cadastro
  pct_empreitada?: number; // 0..1 — parcela com aplicação de material (presunção 8%/12%)
  base_creditavel_estimada?: number; // base creditável anual informada no cadastro
  pct_creditavel?: number; // 0..1 — % do custo de serviços considerado creditável
  pct_b2b: number; // 0..100
  fornecedores?: Array<{
    nome?: string;
    regime: "SIMPLES_SEM_HIBRIDO" | "SIMPLES_HIBRIDO" | "NORMAL" | "DESCONHECIDO";
    anexo?: Anexo;
    faixa?: number; // faixa do fornecedor optante do Simples (1 a 6)
    aliquota_efetiva?: number; // alíquota efetiva do DAS do fornecedor, se conhecida
    cnpj?: string | null;
    compras_anuais: number;
    tipo_receita?: string | null; // enquadramento setorial do fornecedor (Bloco 14)
    cnae?: string | null;
  }>;
  // ---- Bloco 14 ----
  linhas_receita?: LinhaReceita[]; // segregação de receita anualizada por tipo
  regimes_setoriais?: Record<string, RegimeSetorial>;
  socios_habilitados?: boolean | null;
  aliquota_cbs_base?: number; // sobrescreve a CBS de 2027 derivada dos parâmetros (uso em testes)
  // ---- Bloco 14B: alertas setoriais ----
  regime_atual?: string | null;
  tem_patrimonio_afetacao?: boolean | null;
  // ---- Bloco 15A ----
  parametros?: ParametrosReforma; // linha de parametros_reforma (padrão: PARAMETROS_PADRAO)
  folha_12m?: number; // folha dos 12 meses para o Fator R (salários, pró-labore, 13º, FGTS, encargos)
  sujeito_fator_r?: boolean | null; // false = atividade não sujeita ao Fator R
  pct_receita_iss_retido?: number; // 0..1 — parcela da receita com ISS retido pelo tomador
  perfil_clientes?: Array<{ categoria: CategoriaCliente; percentual: number }>; // percentual 0..1
  optou_regime_regular?: boolean | null; // já optou pelo regime regular de IBS/CBS para 2027
  repasse_preco_confirmado?: boolean | null; // contratos renegociáveis até 31/12/2026
  janelas?: JanelaOpcao[];
  data_calculo?: string; // yyyy-mm-dd (padrão: hoje em Brasília)
}

export interface ResultadoCenario {
  regime: RegimeKey;
  ano: 2026 | 2027;
  elegivel: boolean;
  motivo_inelegibilidade?: string;
  base_legal_inelegibilidade?: string;
  carga_total: number; // tributos (sem encargos de folha)
  carga_pct: number;
  cpp_anual: number;
  fgts_anual: number;
  encargos_folha: number; // cpp + fgts (informativo — já embutidos nos custos da DRE)
  carga_total_com_folha: number;
  lucro_liquido: number;
  detalhamento: Record<string, number>;
  observacoes?: string[];
  cbs_detalhe?: LinhaCBS[]; // composição da CBS por linha de receita
  saldo_credor_cbs?: number; // crédito > débito: não zerado, acumulado
}

export interface ResultadoComparativo {
  cenarios: ResultadoCenario[];
  recomendado: RegimeKey;
  economia_anual: number; // recomendado vs pior elegível
  ranking: ResultadoCenario[]; // apenas elegíveis, do menor para o maior
  inelegiveis: ResultadoCenario[];
  receita_anual: number;
  receita_liquida_anual: number;
  margem_bruta: number;
  resultado_antes_tributos: number;
  base_creditavel: number;
  base_creditavel_fonte: "FORNECEDORES" | "ESTIMADA" | "INSUFICIENTE";
  meses_dre?: number;
  fator_anualizacao?: number;
  alertas: string[];
  premissas: Record<string, number | string | boolean>;
  // ---- Bloco 14 ----
  cbs_detalhe: LinhaCBS[];
  cbs_aliquota_base: number;
  cbs_aliquota_media_efetiva: number;
  socios_habilitados: boolean | null;
  versao_engine: string;
  data_base_calculo: string;
  saldo_credor_cbs: number; // saldo credor do cenário recomendado (0 quando não houver)
  // ---- Bloco 15A ----
  parametros_reforma: ParametrosReforma;
  aliquotas_2027: Aliquotas2027;
  rbt12_utilizada: number;
  rbt12_fonte: "CADASTRO" | "DRE_ANUALIZADA";
  anexo_utilizado: Anexo;
  fator_r?: AnaliseFatorR;
  simples_decisao?: DecisaoSimples;
  janela_cancelamento_aberta: boolean;
}

export interface CondicaoDecisao {
  id: 1 | 2 | 3 | 4;
  titulo: string;
  ok: boolean | null; // null = dado não informado
  detalhe: string;
}

export interface DecisaoSimples {
  aliquota_efetiva_das: number;
  p_cbs: number;
  p_ibs: number;
  credito_transferido_unificado_pct: number;
  credito_transferido_unificado_rs: number;
  credito_transferido_regular_pct: number;
  credito_transferido_regular_rs: number;
  reajuste_equilibrio: number;
  pct_receita_pj_regular: number | null;
  carga_unificado: number; // cenário B
  carga_regular: number; // cenário C
  delta_carga_pct: number; // (C − B) ÷ receita
  receita_liquida_unificado: number;
  receita_liquida_regular_sem_reajuste: number;
  receita_liquida_regular_com_reajuste: number;
  ganho_regular_sem_reajuste: number;
  ganho_regular_com_reajuste: number;
  base_creditavel_atual_pct: number;
  base_creditavel_minima_pct: number;
  condicoes: CondicaoDecisao[];
  recomenda_regime_regular: boolean;
  recomendacao: string;
  optou_regime_regular: boolean | null;
  alerta_cancelamento: boolean;
}


// ─────────── Bloco 14: CBS por linha de receita ───────────

function parametrosDe(i: InputCalculo): ParametrosReforma {
  return i.parametros ?? PARAMETROS_PADRAO;
}

/** CBS, IBS e IVA de 2027–2028 derivados dos parâmetros. */
function aliq27(i: InputCalculo): Aliquotas2027 {
  const a = aliquotas2027(parametrosDe(i));
  const sob = i.aliquota_cbs_base;
  if (sob != null && isFinite(sob) && sob > 0) return { cbs: sob, ibs: a.ibs, iva: sob + a.ibs };
  return a;
}

function aliquotaBaseCBS(i: InputCalculo): number {
  return aliq27(i).cbs;
}

function regimesDe(i: InputCalculo): Record<string, RegimeSetorial> {
  return i.regimes_setoriais && Object.keys(i.regimes_setoriais).length
    ? i.regimes_setoriais
    : REGIMES_SETORIAIS_FALLBACK;
}

/** Linhas de receita usadas no cálculo. Sem segregação, tudo cai em `regular`. */
function linhasReceita(i: InputCalculo): LinhaReceita[] {
  const linhas = (i.linhas_receita ?? []).filter((l) => (l.valor_anualizado ?? 0) > 0);
  if (linhas.length) return linhas;
  return [{ tipo_receita: "regular", valor_anualizado: i.receita_anual }];
}

/** Débito de CBS composto (art. 47 + regimes específicos da LC 214/2025). */
function cbsDebito(i: InputCalculo): { detalhe: LinhaCBS[]; total: number } {
  return debitoCBS(
    linhasReceita(i),
    regimesDe(i),
    aliquotaBaseCBS(i),
    i.socios_habilitados ?? null,
  );
}

const sum = (...n: Array<number | undefined>): number =>
  n.reduce<number>((a, b) => a + (b ?? 0), 0);


function pct(valor: number, receita: number): number {
  return receita > 0 ? valor / receita : 0;
}

// ISS: nunca usa default de 5%. Sem alíquota efetiva apurada, o ISS não é estimado.
function issAliquota(i: InputCalculo): number | null {
  const a = i.iss_aliquota_efetiva;
  if (a == null || !isFinite(a) || a <= 0) return null;
  return Math.min(0.05, a);
}

function receitaLiquida(i: InputCalculo): number {
  const rl = i.receita_liquida_anual;
  return rl != null && rl > 0 ? rl : i.receita_anual;
}

function custosDiretos(i: InputCalculo): number {
  return sum(i.cmv, i.csp);
}

function margemBruta(i: InputCalculo): number {
  const rl = receitaLiquida(i);
  return rl > 0 ? (rl - custosDiretos(i)) / rl : 0;
}

function cppRateSetor(setor: string): number {
  return REFORMA.CPP_PATRONAL + REFORMA.RAT + terceirosPorSetor(setor);
}

function encargosFolha(i: InputCalculo): { cpp: number; fgts: number; rate: number; informado: boolean } {
  const cppInf = i.cpp_anual_informado;
  const fgtsInf = i.fgts_anual_informado;
  if (cppInf != null && cppInf > 0) {
    const base = Math.max(0, i.folha_base_anual);
    return {
      cpp: cppInf,
      fgts: fgtsInf != null && fgtsInf > 0 ? fgtsInf : Math.max(0, i.base_fgts_anual) * REFORMA.FGTS,
      rate: i.cpp_rate_efetivo ?? (base > 0 ? cppInf / base : cppRateSetor(i.setor)),
      informado: true,
    };
  }
  const rate = i.cpp_rate_efetivo ?? cppRateSetor(i.setor);
  return {
    cpp: Math.max(0, i.folha_base_anual) * rate,
    fgts: fgtsInf != null && fgtsInf > 0 ? fgtsInf : Math.max(0, i.base_fgts_anual) * REFORMA.FGTS,
    rate,
    informado: Boolean(i.folha_informada),
  };
}

// Resultado operacional anualizado ANTES de qualquer tributo.
// CPP/FGTS já estão embutidos em custos e despesas da DRE — não somar de novo.
function resultadoAntesTributos(i: InputCalculo): number {
  return (
    i.receita_anual -
    custosDiretos(i) -
    sum(i.despesas_pessoal, i.despesas_administrativas, i.despesas_financeiras) +
    (i.receitas_financeiras ?? 0)
  );
}

function comprasTotais(i: InputCalculo): number {
  return (i.fornecedores ?? []).reduce((s, f) => s + (f.compras_anuais || 0), 0);
}

export interface BaseCreditavel {
  base: number;
  fonte: "FORNECEDORES" | "ESTIMADA" | "INSUFICIENTE";
  alerta?: string;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmtPct = (v: number) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;

export function baseCreditavel(i: InputCalculo): BaseCreditavel {
  const custo = custosDiretos(i);
  const forn = comprasTotais(i);
  const estimada =
    i.base_creditavel_estimada && i.base_creditavel_estimada > 0
      ? i.base_creditavel_estimada
      : i.pct_creditavel && i.pct_creditavel > 0
        ? custo * i.pct_creditavel
        : 0;

  const plausivel = custo <= 0 ? forn > 0 : forn >= custo * 0.05;
  if (plausivel && forn > 0) return { base: forn, fonte: "FORNECEDORES" };
  if (estimada > 0) {
    return {
      base: estimada,
      fonte: "ESTIMADA",
      alerta:
        `Base creditável do módulo de fornecedores (${fmtBRL(forn)}) representa apenas ` +
        `${fmtPct(custo > 0 ? forn / custo : 0)} do custo direto — implausível para o setor. ` +
        `Utilizada a base creditável informada no cadastro (${fmtBRL(estimada)}).`,
    };
  }
  return {
    base: forn,
    fonte: "INSUFICIENTE",
    alerta:
      `Base creditável de ${fmtBRL(forn)} representa apenas ${fmtPct(custo > 0 ? forn / custo : 0)} do custo ` +
      `de serviços. Valor implausível para o setor. Verifique se o módulo de fornecedores foi alimentado ` +
      `ou informe a base creditável manualmente no cadastro do cliente.`,
  };
}

// Anexo provável do fornecedor optante do Simples pelo CNAE (quando não informado).
function anexoProvavelPorCnae(cnae?: string | null): Anexo {
  const d = (cnae ?? "").replace(/\D/g, "");
  const p2 = Number(d.slice(0, 2));
  if (!d) return "ANEXO_III";
  if (p2 >= 45 && p2 <= 47) return "ANEXO_I";
  if (p2 >= 10 && p2 <= 33) return "ANEXO_II";
  return "ANEXO_III";
}

interface CreditoSimplesFornecedor {
  aliquota_efetiva: number;
  partilha: Partilha;
  estimativa: boolean;
}

/**
 * Crédito do adquirente de fornecedor optante do Simples unificado:
 * compra × alíquota efetiva do fornecedor × (p_cbs | p_ibs) da faixa e anexo do fornecedor.
 * LC 214/2025, art. 47, §9º, II — "em montante equivalente ao devido por meio desse regime".
 */
function creditoSimplesFornecedor(f: NonNullable<InputCalculo["fornecedores"]>[number]): CreditoSimplesFornecedor {
  const anexo = f.anexo ?? anexoProvavelPorCnae(f.cnae);
  const tabela = TABELA_SIMPLES[anexo];
  const faixa: FaixaSimples =
    tabela.find((x) => x.faixa === f.faixa) ?? tabela[0];
  const aliq =
    f.aliquota_efetiva != null && f.aliquota_efetiva > 0 ? f.aliquota_efetiva : faixa.aliquota; // 1ª faixa: efetiva = nominal
  return {
    aliquota_efetiva: aliq,
    partilha: partilhaSimples(anexo, faixa, 2027, aliq),
    estimativa: !(f.anexo && f.faixa) && !(f.aliquota_efetiva && f.aliquota_efetiva > 0),
  };
}

// Crédito de fornecedor: regime tributário E setor (Bloco 14) + fórmula legal do Simples (Bloco 15A).
// Setores com vedação legal (arts. 174, 276, 283) não geram crédito ao adquirente.
function creditosPorFornecedor(
  fornecedores: InputCalculo["fornecedores"],
  tipo: "CBS" | "IBS" | "PIS_COFINS",
  regimes: Record<string, RegimeSetorial>,
  a: Aliquotas2027,
): number {
  if (!fornecedores) return 0;
  let total = 0;
  for (const f of fornecedores) {
    const setor = regimePorTipo(f.tipo_receita ?? "regular", regimes);
    if (!setor.gera_credito_adquirente || setor.monofasico) continue;
    const fatorSetor = 1 - setor.reducao;

    if (tipo === "PIS_COFINS") {
      // 2026 (Lucro Real): regra anterior, inalterada neste bloco.
      if (f.regime === "DESCONHECIDO") continue;
      if (f.regime === "SIMPLES_SEM_HIBRIDO" && f.anexo) continue;
      total += f.compras_anuais * 0.0925 * fatorSetor;
      continue;
    }

    if (f.regime === "NORMAL" || f.regime === "SIMPLES_HIBRIDO") {
      total += f.compras_anuais * (tipo === "CBS" ? a.cbs : a.ibs) * fatorSetor;
    } else if (f.regime === "SIMPLES_SEM_HIBRIDO") {
      const c = creditoSimplesFornecedor(f);
      total += f.compras_anuais * c.aliquota_efetiva * (tipo === "CBS" ? c.partilha.cbs : c.partilha.ibs);
    }
    // DESCONHECIDO: sem crédito
  }
  return total;
}

function calcularCreditos(i: InputCalculo, tipo: "CBS" | "IBS" | "PIS_COFINS"): number {
  const bc = baseCreditavel(i);
  const regimes = regimesDe(i);
  const a = aliq27(i);
  if (bc.fonte === "FORNECEDORES") return creditosPorFornecedor(i.fornecedores, tipo, regimes, a);
  const rate = tipo === "CBS" ? a.cbs : tipo === "IBS" ? a.ibs : 0.0925;
  return bc.base * rate;
}


// Presunção mista (Lei 9.249/95, art. 15 e 20):
// empreitada com material 8% (IRPJ) / 12% (CSLL); mão de obra pura 32% em ambos.
function basesPresumidas(i: InputCalculo): { irpj: number; csll: number; pct_empreitada: number } {
  let pctEmpreitada = i.pct_empreitada;
  if (pctEmpreitada == null || !isFinite(pctEmpreitada)) {
    const obra = (i.receita_mercadorias ?? 0) + (i.receita_produtos ?? 0);
    const serv = i.receita_servicos ?? 0;
    pctEmpreitada = obra + serv > 0 ? obra / (obra + serv) : 0;
  }
  pctEmpreitada = Math.min(1, Math.max(0, pctEmpreitada));
  const pctMO = 1 - pctEmpreitada;
  return {
    irpj: i.receita_anual * (pctEmpreitada * 0.08 + pctMO * 0.32),
    csll: i.receita_anual * (pctEmpreitada * 0.12 + pctMO * 0.32),
    pct_empreitada: pctEmpreitada,
  };
}

function irpjSobreBase(base: number): { irpj: number; adicional: number } {
  if (base <= 0) return { irpj: 0, adicional: 0 };
  return { irpj: base * 0.15, adicional: Math.max(0, base - 240_000) * 0.1 };
}

function inelegivel(regime: RegimeKey, ano: 2026 | 2027, e: Elegibilidade, i: InputCalculo): ResultadoCenario {
  const enc = encargosFolha(i);
  return {
    regime,
    ano,
    elegivel: false,
    motivo_inelegibilidade: e.motivo,
    base_legal_inelegibilidade: e.base_legal,
    carga_total: 0,
    carga_pct: 0,
    cpp_anual: 0,
    fgts_anual: enc.fgts,
    encargos_folha: 0,
    carga_total_com_folha: 0,
    lucro_liquido: 0,
    detalhamento: {},
    observacoes: [e.motivo ?? "Regime inelegível.", e.base_legal ? `Base legal: ${e.base_legal}` : ""].filter(Boolean),
  };
}

function obsFolha(enc: { cpp: number; rate: number; informado: boolean }): string {
  if (!enc.informado || enc.cpp <= 0) {
    return "Folha de pagamento não informada — CPP e FGTS não estimados. A carga real de encargos será maior.";
  }
  return `CPP patronal efetiva de ${fmtPct(enc.rate)} sobre a folha (RAT × FAP + terceiros apurados na folha), recolhida à parte.`;
}

function obsISS(aliq: number | null): string {
  return aliq == null
    ? "ISS efetivo não apurado — informe a alíquota efetiva no cadastro do cliente; nenhum ISS foi somado à carga."
    : `ISS calculado pela alíquota efetiva apurada de ${fmtPct(aliq)}.`;
}

// ─────────── Bloco 15A: base do Simples (RBT12, Fator R, partilha) ───────────

/** RBT12 do cadastro; sem ela, a receita anualizada da DRE (com aviso no diagnóstico). */
function rbt12Calculo(i: InputCalculo): { valor: number; fonte: "CADASTRO" | "DRE_ANUALIZADA" } {
  return i.rbt12 > 0 ? { valor: i.rbt12, fonte: "CADASTRO" } : { valor: i.receita_anual, fonte: "DRE_ANUALIZADA" };
}

/** Folha dos 12 meses para o Fator R: informada no cadastro ou proventos + FGTS da folha. */
function folha12m(i: InputCalculo): number {
  if (i.folha_12m != null && i.folha_12m > 0) return i.folha_12m;
  if (!i.folha_informada || !(i.folha_base_anual > 0)) return 0;
  return i.folha_base_anual + encargosFolha(i).fgts;
}

/** Anexo efetivo: Anexos III e V passam pelo Fator R quando há folha e RBT12. */
function anexoCalculo(i: InputCalculo): { anexo: Anexo; fator?: AnaliseFatorR } {
  const sujeito = i.sujeito_fator_r !== false && (i.anexo === "ANEXO_III" || i.anexo === "ANEXO_V");
  const folha = folha12m(i);
  const rbt = rbt12Calculo(i).valor;
  if (!sujeito || folha <= 0 || rbt <= 0) return { anexo: i.anexo };
  const fator = analisarFatorR(folha, rbt);
  return { anexo: fator.anexo, fator };
}

interface NucleoSimples {
  anexo: Anexo;
  rbt12: number;
  faixa: FaixaSimples;
  aliquota_efetiva: number;
  partilha: Partilha;
  das: number;
  iss_retido: number;
  das_a_recolher: number;
}

/**
 * Alíquota efetiva = (RBT12 × nominal − parcela) ÷ RBT12
 * DAS = receita × alíquota efetiva
 * ISS retido = DAS × p_iss × (receita com retenção ÷ receita total)
 */
function nucleoSimples(i: InputCalculo, ano: number): NucleoSimples {
  const { anexo } = anexoCalculo(i);
  const rbt12 = rbt12Calculo(i).valor;
  const faixa = encontrarFaixa(rbt12, anexo);
  const aliq = aliquotaEfetivaDAS(rbt12, anexo);
  const partilha = partilhaSimples(anexo, faixa, ano, aliq);
  const das = i.receita_anual * aliq;
  const pctRet = Math.min(1, Math.max(0, i.pct_receita_iss_retido ?? 0));
  const issRetido = das * partilha.iss * pctRet;
  return {
    anexo,
    rbt12,
    faixa,
    aliquota_efetiva: aliq,
    partilha,
    das,
    iss_retido: issRetido,
    das_a_recolher: das - issRetido,
  };
}

const OBS_PARTILHA_2027 =
  "Partilha 2027–2028: CBS + IBS ocupam o lugar de PIS + Cofins (IBS = 1,1% do total). " +
  "Derivada da tabela vigente — conferir com LC 214/2025, Anexos XVIII a XXII.";

/** Cenários A (2026) e B (2027): Simples unificado — a carga total é preservada pela lei. */
function calcSimplesUnificado(i: InputCalculo, ano: 2026 | 2027): ResultadoCenario {
  const regime: RegimeKey = ano === 2026 ? "SIMPLES" : "SIMPLES_2027";
  const eleg = elegibilidadePorRegime(regime, i.receita_anual);
  if (!eleg.elegivel) return inelegivel(regime, ano, eleg, i);

  const n = nucleoSimples(i, ano);
  const p = n.partilha;
  const enc = encargosFolha(i);
  const cppSeparado = n.anexo === "ANEXO_IV" ? enc.cpp : 0; // Anexo IV: CPP fora do DAS
  const carga = n.das; // inclui o ISS retido pelo tomador (também é custo da empresa)

  const obs = [
    n.anexo === "ANEXO_IV"
      ? "Anexo IV: CPP patronal é recolhida FORA do DAS."
      : "CPP embutido no DAS — não há CPP separado.",
    obsFolha(enc),
  ];
  if (ano === 2027) {
    obs.unshift(
      "Simples unificado em 2027 (não optar pelo regime regular): a CBS ocupa o lugar de PIS/Cofins e o IBS entra " +
        "com percentual mínimo. Não há redução setorial no Simples unificado — vale a tabela do anexo.",
    );
    obs.push(OBS_PARTILHA_2027);
  }
  if (p.teto_iss_aplicado) obs.push("ISS limitado a 5% da receita: excedente redistribuído entre os demais tributos da faixa.");

  return {
    regime,
    ano,
    elegivel: true,
    carga_total: carga,
    carga_pct: pct(carga, i.receita_anual),
    cpp_anual: cppSeparado,
    fgts_anual: enc.fgts,
    encargos_folha: cppSeparado + enc.fgts,
    carga_total_com_folha: carga + cppSeparado + enc.fgts,
    lucro_liquido: resultadoAntesTributos(i) - carga,
    detalhamento: {
      aliquota_efetiva: n.aliquota_efetiva,
      faixa: n.faixa.faixa,
      rbt12: n.rbt12,
      das_anual: n.das,
      iss_retido: n.iss_retido,
      das_a_recolher: n.das_a_recolher,
      irpj: n.das * p.irpj,
      csll: n.das * p.csll,
      ...(ano === 2026 ? { cofins: n.das * p.cofins, pis: n.das * p.pis } : { cbs: n.das * p.cbs, ibs: n.das * p.ibs }),
      cpp: cppSeparado || n.das * p.cpp,
      iss: n.das * p.iss,
      icms: n.das * p.icms,
      ipi: n.das * p.ipi,
      iss_ou_ipi: n.das * (p.iss + p.icms + p.ipi),
      p_cbs: p.cbs,
      p_ibs: p.ibs,
      credito_transferido_pct: n.aliquota_efetiva * (p.cbs + p.ibs),
    },
    observacoes: obs,
  };
}

export const calcSimples = (i: InputCalculo) => calcSimplesUnificado(i, 2026);
export const calcSimples2027 = (i: InputCalculo) => calcSimplesUnificado(i, 2027);

/** Débitos de CBS e IBS por linha de receita, com as reduções setoriais (resolver do Bloco 14B). */
function debitosIVA(i: InputCalculo) {
  const a = aliq27(i);
  const linhas = linhasReceita(i);
  const regimes = regimesDe(i);
  const socios = i.socios_habilitados ?? null;
  const cbs = debitoCBS(linhas, regimes, a.cbs, socios);
  const ibs = debitoCBS(linhas, regimes, a.ibs, socios);
  return { cbs, ibs, total: cbs.total + ibs.total };
}

/**
 * Cenário C — Simples com regime regular de IBS/CBS (LC 214/2025, art. 41, §3º).
 * DAS reduzido = receita × alíquota efetiva × (1 − p_cbs − p_ibs) − ISS retido
 * IVA a pagar = máx(0; débito − crédito) · saldo credor = máx(0; crédito − débito)
 * Mantém a chave "HIBRIDO" por compatibilidade com as telas e relatórios.
 */
export function calcHibrido(i: InputCalculo): ResultadoCenario {
  const eleg = elegibilidadePorRegime("HIBRIDO", i.receita_anual);
  if (!eleg.elegivel) return inelegivel("HIBRIDO", 2027, eleg, i);

  const n = nucleoSimples(i, 2027);
  const p = n.partilha;
  const dasReduzido = n.das * (1 - p.cbs - p.ibs);
  const dasReduzidoRecolher = dasReduzido - n.iss_retido;

  const deb = debitosIVA(i);
  const credCBS = calcularCreditos(i, "CBS");
  const credIBS = calcularCreditos(i, "IBS");
  const credito = credCBS + credIBS;
  const ivaPagar = Math.max(0, deb.total - credito);
  const saldoCredor = Math.max(0, credito - deb.total);

  const enc = encargosFolha(i);
  const cppSeparado = n.anexo === "ANEXO_IV" ? enc.cpp : 0;
  const carga = dasReduzido + ivaPagar;

  const obs = [
    "IBS e CBS fora do DAS (regime regular), com as reduções setoriais da LC 214/2025 e crédito sobre compras.",
    "O cliente PJ do regime regular passa a se creditar da alíquota cheia do item, e não só do valor embutido no DAS.",
    OBS_PARTILHA_2027,
    obsFolha(enc),
  ];
  if (saldoCredor > 0) {
    obs.push(
      `Saldo credor de ${fmtBRL(saldoCredor)}. Pedir ressarcimento impede a saída do regime regular no ano corrente e no seguinte (art. 41, §5º).`,
    );
  }

  return {
    regime: "HIBRIDO",
    ano: 2027,
    elegivel: true,
    carga_total: carga,
    carga_pct: pct(carga, i.receita_anual),
    cpp_anual: cppSeparado,
    fgts_anual: enc.fgts,
    encargos_folha: cppSeparado + enc.fgts,
    carga_total_com_folha: carga + cppSeparado + enc.fgts,
    lucro_liquido: resultadoAntesTributos(i) - carga,
    detalhamento: {
      aliquota_efetiva: n.aliquota_efetiva,
      das_cheio: n.das,
      das_reduzido: dasReduzido,
      iss_retido: n.iss_retido,
      das_reduzido_a_recolher: dasReduzidoRecolher,
      cbs_bruto: deb.cbs.total,
      cbs_creditos: credCBS,
      cbs_liquido: Math.max(0, deb.cbs.total - credCBS),
      ibs_bruto: deb.ibs.total,
      ibs_creditos: credIBS,
      ibs_liquido: Math.max(0, deb.ibs.total - credIBS),
      iva_a_pagar: ivaPagar,
      saldo_credor: saldoCredor,
      cpp: cppSeparado,
      split_payment_pct: pct(deb.total, i.receita_anual),
    },
    cbs_detalhe: deb.cbs.detalhe,
    saldo_credor_cbs: saldoCredor,
    observacoes: obs,
  };
}

// ─────────── Bloco 15A: crédito transferido e preço de equilíbrio ───────────

/** Reajuste de preço que deixa o cliente PJ indiferente: (1 − cAtual) ÷ (1 − cNovo) − 1. */
export function precoEquilibrio(cAtual: number, cNovo: number): number {
  return (1 - cAtual) / (1 - cNovo) - 1;
}

/** Crédito transferido ao cliente PJ do regime regular, como % da operação. */
export function creditoTransferido(i: InputCalculo, cenario: "unificado" | "regular"): number {
  if (cenario === "unificado") {
    const n = nucleoSimples(i, 2027);
    return n.aliquota_efetiva * (n.partilha.cbs + n.partilha.ibs);
  }
  const deb = debitosIVA(i);
  const base = deb.cbs.detalhe.reduce((s, d) => s + d.base, 0);
  if (base <= 0) return 0;
  let cred = 0;
  deb.cbs.detalhe.forEach((d, idx) => {
    if (!d.gera_credito_adquirente || d.monofasico) return;
    cred += d.cbs + (deb.ibs.detalhe[idx]?.cbs ?? 0);
  });
  return cred / base;
}

const MIN_PJ_REGULAR = 0.7;

function pctPjRegular(i: InputCalculo): number | null {
  const perfil = i.perfil_clientes ?? [];
  if (!perfil.length) return null;
  return perfil.filter((p) => p.categoria === "pj_regime_regular").reduce((s, p) => s + p.percentual, 0);
}

function decisaoSimples(i: InputCalculo, B: ResultadoCenario, C: ResultadoCenario): DecisaoSimples {
  const R = i.receita_anual;
  const n = nucleoSimples(i, 2027);
  const cB = creditoTransferido(i, "unificado");
  const cC = creditoTransferido(i, "regular");
  const reajuste = precoEquilibrio(cB, cC);
  const pj = pctPjRegular(i);

  const cargaB = B.carga_total;
  const cargaC = C.carga_total;
  const delta = pct(cargaC - cargaB, R);

  // Reajuste aplicado só sobre a receita de clientes que aproveitam o crédito.
  const fator = 1 + reajuste * (pj ?? 0);
  const deb = Number(C.detalhamento.cbs_bruto ?? 0) + Number(C.detalhamento.ibs_bruto ?? 0);
  const cred = Number(C.detalhamento.cbs_creditos ?? 0) + Number(C.detalhamento.ibs_creditos ?? 0);
  const cargaCReaj = Number(C.detalhamento.das_reduzido ?? 0) * fator + Math.max(0, deb * fator - cred);
  const rlB = R - cargaB;
  const rlC = R - cargaC;
  const rlCReaj = R * fator - cargaCReaj;

  const baseAtual = pct(baseCreditavel(i).base, R);
  const ivaEfetivoC = pct(deb, R);
  const baseMinima = ivaEfetivoC > 0 ? Math.max(0, 1 - cB / ivaEfetivoC) : 1;

  const condicoes: CondicaoDecisao[] = [
    {
      id: 1,
      titulo: "Clientes aproveitam crédito",
      ok: pj == null ? null : pj >= MIN_PJ_REGULAR,
      detalhe:
        pj == null
          ? "Perfil de clientes não informado — preencha a repartição da receita por tipo de cliente."
          : `${fmtPct(pj)} da receita vem de PJ do regime regular (mínimo ${fmtPct(MIN_PJ_REGULAR)}).`,
    },
    {
      id: 2,
      titulo: "Carga própria suportável",
      ok: delta <= reajuste,
      detalhe: `Aumento de carga de ${fmtPct(delta)} da receita contra reajuste de equilíbrio de ${fmtPct(reajuste)}.`,
    },
    {
      id: 3,
      titulo: "Base creditável relevante",
      ok: baseAtual >= baseMinima,
      detalhe: `Compras creditáveis de ${fmtPct(baseAtual)} da receita; mínimo de equilíbrio ${fmtPct(baseMinima)} (distância ${fmtPct(baseAtual - baseMinima)}).`,
    },
    {
      id: 4,
      titulo: "Repasse viável",
      ok: i.repasse_preco_confirmado == null ? null : i.repasse_preco_confirmado === true,
      detalhe:
        i.repasse_preco_confirmado === true
          ? "Repasse de preço confirmado — contratos renegociáveis até 31/12/2026."
          : "Repasse de preço não confirmado. Confirme no cadastro se os contratos podem ser renegociados até 31/12/2026.",
    },
  ];
  const recomenda = condicoes.every((c) => c.ok === true);
  const optou = i.optou_regime_regular ?? null;
  const alertaCancelamento = optou === true && !recomenda;

  const recomendacao = recomenda
    ? "Regime regular de IBS/CBS favorável: as quatro condições foram atendidas."
    : alertaCancelamento
      ? "Avaliar cancelamento da opção pelo regime regular até 20/12/2026 — prazo irretratável."
      : i.repasse_preco_confirmado === true
        ? "Manter o Simples unificado: nem todas as condições do regime regular foram atendidas."
        : "Manter o Simples unificado, salvo repasse de preço confirmado.";

  return {
    aliquota_efetiva_das: n.aliquota_efetiva,
    p_cbs: n.partilha.cbs,
    p_ibs: n.partilha.ibs,
    credito_transferido_unificado_pct: cB,
    credito_transferido_unificado_rs: cB * R,
    credito_transferido_regular_pct: cC,
    credito_transferido_regular_rs: cC * R,
    reajuste_equilibrio: reajuste,
    pct_receita_pj_regular: pj,
    carga_unificado: cargaB,
    carga_regular: cargaC,
    delta_carga_pct: delta,
    receita_liquida_unificado: rlB,
    receita_liquida_regular_sem_reajuste: rlC,
    receita_liquida_regular_com_reajuste: rlCReaj,
    ganho_regular_sem_reajuste: rlC - rlB,
    ganho_regular_com_reajuste: rlCReaj - rlB,
    base_creditavel_atual_pct: baseAtual,
    base_creditavel_minima_pct: baseMinima,
    condicoes,
    recomenda_regime_regular: recomenda,
    recomendacao,
    optou_regime_regular: optou,
    alerta_cancelamento: alertaCancelamento,
  };
}


// ---------------- Cenário 3: Lucro Presumido ----------------
function calcLPAno(i: InputCalculo, ano: 2026 | 2027): ResultadoCenario {
  const regime: RegimeKey = ano === 2026 ? "LP_2026" : "LP_2027";
  const eleg = elegibilidadePorRegime(regime, i.receita_anual);
  if (!eleg.elegivel) return inelegivel(regime, ano, eleg, i);

  const bases = basesPresumidas(i);
  const { irpj, adicional } = irpjSobreBase(bases.irpj);
  const csll = bases.csll * 0.09;

  const issAliq = issAliquota(i);
  const iss = issAliq == null ? 0 : i.receita_anual * issAliq;

  const enc = encargosFolha(i);

  let consumo = 0;
  const detalhe: Record<string, number> = {
    base_presumida_irpj: bases.irpj,
    base_presumida_csll: bases.csll,
    pct_empreitada: bases.pct_empreitada,
    pct_mao_obra_pura: 1 - bases.pct_empreitada,
    irpj: irpj + adicional,
    irpj_adicional: adicional,
    csll,
    iss,
    iss_aliquota_efetiva: issAliq ?? 0,
    cpp: enc.cpp,
    cpp_rate: enc.rate,
  };
  const obs: string[] = [
    `Presunção mista: ${fmtPct(bases.pct_empreitada)} empreitada com material (8% IRPJ / 12% CSLL) e ${fmtPct(1 - bases.pct_empreitada)} mão de obra pura (32%). Adicional de IRPJ sobre o excedente anual de R$ 240.000.`,
    obsISS(issAliq),
    obsFolha(enc),
  ];

  let cbsComp: { detalhe: LinhaCBS[]; total: number } | null = null;

  if (ano === 2026) {
    const pisCofins = i.receita_anual * 0.0365; // regime cumulativo
    detalhe.pis_cofins_cumulativo = pisCofins;
    detalhe.pis = i.receita_anual * 0.0065;
    detalhe.cofins = i.receita_anual * 0.03;
    consumo = pisCofins;
    obs.push("PIS/Cofins cumulativos (3,65%) — sem direito a crédito sobre compras.");
  } else {
    cbsComp = cbsDebito(i);
    const cbs = cbsComp.total;
    detalhe.cbs_bruto = cbs;
    detalhe.cbs_creditos = 0;
    detalhe.cbs_liquido = cbs;
    detalhe.pis = 0;
    detalhe.cofins = 0;
    consumo = cbs;
    obs.push(
      "Em 2027 a CBS substitui PIS/Cofins; no Lucro Presumido não há crédito amplo sobre compras.",
    );
    obs.push("IBS permanece em fase de teste (0,1%) em 2027 e não foi somado à carga.");
  }

  const carga = consumo + iss + irpj + adicional + csll;

  return {
    regime,
    ano,
    elegivel: true,
    carga_total: carga,
    carga_pct: pct(carga, i.receita_anual),
    cpp_anual: enc.cpp,
    fgts_anual: enc.fgts,
    encargos_folha: enc.cpp + enc.fgts,
    carga_total_com_folha: carga + enc.cpp + enc.fgts,
    lucro_liquido: resultadoAntesTributos(i) - carga,
    detalhamento: detalhe,
    ...(cbsComp ? { cbs_detalhe: cbsComp.detalhe, saldo_credor_cbs: 0 } : {}),
    observacoes: obs,
  };
}


export const calcLP = (i: InputCalculo) => calcLPAno(i, 2026);

// ---------------- Cenário 4: Lucro Real ----------------
function calcLRAno(i: InputCalculo, ano: 2026 | 2027): ResultadoCenario {
  const regime: RegimeKey = ano === 2026 ? "LR_2026" : "LR_2027";
  const issAliq = issAliquota(i);
  const iss = issAliq == null ? 0 : i.receita_anual * issAliq;
  const enc = encargosFolha(i);
  const bc = baseCreditavel(i);

  const detalhe: Record<string, number> = {
    iss,
    iss_aliquota_efetiva: issAliq ?? 0,
    cpp: enc.cpp,
    cpp_rate: enc.rate,
    base_creditavel: bc.base,
  };
  const obs: string[] = [obsISS(issAliq), obsFolha(enc)];
  if (bc.alerta) obs.push(bc.alerta);
  let consumo = 0;
  let cbsComp: { detalhe: LinhaCBS[]; total: number } | null = null;
  let saldoCredorCBS = 0;

  if (ano === 2026) {
    const bruto = i.receita_anual * 0.0925;
    const cred = calcularCreditos(i, "PIS_COFINS");
    consumo = Math.max(0, bruto - cred);
    detalhe.pis_cofins_bruto = bruto;
    detalhe.pis_cofins_creditos = cred;
    detalhe.pis_cofins_liquido = consumo;
    obs.push("PIS/Cofins não cumulativos (9,25%) com crédito amplo sobre compras.");
  } else {
    cbsComp = cbsDebito(i);
    const bruto = cbsComp.total;
    const cred = calcularCreditos(i, "CBS");
    consumo = Math.max(0, bruto - cred);
    saldoCredorCBS = Math.max(0, cred - bruto);
    detalhe.cbs_bruto = bruto;
    detalhe.cbs_creditos = cred;
    detalhe.cbs_liquido = consumo;
    detalhe.saldo_credor_cbs = saldoCredorCBS;
    detalhe.pis = 0;
    detalhe.cofins = 0;
    obs.push("CBS com crédito amplo sobre compras a partir de 2027.");
    obs.push("IBS permanece em teste (0,1%) em 2027 e não foi somado à carga.");
    if (saldoCredorCBS > 0) {
      obs.push(
        `Saldo credor de CBS de ${fmtBRL(saldoCredorCBS)}: os créditos superam o débito e não são perdidos — acumulam para compensação futura (art. 47 da LC 214/2025).`,
      );
    }
  }

  const lair = resultadoAntesTributos(i) - consumo - iss;
  const { irpj, adicional } = irpjSobreBase(lair);
  const csll = lair > 0 ? lair * 0.09 : 0;
  detalhe.lair = lair;
  detalhe.irpj = irpj + adicional;
  detalhe.irpj_adicional = adicional;
  detalhe.csll = csll;
  if (lair <= 0) obs.push("LAIR negativo: IRPJ e CSLL zerados, com prejuízo fiscal compensável em exercícios futuros.");

  const carga = consumo + iss + irpj + adicional + csll;

  return {
    regime,
    ano,
    elegivel: true,
    carga_total: carga,
    carga_pct: pct(carga, i.receita_anual),
    cpp_anual: enc.cpp,
    fgts_anual: enc.fgts,
    encargos_folha: enc.cpp + enc.fgts,
    carga_total_com_folha: carga + enc.cpp + enc.fgts,
    lucro_liquido: resultadoAntesTributos(i) - carga,
    detalhamento: detalhe,
    ...(cbsComp ? { cbs_detalhe: cbsComp.detalhe, saldo_credor_cbs: saldoCredorCBS } : {}),
    observacoes: obs,
  };
}


export const calcLR = (i: InputCalculo) => calcLRAno(i, 2026);

export function calcularTodos(i: InputCalculo): ResultadoComparativo {
  if (!(i.receita_anual > 0)) {
    throw new Error(
      "Receita bruta anual não identificada na DRE. Sem receita anualizada não é possível simular os regimes.",
    );
  }

  const cenarioA = calcSimples(i);
  const cenarioB = calcSimples2027(i);
  const cenarioC = calcHibrido(i);
  const cenarios: ResultadoCenario[] = [
    cenarioA,
    cenarioB,
    cenarioC,
    calcLPAno(i, 2026),
    calcLPAno(i, 2027),
    calcLRAno(i, 2026),
    calcLRAno(i, 2027),
  ];

  const elegiveis = cenarios.filter((c) => c.elegivel && c.carga_total > 0);
  const inelegiveis = cenarios.filter((c) => !c.elegivel);

  if (elegiveis.length === 0) {
    throw new Error("Nenhum regime elegível pôde ser calculado com os dados informados.");
  }

  // ---- Bloco 15A: decisão do Simples (cancelar ou manter o regime regular) ----
  const decisao =
    cenarioB.elegivel && cenarioC.elegivel ? decisaoSimples(i, cenarioB, cenarioC) : undefined;

  const ranking = [...elegiveis].sort((a, b) => a.carga_total - b.carga_total);
  // O regime regular (C) só pode ser recomendado se as quatro condições forem atendidas.
  const candidatos = ranking.filter((c) => c.regime !== "HIBRIDO" || decisao?.recomenda_regime_regular === true);
  const melhor = candidatos[0] ?? ranking[0];
  // A e B são o mesmo regime (Simples unificado) — a recomendação é "manter o Simples".
  const recomendado: RegimeKey = melhor.regime === "SIMPLES_2027" ? "SIMPLES" : melhor.regime;
  const economia_anual = ranking[ranking.length - 1].carga_total - melhor.carga_total;

  const bc = baseCreditavel(i);
  const enc = encargosFolha(i);
  const alertas: string[] = [];
  const a27 = aliq27(i);
  const params = parametrosDe(i);
  const rbt = rbt12Calculo(i);
  const anexoInfo = anexoCalculo(i);
  const hoje = i.data_calculo ?? hojeISO();
  const janelas = i.janelas?.length ? i.janelas : JANELAS_PADRAO;
  const jCanc = janelaCancelamento(janelas);
  const cancelamentoAberto = jCanc ? janelaAberta(jCanc, hoje) : false;

  if (decisao?.alerta_cancelamento) {
    alertas.push(
      `PRIORIDADE MÁXIMA — A empresa optou pelo regime regular de IBS/CBS e o cenário é desfavorável. ` +
        `Avaliar cancelamento até ${jCanc ? fmtDataBR(jCanc.data_fim) : "20/12/2026"} — prazo irretratável.`,
    );
  }
  if (cancelamentoAberto && jCanc && cenarioB.elegivel) {
    alertas.push(
      `Janela de cancelamento aberta até ${fmtDataBR(jCanc.data_fim)}. O cancelamento é irretratável para o período de ` +
        `${jCanc.periodo_efeito}. A resolução do Senado com a alíquota definitiva da CBS sai até 15/12/2026.`,
    );
  }
  if (params.status_aliquota !== "fixada_senado") {
    alertas.push(
      `Alíquota de referência da CBS de ${fmtPct(params.aliquota_cbs_referencia)} ainda não fixada pelo Senado ` +
        `(${params.fonte_aliquota}). CBS 2027 usada: ${fmtPct(a27.cbs)}; IBS 2027: ${fmtPct(a27.ibs)}.`,
    );
  }
  if (rbt.fonte === "DRE_ANUALIZADA") {
    alertas.push(
      "RBT12 não informada no cadastro — a faixa do Simples foi definida pela receita anualizada da DRE " +
        `(${fmtBRL(rbt.valor)}). Informe a RBT12 para a alíquota efetiva correta.`,
    );
  }
  if (anexoInfo.fator) {
    const f = anexoInfo.fator;
    if (f.zona_risco) {
      alertas.push(
        `Fator R de ${fmtPct(f.fator_r)} — zona de risco (28% a 32%). Crescimento de receita sem aumento de folha ` +
          "derruba a empresa para o Anexo V.",
      );
    } else if (f.anexo === "ANEXO_V") {
      alertas.push(
        `Fator R de ${fmtPct(f.fator_r)}: empresa no Anexo V. Faltam ${fmtBRL(f.folha_faltante_mensal)}/mês de folha ` +
          "ou pró-labore para migrar ao Anexo III — avaliar ajuste de pró-labore.",
      );
    }
    if (i.anexo !== f.anexo) {
      alertas.push(
        `Anexo do cadastro (${i.anexo.replace("_", " ")}) difere do resultado do Fator R (${f.anexo.replace("_", " ")}). ` +
          "O cálculo usou o anexo do Fator R.",
      );
    }
  }
  if (decisao) {
    const pj = decisao.pct_receita_pj_regular;
    if (pj != null && pj < 0.5) {
      alertas.push(
        "Maior parte dos clientes não aproveita crédito — o regime regular tende a ser desvantajoso.",
      );
    }
    if (decisao.base_creditavel_atual_pct < 0.1) {
      alertas.push(
        "Base creditável abaixo de 10% da receita: sem cadeia de créditos, o regime regular eleva a carga sobre a receita integral.",
      );
    }
    if ((cenarioC.saldo_credor_cbs ?? 0) > 0) {
      alertas.push(
        `Crédito maior que o débito no regime regular: saldo credor estrutural de ${fmtBRL(cenarioC.saldo_credor_cbs ?? 0)}. ` +
          "Atenção: pedir ressarcimento impede a saída do regime regular no ano corrente e no seguinte (art. 41, §5º).",
      );
    }
  }
  if ((i.pct_receita_iss_retido ?? 0) > 0.3) {
    alertas.push("Receita com retenção de ISS acima de 30%: tomadores PJ estruturados — perfil favorável ao repasse de preço.");
  }
  const fornSemCnpj = (i.fornecedores ?? []).filter((f) => "cnpj" in f && !f.cnpj).length;
  if (fornSemCnpj > 0) {
    alertas.push(
      `${fornSemCnpj} fornecedor(es) sem CNPJ no cadastro: sem CNPJ não há consulta de regime nem apuração de crédito.`,
    );
  }
  const fornSimplesEstimados = (i.fornecedores ?? []).filter(
    (f) => f.regime === "SIMPLES_SEM_HIBRIDO" && creditoSimplesFornecedor(f).estimativa,
  ).length;
  if (fornSimplesEstimados > 0) {
    alertas.push(
      `${fornSimplesEstimados} fornecedor(es) do Simples sem anexo/faixa informados: crédito estimado pela 1ª faixa do ` +
        "anexo provável pelo CNAE (LC 214/2025, art. 47, §9º, II).",
    );
  }
  if (bc.alerta) alertas.push(bc.alerta);
  if (issAliquota(i) == null) alertas.push(obsISS(null));
  if (!enc.informado || enc.cpp <= 0) alertas.push(obsFolha(enc));
  for (const alerta of i.fgts_alertas ?? []) alertas.push(alerta);

  // ---- Bloco 14: composição setorial da CBS e alertas de enquadramento ----
  const aliqBase = aliquotaBaseCBS(i);
  const comp = cbsDebito(i);
  const receitaLinhas = comp.detalhe.reduce((a, d) => a + d.base, 0);
  const aliqMedia = receitaLinhas > 0 ? comp.total / receitaLinhas : aliqBase;
  const semSegregacao = !(i.linhas_receita ?? []).some((l) => (l.valor_anualizado ?? 0) > 0);

  if (semSegregacao) {
    alertas.push(
      "Receita não segregada por linha: todos os cálculos aplicaram o regime regular (alíquota cheia). " +
        "Faça a segregação de receita no cadastro para capturar as reduções setoriais da LC 214/2025.",
    );
  }

  for (const d of comp.detalhe) {
    if (d.reducao_negada_societaria) {
      alertas.push(
        `Redução de 30% da alíquota (profissão regulamentada, art. 127 da LC 214/2025) NÃO aplicada em ` +
          `${fmtBRL(d.base)} de receita: é obrigatório que todos os sócios sejam profissionais habilitados. ` +
          `Confirme o quadro societário no cadastro do cliente.`,
      );
    }
    if (d.monofasico && d.base > 0) {
      alertas.push(
        `${fmtBRL(d.base)} de receita em regime monofásico (${d.descricao}): a CBS é recolhida pelo ` +
          `produtor/importador. Não há débito na revenda e o adquirente não toma crédito (${d.artigo}).`,
      );
    }
    if (!d.gera_credito_adquirente && d.base > 0 && !d.monofasico) {
      alertas.push(
        `${d.descricao}: a redução de ${fmtPct(d.reducao)} vem acompanhada de vedação ao crédito para o ` +
          `cliente adquirente (${d.artigo}). Isso reduz a competitividade em vendas B2B.`,
      );
    }
  }

  // ── Bloco 14B — alertas setoriais ──
  const pctB2B = i.pct_b2b ?? 0;
  const vedaCredito = comp.detalhe.some((d) => !d.gera_credito_adquirente && d.base > 0);
  if (vedaCredito && pctB2B >= 30) {
    alertas.push(
      "Seu cliente pessoa jurídica não poderá se creditar do IBS/CBS desta operação — impacto competitivo " +
        `na venda corporativa (${pctB2B.toFixed(0)}% da receita é B2B).`,
    );
  }

  const cenariosComSaldo = cenarios.filter(
    (c) => c.elegivel && c.regime !== "HIBRIDO" && (c.saldo_credor_cbs ?? 0) > 0,
  );
  for (const c of cenariosComSaldo) {
    alertas.push(
      `Acúmulo de saldo credor de CBS de ${fmtBRL(c.saldo_credor_cbs ?? 0)} no cenário ${c.regime} — ` +
        "avaliar aproveitamento e efeito no fluxo de caixa.",
    );
  }

  if ((i.regime_atual ?? "").startsWith("SIMPLES") && pctB2B >= 30) {
    alertas.push(
      "O Simples transfere ao adquirente apenas o crédito equivalente ao valor pago no DAS — risco de perda " +
        "de competitividade frente a concorrente do regime normal nas vendas B2B.",
    );
  }

  if (comp.detalhe.filter((d) => d.base > 0).length > 1) {
    alertas.push(
      "Mais de uma linha de receita identificada: a segregação é obrigatória na emissão da nota fiscal. " +
        "Aplicação indevida de alíquota reduzida gera passivo fiscal.",
    );
  }

  if (i.socios_habilitados === false && comp.detalhe.some((d) => d.reducao_negada_societaria)) {
    alertas.push(
      "Estrutura societária impede a redução de 30% do art. 127 da LC 214/2025 — avaliar reorganização antes de 2027.",
    );
  }

  if (i.tem_patrimonio_afetacao === true) {
    alertas.push(
      "Receita de incorporação com patrimônio de afetação pode ficar sujeita ao RET (4% sobre a receita recebida, " +
        "sem crédito) e sair da comparação Lucro Presumido × Lucro Real — arts. 485 e 486 da LC 214/2025. " +
        "Análise complementar necessária.",
    );
  }

  const fornSemCnae = (i.fornecedores ?? []).filter((f) => !f.cnae && !f.tipo_receita).length;
  if (fornSemCnae > 0) {
    alertas.push(
      `${fornSemCnae} fornecedor(es) sem CNAE identificado foram tratados como regime regular. ` +
        `Setores com vedação legal ao crédito (combustível, bar/restaurante, hotelaria) podem reduzir o crédito real.`,
    );
  }

  // Reconciliação: lucro líquido do LP 2026 vs resultado da DRE anualizado
  const rat = resultadoAntesTributos(i);

  return {
    cenarios,
    recomendado,
    economia_anual,
    ranking,
    inelegiveis,
    receita_anual: i.receita_anual,
    receita_liquida_anual: receitaLiquida(i),
    margem_bruta: margemBruta(i),
    resultado_antes_tributos: rat,
    base_creditavel: bc.base,
    base_creditavel_fonte: bc.fonte,
    meses_dre: i.meses_dre,
    fator_anualizacao: i.fator_anualizacao,
    alertas,
    cbs_detalhe: comp.detalhe,
    cbs_aliquota_base: aliqBase,
    cbs_aliquota_media_efetiva: aliqMedia,
    socios_habilitados: i.socios_habilitados ?? null,
    versao_engine: ENGINE_VERSAO,
    data_base_calculo: new Date().toISOString(),
    saldo_credor_cbs:
      cenarios.find((c) => c.regime === recomendado)?.saldo_credor_cbs ??
      Math.max(...cenarios.map((c) => c.saldo_credor_cbs ?? 0), 0),
    parametros_reforma: params,
    aliquotas_2027: a27,
    rbt12_utilizada: rbt.valor,
    rbt12_fonte: rbt.fonte,
    anexo_utilizado: anexoInfo.anexo,
    fator_r: anexoInfo.fator,
    simples_decisao: decisao,
    janela_cancelamento_aberta: cancelamentoAberto,
    premissas: {
      anexo: i.anexo,
      setor: i.setor,
      iss_aliquota_efetiva: issAliquota(i) ?? 0,
      cpp_rate: enc.rate,
      cpp_anual: enc.cpp,
      fgts_anual: enc.fgts,
      folha_informada: Boolean(enc.informado && enc.cpp > 0),
      folha_base_anual: i.folha_base_anual,
      base_fgts_anual: i.base_fgts_anual,
      compras_anuais: comprasTotais(i),
      base_creditavel: bc.base,
      base_creditavel_fonte: bc.fonte,
      margem_bruta: margemBruta(i),
      resultado_antes_tributos: rat,
      cbs_rate: aliqBase,
      cbs_aliquota_media_efetiva: aliqMedia,
      receita_segregada: !semSegregacao,
      socios_habilitados: i.socios_habilitados ?? false,
      ibs_rate: a27.ibs,
      aliquota_cbs_referencia: params.aliquota_cbs_referencia,
      status_aliquota: params.status_aliquota,
      rbt12_utilizada: rbt.valor,
      anexo_utilizado: anexoInfo.anexo,
      versao_engine: ENGINE_VERSAO,
    },
  };
}

