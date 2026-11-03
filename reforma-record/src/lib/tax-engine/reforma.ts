// Parâmetros de folha usados pelo motor (CPP, RAT, terceiros, FGTS).

// Bloco 15A: as alíquotas de CBS/IBS saíram daqui — vêm de `parametros_reforma`
// (ver ./parametros.ts). A partilha do Simples vem de ./simples-tabelas.ts.
export const REFORMA = {
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

  DATA_VIGENCIA_2027: "2027-01-01",
};

export type Anexo = "ANEXO_I" | "ANEXO_II" | "ANEXO_III" | "ANEXO_IV" | "ANEXO_V";

export function terceirosPorSetor(setor: string): number {
  const s = setor.toUpperCase();
  if (s.includes("HOTEL")) return REFORMA.TERCEIROS.HOTELARIA;
  if (s.includes("COMERC")) return REFORMA.TERCEIROS.COMERCIO;
  if (s.includes("IND")) return REFORMA.TERCEIROS.INDUSTRIA;
  if (s.includes("SAUDE") || s.includes("SAÚDE")) return REFORMA.TERCEIROS.SAUDE;
  return REFORMA.TERCEIROS.SERVICOS;
}
