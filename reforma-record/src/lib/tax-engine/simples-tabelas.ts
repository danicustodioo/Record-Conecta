// Tabelas do Simples Nacional — Anexos I a V (LC 123/2006).
// Faixas em RBT12 anual (R$). Percentuais de partilha em % do DAS.
//
// Bloco 15A:
// - Corrigidos os Anexos I (faixas 1, 2 e 6), IV (todas) e V (faixas 2 a 6).
//   Conferência: a soma da partilha de cada faixa dá exatamente 100%.
// - Partilha de 2027–2028: CBS + IBS ocupam exatamente o lugar de PIS + Cofins
//   (LC 214/2025, Anexos XVIII a XXII). O IBS fica com 1,1% desse total,
//   arredondado a 2 casas — regra que reproduz todos os valores de conferência
//   do Bloco 15A. Deve ser validada contra o texto oficial quando disponível.
// - Teto de 5% do ISS (Anexos III, IV e V): o excedente é transferido de forma
//   proporcional aos demais tributos da mesma faixa.

import type { Anexo } from "./reforma";

/** Percentuais (em %, 2 casas) de cada tributo na faixa — tabela vigente até 2026. */
interface PartilhaBase {
  irpj: number;
  csll: number;
  cofins: number;
  pis: number;
  cpp: number;
  ipi: number;
  icms: number;
  iss: number;
}

export interface FaixaSimples {
  faixa: 1 | 2 | 3 | 4 | 5 | 6;
  rbt12_min: number;
  rbt12_max: number;
  aliquota: number; // nominal (fração)
  parcela: number; // a deduzir (R$)
  // composição vigente até 2026 (fração do DAS) — mantida para compatibilidade
  irpj: number;
  csll: number;
  cofins: number;
  pis: number;
  cpp: number;
  iss_ou_ipi: number; // ISS (III, IV, V) ou ICMS/IPI+ICMS (I, II)
  partilha: PartilhaBase; // em %
}

const LIMITES: Array<[number, number]> = [
  [0, 180_000],
  [180_000.01, 360_000],
  [360_000.01, 720_000],
  [720_000.01, 1_800_000],
  [1_800_000.01, 3_600_000],
  [3_600_000.01, 4_800_000],
];

type Linha = [aliquota: number, parcela: number, p: Partial<PartilhaBase>];

function montar(linhas: Linha[]): FaixaSimples[] {
  return linhas.map(([aliquota, parcela, p], idx) => {
    const partilha: PartilhaBase = {
      irpj: 0,
      csll: 0,
      cofins: 0,
      pis: 0,
      cpp: 0,
      ipi: 0,
      icms: 0,
      iss: 0,
      ...p,
    };
    return {
      faixa: (idx + 1) as FaixaSimples["faixa"],
      rbt12_min: LIMITES[idx][0],
      rbt12_max: LIMITES[idx][1],
      aliquota,
      parcela,
      irpj: partilha.irpj / 100,
      csll: partilha.csll / 100,
      cofins: partilha.cofins / 100,
      pis: partilha.pis / 100,
      cpp: partilha.cpp / 100,
      iss_ou_ipi: (partilha.iss + partilha.icms + partilha.ipi) / 100,
      partilha,
    };
  });
}

export const TABELA_SIMPLES: Record<Anexo, FaixaSimples[]> = {
  // Anexo I — Comércio
  ANEXO_I: montar([
    [0.04, 0, { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 41.5, icms: 34 }],
    [0.073, 5_940, { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 41.5, icms: 34 }],
    [0.095, 13_860, { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 42, icms: 33.5 }],
    [0.107, 22_500, { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 42, icms: 33.5 }],
    [0.143, 87_300, { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 42, icms: 33.5 }],
    [0.19, 378_000, { irpj: 13.5, csll: 10, cofins: 28.27, pis: 6.13, cpp: 42.1 }],
  ]),
  // Anexo II — Indústria
  ANEXO_II: montar([
    [0.045, 0, { irpj: 5.5, csll: 3.5, cofins: 11.51, pis: 2.49, cpp: 37.5, ipi: 7.5, icms: 32 }],
    [
      0.078,
      5_940,
      { irpj: 5.5, csll: 3.5, cofins: 11.51, pis: 2.49, cpp: 37.5, ipi: 7.5, icms: 32 },
    ],
    [
      0.1,
      13_860,
      { irpj: 5.5, csll: 3.5, cofins: 11.51, pis: 2.49, cpp: 37.5, ipi: 7.5, icms: 32 },
    ],
    [
      0.112,
      22_500,
      { irpj: 5.5, csll: 3.5, cofins: 11.51, pis: 2.49, cpp: 37.5, ipi: 7.5, icms: 32 },
    ],
    [
      0.147,
      85_500,
      { irpj: 5.5, csll: 3.5, cofins: 11.51, pis: 2.49, cpp: 37.5, ipi: 7.5, icms: 32 },
    ],
    [0.3, 720_000, { irpj: 8.5, csll: 7.5, cofins: 20.96, pis: 4.54, cpp: 23.5, ipi: 35 }],
  ]),
  // Anexo III — Serviços (Fator R ≥ 28%)
  ANEXO_III: montar([
    [0.06, 0, { irpj: 4, csll: 3.5, cofins: 12.82, pis: 2.78, cpp: 43.4, iss: 33.5 }],
    [0.112, 9_360, { irpj: 4, csll: 3.5, cofins: 14.05, pis: 3.05, cpp: 43.4, iss: 32 }],
    [0.135, 17_640, { irpj: 4, csll: 3.5, cofins: 13.64, pis: 2.96, cpp: 43.4, iss: 32.5 }],
    [0.16, 35_640, { irpj: 4, csll: 3.5, cofins: 13.64, pis: 2.96, cpp: 43.4, iss: 32.5 }],
    [0.21, 125_640, { irpj: 4, csll: 3.5, cofins: 12.82, pis: 2.78, cpp: 43.4, iss: 33.5 }],
    [0.33, 648_000, { irpj: 35, csll: 15, cofins: 16.03, pis: 3.47, cpp: 30.5 }],
  ]),
  // Anexo IV — Serviços com CPP fora do DAS
  ANEXO_IV: montar([
    [0.045, 0, { irpj: 18.8, csll: 15.2, cofins: 17.67, pis: 3.83, iss: 44.5 }],
    [0.09, 8_100, { irpj: 19.8, csll: 15.2, cofins: 20.55, pis: 4.45, iss: 40 }],
    [0.102, 12_420, { irpj: 20.8, csll: 15.2, cofins: 19.73, pis: 4.27, iss: 40 }],
    [0.14, 39_780, { irpj: 17.8, csll: 19.2, cofins: 18.9, pis: 4.1, iss: 40 }],
    [0.22, 183_780, { irpj: 18.8, csll: 19.2, cofins: 18.08, pis: 3.92, iss: 40 }],
    [0.33, 828_000, { irpj: 53.5, csll: 21.5, cofins: 20.55, pis: 4.45 }],
  ]),
  // Anexo V — Serviços (Fator R < 28%)
  ANEXO_V: montar([
    [0.155, 0, { irpj: 25, csll: 15, cofins: 14.1, pis: 3.05, cpp: 28.85, iss: 14 }],
    [0.18, 4_500, { irpj: 23, csll: 15, cofins: 14.1, pis: 3.05, cpp: 27.85, iss: 17 }],
    [0.195, 9_900, { irpj: 24, csll: 15, cofins: 14.92, pis: 3.23, cpp: 23.85, iss: 19 }],
    [0.205, 17_100, { irpj: 21, csll: 15, cofins: 15.74, pis: 3.41, cpp: 23.85, iss: 21 }],
    [0.23, 62_100, { irpj: 23, csll: 12.5, cofins: 14.1, pis: 3.05, cpp: 23.85, iss: 23.5 }],
    [0.305, 540_000, { irpj: 35, csll: 15.5, cofins: 16.44, pis: 3.56, cpp: 29.5 }],
  ]),
};

export function encontrarFaixa(rbt12: number, anexo: Anexo): FaixaSimples {
  const tabela = TABELA_SIMPLES[anexo];
  const f = tabela.find((f) => rbt12 >= f.rbt12_min && rbt12 <= f.rbt12_max);
  return f ?? tabela[tabela.length - 1];
}

/** Alíquota efetiva do DAS — LC 123/2006, art. 18: (RBT12 × nominal − parcela) ÷ RBT12. */
export function aliquotaEfetiva(rbt12: number, anexo: Anexo): number {
  if (rbt12 <= 0) return 0;
  const f = encontrarFaixa(rbt12, anexo);
  return Math.max(0, (rbt12 * f.aliquota - f.parcela) / rbt12);
}

// ─────────── Partilha por período (Bloco 15A) ───────────

/** Partilha final aplicada sobre o DAS, em fração (soma = 1). */
export interface Partilha {
  irpj: number;
  csll: number;
  pis: number; // só até 2026
  cofins: number; // só até 2026
  cbs: number; // a partir de 2027
  ibs: number; // a partir de 2027
  cpp: number;
  ipi: number;
  icms: number;
  iss: number;
  teto_iss_aplicado: boolean;
  periodo: "ATE_2026" | "2027_2028";
  pendente_texto_oficial: boolean; // true quando o ano pedido não tem tabela carregada
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Divisão de PIS+Cofins entre CBS e IBS em 2027–2028 (em %, 2 casas). */
export function divisaoCbsIbs2027(pisMaisCofins: number): { cbs: number; ibs: number } {
  const ibs = round2(pisMaisCofins * 0.011);
  return { cbs: round2(pisMaisCofins - ibs), ibs };
}

/** Teto de 5% do ISS: excedente redistribuído proporcionalmente aos demais tributos. */
function aplicarTetoISS(
  p: Omit<Partilha, "teto_iss_aplicado" | "periodo" | "pendente_texto_oficial">,
  aliqEfetiva: number,
) {
  if (p.iss <= 0 || aliqEfetiva <= 0 || aliqEfetiva * p.iss <= 0.05) return { p, aplicado: false };
  const novoIss = 0.05 / aliqEfetiva;
  const escala = (1 - novoIss) / (1 - p.iss);
  return {
    p: {
      irpj: p.irpj * escala,
      csll: p.csll * escala,
      pis: p.pis * escala,
      cofins: p.cofins * escala,
      cbs: p.cbs * escala,
      ibs: p.ibs * escala,
      cpp: p.cpp * escala,
      ipi: p.ipi * escala,
      icms: p.icms * escala,
      iss: novoIss,
    },
    aplicado: true,
  };
}

/**
 * Partilha do DAS para um anexo/faixa num ano.
 * - ano ≤ 2026: tabela vigente (PIS/Cofins).
 * - 2027 e 2028: CBS + IBS no lugar de PIS + Cofins.
 * - 2029+: a tabela oficial ainda não foi carregada — usa 2027–2028 e marca como pendente.
 */
export function partilhaSimples(
  anexo: Anexo,
  faixa: FaixaSimples,
  ano: number,
  aliqEfetiva: number,
): Partilha {
  const b = faixa.partilha;
  const base =
    ano <= 2026
      ? { cbs: 0, ibs: 0, pis: b.pis, cofins: b.cofins }
      : { ...divisaoCbsIbs2027(round2(b.pis + b.cofins)), pis: 0, cofins: 0 };
  const bruta = {
    irpj: b.irpj / 100,
    csll: b.csll / 100,
    pis: base.pis / 100,
    cofins: base.cofins / 100,
    cbs: base.cbs / 100,
    ibs: base.ibs / 100,
    cpp: b.cpp / 100,
    ipi: b.ipi / 100,
    icms: b.icms / 100,
    iss: b.iss / 100,
  };
  const { p, aplicado } = aplicarTetoISS(bruta, aliqEfetiva);
  void anexo;
  return {
    ...p,
    teto_iss_aplicado: aplicado,
    periodo: ano <= 2026 ? "ATE_2026" : "2027_2028",
    pendente_texto_oficial: ano >= 2029,
  };
}

/** Soma da partilha em % (deve dar 100,00). Usada na validação das tabelas. */
export function somaPartilha(p: PartilhaBase): number {
  return round2(p.irpj + p.csll + p.cofins + p.pis + p.cpp + p.ipi + p.icms + p.iss);
}

/** Linhas da partilha 2027–2028 para semear `partilha_simples` (em fração). */
export function linhasPartilha2027(): Array<{
  anexo: "I" | "II" | "III" | "IV" | "V";
  faixa: number;
  aliquota_nominal: number;
  parcela_deduzir: number;
  p_irpj: number;
  p_csll: number;
  p_cbs: number;
  p_ibs: number;
  p_cpp: number;
  p_ipi: number;
  p_icms: number;
  p_iss: number;
}> {
  const nomes: Record<Anexo, "I" | "II" | "III" | "IV" | "V"> = {
    ANEXO_I: "I",
    ANEXO_II: "II",
    ANEXO_III: "III",
    ANEXO_IV: "IV",
    ANEXO_V: "V",
  };
  return (Object.keys(TABELA_SIMPLES) as Anexo[]).flatMap((a) =>
    TABELA_SIMPLES[a].map((f) => {
      const { cbs, ibs } = divisaoCbsIbs2027(round2(f.partilha.pis + f.partilha.cofins));
      return {
        anexo: nomes[a],
        faixa: f.faixa,
        aliquota_nominal: f.aliquota,
        parcela_deduzir: f.parcela,
        p_irpj: f.partilha.irpj / 100,
        p_csll: f.partilha.csll / 100,
        p_cbs: cbs / 100,
        p_ibs: ibs / 100,
        p_cpp: f.partilha.cpp / 100,
        p_ipi: f.partilha.ipi / 100,
        p_icms: f.partilha.icms / 100,
        p_iss: f.partilha.iss / 100,
      };
    }),
  );
}
