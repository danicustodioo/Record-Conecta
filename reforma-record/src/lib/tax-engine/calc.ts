// Engine de cálculo dos cenários tributários (2026 e 2027).
// Funções puras — entrada/saída JSON serializável.
// Bloco 13: presunção mista, ISS efetivo obrigatório, CPP/FGTS da folha,
// base creditável estimada e lucro líquido sem dupla contagem.
// Bloco 14 (v14): CBS resolvida por linha de receita (enquadramento setorial
// da LC 214/2025) e crédito de fornecedor com dimensão setorial.

import { REFORMA, terceirosPorSetor, type Anexo } from "./reforma";
import { aliquotaEfetiva, encontrarFaixa } from "./simples-tabelas";
import { elegibilidadePorRegime, type Elegibilidade, type RegimeKey } from "./elegibilidade";
import {
  ENGINE_VERSAO,
  REGIMES_SETORIAIS_FALLBACK,
  creditoFornecedor as creditoSetorialFornecedor,
  debitoCBS,
  regimePorTipo,
  type LinhaCBS,
  type LinhaReceita,
  type RegimeSetorial,
} from "@/lib/enquadramento";


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
    compras_anuais: number;
    tipo_receita?: string | null; // enquadramento setorial do fornecedor (Bloco 14)
    cnae?: string | null;
  }>;
  // ---- Bloco 14 ----
  linhas_receita?: LinhaReceita[]; // segregação de receita anualizada por tipo
  regimes_setoriais?: Record<string, RegimeSetorial>;
  socios_habilitados?: boolean | null;
  aliquota_cbs_base?: number; // default REFORMA.CBS_RATE
  // ---- Bloco 14B: alertas setoriais ----
  regime_atual?: string | null;
  tem_patrimonio_afetacao?: boolean | null;
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
}


// ─────────── Bloco 14: CBS por linha de receita ───────────

function aliquotaBaseCBS(i: InputCalculo): number {
  const a = i.aliquota_cbs_base;
  return a != null && isFinite(a) && a > 0 ? a : REFORMA.CBS_RATE;
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

// Bloco 14: crédito de fornecedor depende do regime tributário E do setor.
// Setores com vedação legal (arts. 174, 276, 283) não geram crédito ao adquirente.
function creditosPorFornecedor(
  fornecedores: InputCalculo["fornecedores"],
  tipo: "CBS" | "IBS" | "PIS_COFINS",
  regimes: Record<string, RegimeSetorial>,
  aliquotaCBS: number,
): number {
  if (!fornecedores) return 0;
  let total = 0;
  for (const f of fornecedores) {
    const setor = regimePorTipo(f.tipo_receita ?? "regular", regimes);

    if (tipo === "CBS") {
      const regimeTrib =
        f.regime === "NORMAL" || f.regime === "SIMPLES_HIBRIDO"
          ? "normal"
          : f.regime === "SIMPLES_SEM_HIBRIDO"
            ? "simples"
            : "irregular";
      total += creditoSetorialFornecedor(f.compras_anuais, regimeTrib, setor, aliquotaCBS);
      continue;
    }

    if (!setor.gera_credito_adquirente || setor.monofasico) continue;
    const fatorSetor = 1 - setor.reducao;

    if (f.regime === "SIMPLES_SEM_HIBRIDO" && f.anexo) {
      const aliq = tipo === "IBS" ? REFORMA.SIMPLES_IBS_NO_DAS[f.anexo] ?? 0.015 : 0;
      total += f.compras_anuais * aliq * fatorSetor;
    } else if (f.regime === "DESCONHECIDO") {
      // sem crédito
    } else {
      const rate = tipo === "IBS" ? REFORMA.IBS_RATE : 0.0925;
      total += f.compras_anuais * rate * fatorSetor;
    }
  }
  return total;
}

function calcularCreditos(i: InputCalculo, tipo: "CBS" | "IBS" | "PIS_COFINS"): number {
  const bc = baseCreditavel(i);
  const regimes = regimesDe(i);
  const aliqCBS = aliquotaBaseCBS(i);
  if (bc.fonte === "FORNECEDORES")
    return creditosPorFornecedor(i.fornecedores, tipo, regimes, aliqCBS);
  const rate = tipo === "CBS" ? aliqCBS : tipo === "IBS" ? REFORMA.IBS_RATE : 0.0925;
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

// ---------------- Cenário 1: Simples Nacional (2026) ----------------
export function calcSimples(i: InputCalculo): ResultadoCenario {
  const eleg = elegibilidadePorRegime("SIMPLES", i.receita_anual);
  if (!eleg.elegivel) return inelegivel("SIMPLES", 2026, eleg, i);

  const aliq = aliquotaEfetiva(i.receita_anual, i.anexo);
  const f = encontrarFaixa(i.receita_anual, i.anexo);
  const das = i.receita_anual * aliq;
  const enc = encargosFolha(i);
  const cppSeparado = i.anexo === "ANEXO_IV" ? enc.cpp : 0; // Anexo IV: CPP fora do DAS
  const carga = das;

  return {
    regime: "SIMPLES",
    ano: 2026,
    elegivel: true,
    carga_total: carga,
    carga_pct: pct(carga, i.receita_anual),
    cpp_anual: cppSeparado,
    fgts_anual: enc.fgts,
    encargos_folha: cppSeparado + enc.fgts,
    carga_total_com_folha: carga + cppSeparado + enc.fgts,
    lucro_liquido: resultadoAntesTributos(i) - carga,
    detalhamento: {
      aliquota_efetiva: aliq,
      das_anual: das,
      irpj: das * f.irpj,
      csll: das * f.csll,
      cofins: das * f.cofins,
      pis: das * f.pis,
      cpp: cppSeparado || das * f.cpp,
      iss_ou_ipi: das * f.iss_ou_ipi,
    },
    observacoes: [
      i.anexo === "ANEXO_IV"
        ? "Anexo IV: CPP patronal é recolhida FORA do DAS."
        : "CPP embutido no DAS — não há CPP separado.",
      obsFolha(enc),
    ],
  };
}

// ---------------- Cenário 2: Simples Híbrido (IBS/CBS fora do DAS) ----------------
export function calcHibrido(i: InputCalculo): ResultadoCenario {
  const eleg = elegibilidadePorRegime("HIBRIDO", i.receita_anual);
  if (!eleg.elegivel) return inelegivel("HIBRIDO", 2027, eleg, i);

  const aliqEfet = aliquotaEfetiva(i.receita_anual, i.anexo);
  const cbsNoDas = REFORMA.SIMPLES_CBS_NO_DAS[i.anexo] ?? 0.014;
  const ibsNoDas = REFORMA.SIMPLES_IBS_NO_DAS[i.anexo] ?? 0.028;
  const aliqDasReduzida = Math.max(0, aliqEfet - cbsNoDas - ibsNoDas);
  const dasReduzido = i.receita_anual * aliqDasReduzida;

  const cbsComp = cbsDebito(i);
  const cbsBruto = cbsComp.total;
  const cbsCred = calcularCreditos(i, "CBS");
  const cbsLiq = Math.max(0, cbsBruto - cbsCred);
  const saldoCredorCBS = Math.max(0, cbsCred - cbsBruto);


  const ibsBruto = i.receita_anual * REFORMA.IBS_RATE;
  const ibsCred = calcularCreditos(i, "IBS");
  const ibsLiq = Math.max(0, ibsBruto - ibsCred);

  const enc = encargosFolha(i);
  const cppSeparado = i.anexo === "ANEXO_IV" ? enc.cpp : 0;
  const carga = dasReduzido + cbsLiq + ibsLiq;

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
      das_reduzido: dasReduzido,
      cbs_bruto: cbsBruto,
      cbs_creditos: cbsCred,
      cbs_liquido: cbsLiq,
      ibs_bruto: ibsBruto,
      ibs_creditos: ibsCred,
      ibs_liquido: ibsLiq,
      cpp: cppSeparado,
      split_payment_pct: pct(cbsBruto + ibsBruto, i.receita_anual),
    },
    cbs_detalhe: cbsComp.detalhe,
    saldo_credor_cbs: saldoCredorCBS,
    observacoes: [
      "IBS e CBS fora do DAS, com crédito amplo de fornecedores.",
      "Recomendado quando o percentual de receita B2B é alto (clientes podem creditar IBS/CBS).",
      obsFolha(enc),
    ],
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

  const cenarios: ResultadoCenario[] = [
    calcSimples(i),
    calcHibrido(i),
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

  const ranking = [...elegiveis].sort((a, b) => a.carga_total - b.carga_total);
  const recomendado = ranking[0].regime;
  const economia_anual = ranking[ranking.length - 1].carga_total - ranking[0].carga_total;

  const bc = baseCreditavel(i);
  const enc = encargosFolha(i);
  const alertas: string[] = [];
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

  const cenariosComSaldo = cenarios.filter((c) => c.elegivel && (c.saldo_credor_cbs ?? 0) > 0);
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
      ibs_rate: REFORMA.IBS_RATE,
      versao_engine: ENGINE_VERSAO,
    },
  };
}

