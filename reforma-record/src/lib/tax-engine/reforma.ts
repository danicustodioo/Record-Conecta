// Parâmetros centrais da Reforma Tributária 2027 (LC 214/2025)
// Atualizáveis via tabela `configuracoes` no Supabase.

export const REFORMA = {
  CBS_RATE: 0.088,
  IBS_RATE: 0.177,
  IVA_DUAL: 0.265,

  REDUCAO_SAUDE: 0.6,
  REDUCAO_EDUCACAO: 0.6,
  REDUCAO_TRANSPORTE: 0.3,

  SIMPLES_CBS_NO_DAS: {
    ANEXO_I: 0.0125,
    ANEXO_II: 0.013,
    ANEXO_III: 0.014,
    ANEXO_IV: 0.0145,
    ANEXO_V: 0.015,
  } as Record<Anexo, number>,
  SIMPLES_IBS_NO_DAS: {
    ANEXO_I: 0.035,
    ANEXO_II: 0.032,
    ANEXO_III: 0.028,
    ANEXO_IV: 0.029,
    ANEXO_V: 0.03,
  } as Record<Anexo, number>,

  CPP_PATRONAL: 0.2,
  RAT: 0.01,
  TERCEIROS: {
    HOTELARIA: 0.058,
    COMERCIO: 0.055,
    INDUSTRIA: 0.062,
    SAUDE: 0.058,
    SERVICOS: 0.058,
    OUTRO: 0.058,
  } as Record<string, number>,

  INSS_PROLABORE: 0.11,
  FGTS: 0.08,

  DATA_HIBRIDO_OPCAO: "2026-09-30",
  DATA_VIGENCIA_2027: "2027-01-01",
};

export type Anexo = "ANEXO_I" | "ANEXO_II" | "ANEXO_III" | "ANEXO_IV" | "ANEXO_V";

export function reducaoSetorial(setor: string): number {
  const s = setor.toUpperCase();
  if (s.includes("SAUDE") || s.includes("SAÚDE")) return REFORMA.REDUCAO_SAUDE;
  if (s.includes("EDUCA")) return REFORMA.REDUCAO_EDUCACAO;
  if (s.includes("TRANSPORTE")) return REFORMA.REDUCAO_TRANSPORTE;
  return 0;
}

export function terceirosPorSetor(setor: string): number {
  const s = setor.toUpperCase();
  if (s.includes("HOTEL")) return REFORMA.TERCEIROS.HOTELARIA;
  if (s.includes("COMERC")) return REFORMA.TERCEIROS.COMERCIO;
  if (s.includes("IND")) return REFORMA.TERCEIROS.INDUSTRIA;
  if (s.includes("SAUDE") || s.includes("SAÚDE")) return REFORMA.TERCEIROS.SAUDE;
  return REFORMA.TERCEIROS.SERVICOS;
}
