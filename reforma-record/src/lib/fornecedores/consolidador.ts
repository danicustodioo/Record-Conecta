// Consolidação de múltiplos PDFs de FORNECEDORES por nome normalizado,
// com anualização baseada no período total coberto.

import { classificarFornecedores, type FornecedorBruto, type FornecedorClassificado } from "./classificador";

export interface ArquivoFornecedoresExtraido {
  empresa_cliente_nome?: string | null;
  empresa_cliente_cnpj?: string | null;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
  total_geral?: number | null;
  fornecedores: FornecedorBruto[];
}

export interface DadosFornecedoresConsolidados {
  fornecedores_classificados: FornecedorClassificado[];
  total_compras_periodo: number;
  total_compras_anuais: number;
  meses_cobertos: number;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  empresa_cliente_nome: string | null;
  empresa_cliente_cnpj: string | null;
  qtd_arquivos: number;
}

function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateBR(s?: string | null): Date | null {
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  if (iso) return new Date(s);
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  return null;
}

function diffMeses(a: Date, b: Date): number {
  const meses = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  return Math.max(1, meses);
}

export function consolidarMultiplosArquivos(
  arquivos: ArquivoFornecedoresExtraido[],
): DadosFornecedoresConsolidados {
  const merged = new Map<string, FornecedorBruto>();
  let dataMin: Date | null = null;
  let dataMax: Date | null = null;
  let empresaNome: string | null = null;
  let empresaCnpj: string | null = null;

  for (const arq of arquivos) {
    if (!empresaNome && arq.empresa_cliente_nome) empresaNome = arq.empresa_cliente_nome;
    if (!empresaCnpj && arq.empresa_cliente_cnpj) empresaCnpj = arq.empresa_cliente_cnpj;
    const dInicio = parseDateBR(arq.periodo_inicio);
    const dFim = parseDateBR(arq.periodo_fim);
    if (dInicio && (!dataMin || dInicio < dataMin)) dataMin = dInicio;
    if (dFim && (!dataMax || dFim > dataMax)) dataMax = dFim;

    for (const f of arq.fornecedores ?? []) {
      const key = normalizarNome(f.nome ?? "");
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...f, nome: key });
      } else {
        existing.valor_contabil_total =
          (existing.valor_contabil_total ?? 0) + (f.valor_contabil_total ?? 0);
        existing.base_calculo = (existing.base_calculo ?? 0) + (f.base_calculo ?? 0);
        existing.valor_ipi = (existing.valor_ipi ?? 0) + (f.valor_ipi ?? 0);
        existing.linhas_nf = (existing.linhas_nf ?? 0) + (f.linhas_nf ?? 0);
        existing.tem_icms = existing.tem_icms || f.tem_icms;
        existing.tem_iss = existing.tem_iss || f.tem_iss;
      }
    }
  }

  const meses = dataMin && dataMax ? diffMeses(dataMin, dataMax) : 12;
  const lista = Array.from(merged.values());
  const total_periodo = lista.reduce((s, f) => s + (f.valor_contabil_total ?? 0), 0);
  const fator = 12 / meses;

  // Anualiza valor por fornecedor
  const classificados = classificarFornecedores(lista).map((f) => ({
    ...f,
    valor_anual: (f.valor_contabil_total ?? 0) * fator,
  }));

  return {
    fornecedores_classificados: classificados,
    total_compras_periodo: total_periodo,
    total_compras_anuais: total_periodo * fator,
    meses_cobertos: meses,
    periodo_inicio: dataMin ? dataMin.toISOString().slice(0, 10) : null,
    periodo_fim: dataMax ? dataMax.toISOString().slice(0, 10) : null,
    empresa_cliente_nome: empresaNome,
    empresa_cliente_cnpj: empresaCnpj,
    qtd_arquivos: arquivos.length,
  };
}
