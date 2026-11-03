// Fator R — LC 123/2006, art. 18, §§ 5º-J e 5º-M.
// Fator R ≥ 28% → Anexo III · Fator R < 28% → Anexo V.
// folha12m = salários + pró-labore + 13º + FGTS + encargos dos 12 meses anteriores.

export const LIMITE_FATOR_R = 0.28;
export const ZONA_RISCO_FATOR_R = 0.32;

export function fatorR(folha12m: number, rbt12: number): number {
  if (rbt12 <= 0) return 0;
  return folha12m / rbt12;
}

export interface AnaliseFatorR {
  fator_r: number;
  anexo: "ANEXO_III" | "ANEXO_V";
  folha_12m: number;
  rbt12: number;
  distancia_limite: number; // fator_r − 28% (negativo = abaixo do limite)
  folha_faltante_12m: number; // folha adicional em 12 meses para chegar a 28% (0 se já está)
  folha_faltante_mensal: number;
  zona_risco: boolean; // entre 28% e 32%
}

export function analisarFatorR(folha12m: number, rbt12: number): AnaliseFatorR {
  const f = fatorR(folha12m, rbt12);
  const faltante = Math.max(0, LIMITE_FATOR_R * rbt12 - folha12m);
  return {
    fator_r: f,
    anexo: f >= LIMITE_FATOR_R ? "ANEXO_III" : "ANEXO_V",
    folha_12m: folha12m,
    rbt12,
    distancia_limite: f - LIMITE_FATOR_R,
    folha_faltante_12m: faltante,
    folha_faltante_mensal: faltante / 12,
    zona_risco: f >= LIMITE_FATOR_R && f < ZONA_RISCO_FATOR_R,
  };
}
