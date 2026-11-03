// Engine de cálculo de créditos tributários por fornecedor × cenário.
// Espelha a especificação Parte 4 do módulo de Fornecedores.

import type { FornecedorClassificado } from "./classificador";

export const CBS = 0.088;
export const IBS = 0.177;
export const IVA = 0.265;

export type CenarioCredito = "LR_2027" | "HIBRIDO_2027" | "LP_2027" | "SIMPLES_2027";

export interface CreditoFornecedor {
  credito_cbs: number;
  credito_ibs: number;
  credito_total: number;
  nivel: "INTEGRAL" | "LIMITADO" | "MINIMO" | "CUMULATIVO" | "RISCO";
  taxa_efetiva?: number;
  cor: "verde" | "amarelo" | "vermelho" | "cinza";
  credito_perdido?: number;
  descricao: string;
}

function valorAnual(f: FornecedorClassificado): number {
  return f.valor_anual ?? f.valor_contabil_total ?? 0;
}

export function calcularCreditoFornecedor(
  f: FornecedorClassificado,
  cenario: CenarioCredito,
): CreditoFornecedor {
  const compras = valorAnual(f);

  if (cenario === "LR_2027" || cenario === "HIBRIDO_2027") {
    if (f.regime === "NORMAL") {
      return {
        credito_cbs: compras * CBS,
        credito_ibs: compras * IBS,
        credito_total: compras * IVA,
        nivel: "INTEGRAL",
        taxa_efetiva: IVA,
        cor: "verde",
        descricao: "Crédito integral de CBS e IBS — fornecedor em regime normal",
      };
    }
    if (f.regime === "SIMPLES" && f.opcao_hibrido === true) {
      return {
        credito_cbs: compras * CBS,
        credito_ibs: compras * IBS,
        credito_total: compras * IVA,
        nivel: "INTEGRAL",
        taxa_efetiva: IVA,
        cor: "verde",
        descricao: "Crédito integral — fornecedor Simples optou pelo Híbrido",
      };
    }
    if (f.regime === "SIMPLES") {
      const aliq = f.aliquota_das_estimada ?? 0.10;
      const taxa_cbs = aliq * 0.34;
      const taxa_ibs = aliq * 0.25;
      const credito_cbs = compras * taxa_cbs;
      const credito_ibs = compras * taxa_ibs;
      const credito_total = credito_cbs + credito_ibs;
      const credito_perdido = compras * IVA - credito_total;
      return {
        credito_cbs,
        credito_ibs,
        credito_total,
        nivel: "LIMITADO",
        taxa_efetiva: taxa_cbs + taxa_ibs,
        cor: "amarelo",
        credito_perdido,
        descricao: `Crédito limitado — Simples sem Híbrido. Perde R$ ${credito_perdido.toFixed(0)}/ano vs. regime normal`,
      };
    }
    // DESCONHECIDO
    return {
      credito_cbs: 0,
      credito_ibs: 0,
      credito_total: 0,
      nivel: "RISCO",
      taxa_efetiva: 0,
      cor: "vermelho",
      credito_perdido: compras * IVA,
      descricao: "Regime não identificado — classificar manualmente para calcular crédito",
    };
  }

  if (cenario === "LP_2027") {
    return {
      credito_cbs: 0,
      credito_ibs: 0,
      credito_total: 0,
      nivel: "CUMULATIVO",
      cor: "cinza",
      descricao: "LP não tem direito a créditos de fornecedores (regime cumulativo)",
    };
  }

  // SIMPLES_2027
  const cbs_das = compras * 0.035;
  return {
    credito_cbs: cbs_das,
    credito_ibs: 0,
    credito_total: cbs_das,
    nivel: "MINIMO",
    cor: "cinza",
    descricao: "Simples Tradicional: crédito mínimo embutido no DAS (~3,5%)",
  };
}

export interface ConsolidadoCreditos {
  cbs_total: number;
  ibs_total: number;
  credito_total: number;
  credito_perdido: number;
  iva_bruto: number;
  iva_liquido: number;
  cobertura_pct: number;
  fornecedores_integrais: number;
  fornecedores_limitados: number;
  fornecedores_risco: number;
  total_compras: number;
  diagnostico: "FAVORAVEL" | "MODERADO" | "INSUFICIENTE";
}

export function consolidarCreditos(
  fornecedores: FornecedorClassificado[],
  receita_anual: number,
  cenario: CenarioCredito,
): ConsolidadoCreditos {
  let cbs_total = 0;
  let ibs_total = 0;
  let credito_total = 0;
  let credito_perdido = 0;
  let total_compras = 0;
  let fornecedores_integrais = 0;
  let fornecedores_limitados = 0;
  let fornecedores_risco = 0;

  for (const f of fornecedores) {
    const c = calcularCreditoFornecedor(f, cenario);
    cbs_total += c.credito_cbs;
    ibs_total += c.credito_ibs;
    credito_total += c.credito_total;
    credito_perdido += c.credito_perdido ?? 0;
    total_compras += valorAnual(f);
    if (c.nivel === "INTEGRAL") fornecedores_integrais++;
    else if (c.nivel === "LIMITADO") fornecedores_limitados++;
    else if (c.nivel === "RISCO") fornecedores_risco++;
  }

  const iva_bruto = (receita_anual || 0) * IVA;
  const iva_liquido = Math.max(0, iva_bruto - credito_total);
  const cobertura_pct = iva_bruto > 0 ? (credito_total / iva_bruto) * 100 : 0;
  const diagnostico: ConsolidadoCreditos["diagnostico"] =
    cobertura_pct > 60 ? "FAVORAVEL" : cobertura_pct >= 30 ? "MODERADO" : "INSUFICIENTE";

  return {
    cbs_total,
    ibs_total,
    credito_total,
    credito_perdido,
    iva_bruto,
    iva_liquido,
    cobertura_pct,
    fornecedores_integrais,
    fornecedores_limitados,
    fornecedores_risco,
    total_compras,
    diagnostico,
  };
}
