// Tabelas do Simples Nacional — Anexos I a V (LC 123/2006 atualizada)
// Faixas em RBT12 anual (R$).

import type { Anexo } from "./reforma";

export interface FaixaSimples {
  faixa: 1 | 2 | 3 | 4 | 5 | 6;
  rbt12_min: number;
  rbt12_max: number;
  aliquota: number; // nominal
  parcela: number; // a deduzir
  // composição (em % do DAS)
  irpj: number;
  csll: number;
  cofins: number;
  pis: number;
  cpp: number;
  iss_ou_ipi: number;
}

export const TABELA_SIMPLES: Record<Anexo, FaixaSimples[]> = {
  ANEXO_I: [
    { faixa: 1, rbt12_min: 0, rbt12_max: 180_000, aliquota: 0.04, parcela: 0, irpj: 0.055, csll: 0.035, cofins: 0.1274, pis: 0.0276, cpp: 0.415, iss_ou_ipi: 0.335 },
    { faixa: 2, rbt12_min: 180_000.01, rbt12_max: 360_000, aliquota: 0.073, parcela: 5940, irpj: 0.055, csll: 0.035, cofins: 0.1274, pis: 0.0276, cpp: 0.415, iss_ou_ipi: 0.335 },
    { faixa: 3, rbt12_min: 360_000.01, rbt12_max: 720_000, aliquota: 0.095, parcela: 13860, irpj: 0.055, csll: 0.035, cofins: 0.1274, pis: 0.0276, cpp: 0.42, iss_ou_ipi: 0.335 },
    { faixa: 4, rbt12_min: 720_000.01, rbt12_max: 1_800_000, aliquota: 0.107, parcela: 22500, irpj: 0.055, csll: 0.035, cofins: 0.1274, pis: 0.0276, cpp: 0.42, iss_ou_ipi: 0.335 },
    { faixa: 5, rbt12_min: 1_800_000.01, rbt12_max: 3_600_000, aliquota: 0.143, parcela: 87300, irpj: 0.055, csll: 0.035, cofins: 0.1274, pis: 0.0276, cpp: 0.42, iss_ou_ipi: 0.335 },
    { faixa: 6, rbt12_min: 3_600_000.01, rbt12_max: 4_800_000, aliquota: 0.19, parcela: 378_000, irpj: 0.135, csll: 0.1, cofins: 0.2827, pis: 0.0613, cpp: 0.4283, iss_ou_ipi: 0 },
  ],
  ANEXO_II: [
    { faixa: 1, rbt12_min: 0, rbt12_max: 180_000, aliquota: 0.045, parcela: 0, irpj: 0.055, csll: 0.035, cofins: 0.1151, pis: 0.0249, cpp: 0.375, iss_ou_ipi: 0.395 },
    { faixa: 2, rbt12_min: 180_000.01, rbt12_max: 360_000, aliquota: 0.078, parcela: 5940, irpj: 0.055, csll: 0.035, cofins: 0.1151, pis: 0.0249, cpp: 0.375, iss_ou_ipi: 0.395 },
    { faixa: 3, rbt12_min: 360_000.01, rbt12_max: 720_000, aliquota: 0.1, parcela: 13860, irpj: 0.055, csll: 0.035, cofins: 0.1151, pis: 0.0249, cpp: 0.375, iss_ou_ipi: 0.395 },
    { faixa: 4, rbt12_min: 720_000.01, rbt12_max: 1_800_000, aliquota: 0.112, parcela: 22500, irpj: 0.055, csll: 0.035, cofins: 0.1151, pis: 0.0249, cpp: 0.375, iss_ou_ipi: 0.395 },
    { faixa: 5, rbt12_min: 1_800_000.01, rbt12_max: 3_600_000, aliquota: 0.147, parcela: 85500, irpj: 0.055, csll: 0.035, cofins: 0.1151, pis: 0.0249, cpp: 0.375, iss_ou_ipi: 0.395 },
    { faixa: 6, rbt12_min: 3_600_000.01, rbt12_max: 4_800_000, aliquota: 0.3, parcela: 720_000, irpj: 0.085, csll: 0.075, cofins: 0.2096, pis: 0.0454, cpp: 0.235, iss_ou_ipi: 0.35 },
  ],
  ANEXO_III: [
    { faixa: 1, rbt12_min: 0, rbt12_max: 180_000, aliquota: 0.06, parcela: 0, irpj: 0.04, csll: 0.035, cofins: 0.1282, pis: 0.0278, cpp: 0.434, iss_ou_ipi: 0.335 },
    { faixa: 2, rbt12_min: 180_000.01, rbt12_max: 360_000, aliquota: 0.112, parcela: 9360, irpj: 0.04, csll: 0.035, cofins: 0.1405, pis: 0.0305, cpp: 0.434, iss_ou_ipi: 0.32 },
    { faixa: 3, rbt12_min: 360_000.01, rbt12_max: 720_000, aliquota: 0.135, parcela: 17640, irpj: 0.04, csll: 0.035, cofins: 0.1364, pis: 0.0296, cpp: 0.434, iss_ou_ipi: 0.325 },
    { faixa: 4, rbt12_min: 720_000.01, rbt12_max: 1_800_000, aliquota: 0.16, parcela: 35640, irpj: 0.04, csll: 0.035, cofins: 0.1364, pis: 0.0296, cpp: 0.434, iss_ou_ipi: 0.325 },
    { faixa: 5, rbt12_min: 1_800_000.01, rbt12_max: 3_600_000, aliquota: 0.21, parcela: 125640, irpj: 0.04, csll: 0.035, cofins: 0.1282, pis: 0.0278, cpp: 0.434, iss_ou_ipi: 0.335 },
    { faixa: 6, rbt12_min: 3_600_000.01, rbt12_max: 4_800_000, aliquota: 0.33, parcela: 648_000, irpj: 0.35, csll: 0.15, cofins: 0.1603, pis: 0.0347, cpp: 0.305, iss_ou_ipi: 0 },
  ],
  ANEXO_IV: [
    { faixa: 1, rbt12_min: 0, rbt12_max: 180_000, aliquota: 0.045, parcela: 0, irpj: 0.18, csll: 0.152, cofins: 0.1903, pis: 0.0413, cpp: 0, iss_ou_ipi: 0.4361 },
    { faixa: 2, rbt12_min: 180_000.01, rbt12_max: 360_000, aliquota: 0.09, parcela: 8100, irpj: 0.19, csll: 0.152, cofins: 0.2055, pis: 0.0445, cpp: 0, iss_ou_ipi: 0.408 },
    { faixa: 3, rbt12_min: 360_000.01, rbt12_max: 720_000, aliquota: 0.102, parcela: 12420, irpj: 0.21, csll: 0.152, cofins: 0.1981, pis: 0.0429, cpp: 0, iss_ou_ipi: 0.397 },
    { faixa: 4, rbt12_min: 720_000.01, rbt12_max: 1_800_000, aliquota: 0.14, parcela: 39780, irpj: 0.22, csll: 0.152, cofins: 0.2027, pis: 0.0439, cpp: 0, iss_ou_ipi: 0.3814 },
    { faixa: 5, rbt12_min: 1_800_000.01, rbt12_max: 3_600_000, aliquota: 0.22, parcela: 183780, irpj: 0.245, csll: 0.155, cofins: 0.196, pis: 0.0424, cpp: 0, iss_ou_ipi: 0.3616 },
    { faixa: 6, rbt12_min: 3_600_000.01, rbt12_max: 4_800_000, aliquota: 0.33, parcela: 828_000, irpj: 0.355, csll: 0.155, cofins: 0.2331, pis: 0.0504, cpp: 0, iss_ou_ipi: 0.2065 },
  ],
  ANEXO_V: [
    { faixa: 1, rbt12_min: 0, rbt12_max: 180_000, aliquota: 0.155, parcela: 0, irpj: 0.25, csll: 0.15, cofins: 0.1410, pis: 0.0305, cpp: 0.2885, iss_ou_ipi: 0.14 },
    { faixa: 2, rbt12_min: 180_000.01, rbt12_max: 360_000, aliquota: 0.18, parcela: 4500, irpj: 0.23, csll: 0.15, cofins: 0.1410, pis: 0.0305, cpp: 0.2785, iss_ou_ipi: 0.17 },
    { faixa: 3, rbt12_min: 360_000.01, rbt12_max: 720_000, aliquota: 0.195, parcela: 9900, irpj: 0.24, csll: 0.15, cofins: 0.1492, pis: 0.0323, cpp: 0.2385, iss_ou_ipi: 0.19 },
    { faixa: 4, rbt12_min: 720_000.01, rbt12_max: 1_800_000, aliquota: 0.205, parcela: 17100, irpj: 0.21, csll: 0.15, cofins: 0.1410, pis: 0.0305, cpp: 0.2385, iss_ou_ipi: 0.23 },
    { faixa: 5, rbt12_min: 1_800_000.01, rbt12_max: 3_600_000, aliquota: 0.23, parcela: 62100, irpj: 0.23, csll: 0.125, cofins: 0.1424, pis: 0.0308, cpp: 0.2418, iss_ou_ipi: 0.23 },
    { faixa: 6, rbt12_min: 3_600_000.01, rbt12_max: 4_800_000, aliquota: 0.305, parcela: 540_000, irpj: 0.35, csll: 0.155, cofins: 0.1670, pis: 0.0360, cpp: 0.292, iss_ou_ipi: 0 },
  ],
};

export function encontrarFaixa(rbt12: number, anexo: Anexo): FaixaSimples {
  const tabela = TABELA_SIMPLES[anexo];
  const f = tabela.find((f) => rbt12 >= f.rbt12_min && rbt12 <= f.rbt12_max);
  return f ?? tabela[tabela.length - 1];
}

export function aliquotaEfetiva(rbt12: number, anexo: Anexo): number {
  if (rbt12 <= 0) return 0;
  const f = encontrarFaixa(rbt12, anexo);
  return Math.max(0, (rbt12 * f.aliquota - f.parcela) / rbt12);
}
