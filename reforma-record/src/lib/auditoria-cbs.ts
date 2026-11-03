// Auditoria do cálculo de CBS 2027: expõe os números intermediários do motor
// (anualização, redução setorial, débito, crédito e saldo credor) para PDF e PPTX.
// Fonte única de verdade, sem recalcular nada — apenas lê o resultado da engine.

export type LinhaAuditoriaCBS = {
  tipo_receita: string;
  descricao: string;
  base: number;
  reducao: number;
  aliquota_efetiva: number;
  cbs: number;
  artigo: string;
  monofasico: boolean;
  reducao_negada_societaria: boolean;
};

export type AuditoriaCenarioCBS = {
  regime: string;
  rotulo: string;
  debito_bruto: number;
  creditos: number;
  cbs_liquido: number;
  saldo_credor: number;
  base_creditavel: number;
  linhas: LinhaAuditoriaCBS[];
};

export type AuditoriaCBS = {
  meses_dre: number | null;
  fator_anualizacao: number;
  receita_periodo: number | null;
  receita_anualizada: number;
  aliquota_base: number;
  versao_engine: string;
  data_base: string | null;
  conferido_por: string | null;
  socios_habilitados: boolean | null;
  cenarios: AuditoriaCenarioCBS[];
};

type CenarioLike = {
  regime: string;
  ano?: number;
  elegivel?: boolean;
  detalhamento?: Record<string, number> | null;
  cbs_detalhe?: Array<Record<string, unknown>> | null;
  saldo_credor_cbs?: number | null;
};

type ResultadosLike = {
  cenarios?: CenarioLike[];
  receita_anual?: number | null;
  meses_dre?: number | null;
  fator_anualizacao?: number | null;
  versao_engine?: string | null;
  cbs_aliquota_media_efetiva?: number | null;
  cbs_aliquota_base?: number | null;
} | null;

const ROTULOS: Record<string, string> = {
  LP_2027: "Lucro Presumido 2027",
  LR_2027: "Lucro Real 2027",
  HIBRIDO: "Simples Híbrido 2027",
  SIMPLES: "Simples Nacional 2027",
};

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function montarAuditoriaCBS(params: {
  resultados: ResultadosLike;
  analise?: {
    aliquota_cbs_utilizada?: number | null;
    data_base_calculo?: string | null;
    versao_engine?: string | null;
    conferido_por?: string | null;
    dados_dre?: Record<string, number | null> | null;
  } | null;
  cliente?: { socios_habilitados?: boolean | null } | null;
}): AuditoriaCBS | null {
  const r = params.resultados;
  if (!r || !Array.isArray(r.cenarios)) return null;

  const relevantes = r.cenarios.filter(
    (c) => c.elegivel !== false && (c.cbs_detalhe?.length || num(c.detalhamento?.cbs_bruto) > 0),
  );
  if (!relevantes.length) return null;

  const meses = r.meses_dre != null && Number(r.meses_dre) > 0 ? Number(r.meses_dre) : null;
  const fator = r.fator_anualizacao && r.fator_anualizacao > 0 ? Number(r.fator_anualizacao) : meses ? 12 / meses : 0;
  const receitaAnualizada = num(r.receita_anual);
  const receitaPeriodo =
    num(params.analise?.dados_dre?.receita_bruta_total) > 0
      ? num(params.analise?.dados_dre?.receita_bruta_total)
      : fator > 0
        ? receitaAnualizada / fator
        : null;

  const cenarios: AuditoriaCenarioCBS[] = relevantes.map((c) => {
    const d = c.detalhamento ?? {};
    const linhas: LinhaAuditoriaCBS[] = (c.cbs_detalhe ?? []).map((l) => ({
      tipo_receita: String(l.tipo_receita ?? "regular"),
      descricao: String(l.descricao ?? l.descricao_livre ?? "Receita"),
      base: num(l.base),
      reducao: num(l.reducao),
      aliquota_efetiva: num(l.aliquota_efetiva),
      cbs: num(l.cbs),
      artigo: String(l.artigo ?? ""),
      monofasico: Boolean(l.monofasico),
      reducao_negada_societaria: Boolean(l.reducao_negada_societaria),
    }));

    const debito = num(d.cbs_bruto) || linhas.reduce((a, l) => a + l.cbs, 0);
    const creditos = num(d.cbs_creditos);
    return {
      regime: c.regime,
      rotulo: ROTULOS[c.regime] ?? c.regime,
      debito_bruto: debito,
      creditos,
      cbs_liquido: num(d.cbs_liquido) || Math.max(0, debito - creditos),
      saldo_credor: num(c.saldo_credor_cbs) || num(d.saldo_credor_cbs) || Math.max(0, creditos - debito),
      base_creditavel: num(d.base_creditavel),
      linhas,
    };
  });

  // A alíquota BASE é única e parametrizada (parametros_calculo.aliquota_cbs).
  // Nunca usar a média efetiva por linha (base × (1 − redução)) aqui.
  const aliquotaBase = num(r.cbs_aliquota_base) || 0.088;


  return {
    meses_dre: meses,
    fator_anualizacao: fator,
    receita_periodo: receitaPeriodo,
    receita_anualizada: receitaAnualizada,
    aliquota_base: aliquotaBase,
    versao_engine: params.analise?.versao_engine ?? r.versao_engine ?? "v14",
    data_base: params.analise?.data_base_calculo ?? null,
    conferido_por: params.analise?.conferido_por ?? null,
    socios_habilitados: params.cliente?.socios_habilitados ?? null,
    cenarios,
  };
}

/** Notas explicativas da auditoria, derivadas dos próprios números. */
export function notasAuditoriaCBS(a: AuditoriaCBS): string[] {
  const notas: string[] = [];
  if (a.meses_dre && a.meses_dre < 12) {
    notas.push(
      `Anualização: a DRE cobre ${a.meses_dre} ${a.meses_dre === 1 ? "mês" : "meses"}; todas as bases foram multiplicadas pelo fator ${a.fator_anualizacao.toFixed(4)} antes do cálculo da CBS.`,
    );
  } else {
    notas.push("Anualização: período da DRE não informado no resultado — revise a memória de cálculo antes de enviar ao cliente.");
  }
  notas.push(
    `Alíquota base de CBS: ${(a.aliquota_base * 100).toFixed(3)}%. A alíquota efetiva de cada linha é a base multiplicada por (1 − redução setorial da LC 214/2025).`,
  );
  if (a.cenarios.some((c) => c.linhas.some((l) => l.monofasico))) {
    notas.push("Linhas monofásicas têm alíquota efetiva zero: a CBS foi recolhida em etapa anterior da cadeia.");
  }
  if (a.cenarios.some((c) => c.linhas.some((l) => l.reducao_negada_societaria))) {
    notas.push(
      "Redução de 30% negada em uma ou mais linhas: requisito societário do art. 127, §1º, II não confirmado — aplicada a alíquota cheia.",
    );
  }
  const lp = a.cenarios.find((c) => c.regime === "LP_2027");
  if (lp) notas.push("Lucro Presumido 2027: regime cumulativo — sem crédito amplo sobre compras, logo CBS líquida igual ao débito bruto.");
  const comSaldo = a.cenarios.filter((c) => c.saldo_credor > 0);
  for (const c of comSaldo) {
    notas.push(
      `${c.rotulo}: créditos superam o débito em ${c.saldo_credor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} — o excedente não é perdido, acumula como saldo credor para compensação futura (art. 47 da LC 214/2025).`,
    );
  }
  if (a.conferido_por) notas.push(`Documentos conferidos por: ${a.conferido_por}. Versão da engine: ${a.versao_engine}.`);
  else notas.push(`Versão da engine de cálculo: ${a.versao_engine}.`);
  return notas;
}
