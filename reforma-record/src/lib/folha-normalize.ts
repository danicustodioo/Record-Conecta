// Normaliza os dados extraídos da Folha de Pagamento.
// Os PDFs do Domínio vêm em layouts diferentes (Folha, Resumo Geral, GFIP,
// por tomador/locação), então a IA devolve estruturas heterogêneas:
// totais / totais_gerais / consolidado_empresa / resumo_geral / resumo_tributario,
// às vezes só dentro de arrays (tomadores, folhas, locacoes, paginas).
// Este módulo achata tudo em competências canônicas para o motor de cálculo.

export type CompetenciaFolha = {
  competencia: string | null;
  total_proventos: number;
  base_fgts: number;
  valor_fgts: number;
  fgts_extraido: number;
  fgts_esperado: number;
  fgts_divergencia_pct: number;
  alertas: string[];
  inss_empregados: number;
  inss_prolabore: number;
  gps_total: number;
};

export type ResumoFolha = {
  competencias: CompetenciaFolha[];
  meses: number;
  proventos_anual: number;
  base_fgts_anual: number;
  fgts_anual: number;
  cpp_anual: number;
  inss_empregados_anual: number;
  inss_prolabore_anual: number;
  alertas: string[];
};

const SUMMARY_RE = /^(totais|totais_gerais|total|consolidado|consolidado_empresa|resumo|resumo_geral|resumo_tributario|totalizador)/i;
const SKIP_ARRAYS = new Set(["colaboradores", "funcionarios", "empregados", "socios"]);

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Busca UM alias em profundidade. Objetos de resumo têm prioridade; arrays são somados. */
function buscarAlias(obj: unknown, alias: string, depth = 0): number {
  if (!obj || typeof obj !== "object" || depth > 4) return 0;
  const rec = obj as Record<string, unknown>;

  const direto = rec[alias];
  if (typeof direto === "number" || typeof direto === "string") {
    const n = num(direto);
    if (n) return n;
  }

  for (const [k, v] of Object.entries(rec)) {
    if (v && typeof v === "object" && !Array.isArray(v) && SUMMARY_RE.test(k)) {
      const n = buscarAlias(v, alias, depth + 1);
      if (n) return n;
    }
  }

  let soma = 0;
  for (const [k, v] of Object.entries(rec)) {
    if (Array.isArray(v) && !SKIP_ARRAYS.has(k)) {
      for (const item of v) soma += buscarAlias(item, alias, depth + 1);
    }
  }
  if (soma) return soma;

  for (const [k, v] of Object.entries(rec)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !SUMMARY_RE.test(k)) {
      const n = buscarAlias(v, alias, depth + 1);
      if (n) return n;
    }
  }
  return 0;
}

/** Primeiro alias com valor, respeitando a ordem de prioridade. */
function buscar(obj: unknown, aliases: string[]): number {
  for (const a of aliases) {
    const n = buscarAlias(obj, a);
    if (n) return n;
  }
  return 0;
}

function pctDivergencia(valor: number, esperado: number): number {
  if (!(valor > 0) || !(esperado > 0)) return 0;
  return Math.abs(valor - esperado) / esperado;
}

function textoCompetencia(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of ["competencia", "ano_mes", "mes_ano", "periodo"]) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

function normalizarCompetencia(raw: unknown): CompetenciaFolha {
  const total_proventos = buscar(raw, ["total_proventos", "proventos"]);
  const baseFgtsExtraida = buscar(raw, ["base_fgts_total", "base_fgts_mensal", "base_fgts"]);
  const base_fgts = baseFgtsExtraida > 0 ? baseFgtsExtraida : 0;
  const fgts_esperado = base_fgts > 0 ? base_fgts * 0.08 : 0;

  // FGTS da competência = depósito mensal. Não somar R.A., 13º ou provisões,
  // nem pegar o maior valor: isso duplica locações/funcionários e superestima.
  const totalGfip = buscar(raw, ["fgts_total_gfip", "total_gfip", "valor_fgts", "fgts_valor"]);
  const fgtsMensal = buscar(raw, ["fgts_rm", "fgts_remuneracao_mensal", "fgts_mensal", "fgts_mes"]);
  const fgts_extraido = totalGfip > 0 ? totalGfip : fgtsMensal;
  const divergencia = pctDivergencia(fgts_extraido, fgts_esperado);
  const alertas: string[] = [];

  if (fgts_extraido > 0 && fgts_esperado > 0 && divergencia > 0.15) {
    alertas.push(
      `FGTS da competência ${textoCompetencia(raw) ?? "sem data"} diverge mais de 15% de 8% da base de FGTS declarada: extraído ${fgts_extraido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, referência ${fgts_esperado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Verificar se há afastamentos, verbas sem incidência de FGTS ou diferença no resumo da folha.`,
    );
  }

  const valor_fgts = fgts_esperado > 0 ? fgts_esperado : fgts_extraido;
  return {
    competencia: textoCompetencia(raw),
    total_proventos,
    base_fgts,
    valor_fgts,
    fgts_extraido,
    fgts_esperado,
    fgts_divergencia_pct: divergencia,
    alertas,

    inss_empregados: buscar(raw, ["inss_colaborador", "inss_empregados", "inss_retido"]),
    inss_prolabore: buscar(raw, ["inss_contribuinte_individual", "inss_prolabore"]),
    // Custo previdenciário do empregador = "TOTAL PARTE EMPRESA" (CPP + RAT + terceiros).
    // A GPS total inclui a retenção dos empregados, que não é custo da empresa,
    // então só serve como fallback quando a parte patronal não foi extraída.
    gps_total:
      buscar(raw, ["cpp_patronal", "total_parte_empresa", "parte_empresa", "cpp"]) ||
      buscar(raw, ["gps_total", "inss_total_gps", "inss_gps", "gps"]),
  };
}

/** Média dos meses com dado × 12 (meses sem dado não puxam o total para baixo). */
function anualizar(valores: number[]): number {
  const validos = valores.filter((v) => v > 0);
  if (!validos.length) return 0;
  return (validos.reduce((a, v) => a + v, 0) / validos.length) * 12;
}

/** Achata `dados_folha` em competências canônicas + totais anualizados. */
export function resumirFolha(dados: unknown): ResumoFolha {
  const raiz = (dados ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(raiz.competencias)
    ? (raiz.competencias as unknown[])
    : Array.isArray(dados)
      ? (dados as unknown[])
      : [dados];

  const competencias = lista
    .map(normalizarCompetencia)
    .filter((c) => c.total_proventos > 0 || c.base_fgts > 0 || c.gps_total > 0);

  return {
    competencias,
    meses: competencias.length,
    proventos_anual: anualizar(competencias.map((c) => c.total_proventos)),
    base_fgts_anual: anualizar(competencias.map((c) => c.base_fgts)),
    fgts_anual: anualizar(competencias.map((c) => c.valor_fgts)),
    cpp_anual: anualizar(competencias.map((c) => c.gps_total)),
    inss_empregados_anual: anualizar(competencias.map((c) => c.inss_empregados)),
    inss_prolabore_anual: anualizar(competencias.map((c) => c.inss_prolabore)),
    alertas: competencias.flatMap((c) => c.alertas),
  };
}
