// Elegibilidade legal por regime tributário (LC 123/2006 e Lei 9.718/1998).
// Um regime inelegível NUNCA pode ser recomendado, mesmo que a carga simulada seja menor.

export const TETO_SIMPLES = 4_800_000;
export const TETO_LUCRO_PRESUMIDO = 78_000_000;

export type RegimeKey = "SIMPLES" | "HIBRIDO" | "LP_2026" | "LP_2027" | "LR_2026" | "LR_2027";

export interface Elegibilidade {
  elegivel: boolean;
  motivo?: string;
  base_legal?: string;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function elegibilidadeSimples(receitaAnual: number): Elegibilidade {
  const base = receitaAnual;
  if (base <= 0) {
    return {
      elegivel: false,
      motivo: "Receita bruta anual não informada — impossível verificar o enquadramento no Simples Nacional.",
      base_legal: "LC 123/2006, art. 3º, II",
    };
  }
  if (base > TETO_SIMPLES) {
    const vezes = base / TETO_SIMPLES;
    return {
      elegivel: false,
      motivo: `Receita bruta anual de ${fmt(base)} excede o teto do Simples Nacional (${fmt(TETO_SIMPLES)}) em ${vezes.toFixed(1)}×. A empresa está legalmente impedida de optar por este regime.`,
      base_legal: "LC 123/2006, art. 3º, II",
    };
  }
  return { elegivel: true };
}

export function elegibilidadeLucroPresumido(receitaAnual: number): Elegibilidade {
  if (receitaAnual > TETO_LUCRO_PRESUMIDO) {
    return {
      elegivel: false,
      motivo: `Receita bruta anual de ${fmt(receitaAnual)} excede o limite do Lucro Presumido (${fmt(TETO_LUCRO_PRESUMIDO)}). A empresa é obrigada ao Lucro Real.`,
      base_legal: "Lei 9.718/1998, art. 14, I",
    };
  }
  return { elegivel: true };
}

export function elegibilidadePorRegime(
  regime: RegimeKey,
  receitaAnual: number,
): Elegibilidade {
  switch (regime) {
    case "SIMPLES":
    case "HIBRIDO":
      return elegibilidadeSimples(receitaAnual);
    case "LP_2026":
    case "LP_2027":
      return elegibilidadeLucroPresumido(receitaAnual);
    default:
      return { elegivel: true };
  }
}
