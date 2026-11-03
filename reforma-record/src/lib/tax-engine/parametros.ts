// Bloco 15A — Parâmetros da reforma lidos da tabela `parametros_reforma`.
// Este é o ÚNICO lugar com valores padrão. Todo o resto do código deriva daqui.

export interface ParametrosReforma {
  aliquota_cbs_referencia: number; // alíquota de referência da CBS (TCU/Senado)
  redutor_transicao_cbs: number; // LC 214/2025, art. 347 — 0,1 p.p. em 2027 e 2028
  aliquota_ibs_estadual: number; // LC 214/2025, art. 344 — 0,05%
  aliquota_ibs_municipal: number; // LC 214/2025, art. 344 — 0,05%
  status_aliquota: string;
  fonte_aliquota: string;
  data_referencia: string; // ISO yyyy-mm-dd
}

// Padrão usado quando a tabela não puder ser lida (SSR, link público, falha de rede).
// Espelha a migration do Bloco 15A.
export const PARAMETROS_PADRAO: ParametrosReforma = {
  aliquota_cbs_referencia: 0.113,
  redutor_transicao_cbs: 0.001,
  aliquota_ibs_estadual: 0.0005,
  aliquota_ibs_municipal: 0.0005,
  status_aliquota: "calculada_tcu_pendente_senado",
  fonte_aliquota:
    "TCU, sessão plenária de 28/10/2026 — pendente de resolução do Senado Federal até 15/12/2026 (LC 214/2025, art. 14)",
  data_referencia: "2026-10-28",
};

export interface Aliquotas2027 {
  cbs: number; // referência − redutor de transição
  ibs: number; // estadual + municipal
  iva: number; // cbs + ibs
}

/** Alíquotas de 2027–2028 derivadas dos parâmetros (nunca fixas no código). */
export function aliquotas2027(p: ParametrosReforma = PARAMETROS_PADRAO): Aliquotas2027 {
  const cbs = Math.max(0, p.aliquota_cbs_referencia - p.redutor_transicao_cbs);
  const ibs = Math.max(0, p.aliquota_ibs_estadual + p.aliquota_ibs_municipal);
  return { cbs, ibs, iva: cbs + ibs };
}

/** CBS e IBS de 2027 pelos parâmetros padrão — só para telas antigas sem resultado salvo. */
export const CBS_2027_PADRAO = aliquotas2027(PARAMETROS_PADRAO).cbs;
export const IBS_2027_PADRAO = aliquotas2027(PARAMETROS_PADRAO).ibs;

const ALIQUOTA_MINIMA_VALIDA = 0.09;

/** true enquanto a alíquota da CBS for a calculada pelo TCU, sem resolução do Senado. */
export function aliquotaProvisoria(p: ParametrosReforma = PARAMETROS_PADRAO): boolean {
  return p.status_aliquota === "calculada_tcu_pendente_senado";
}

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Converte uma linha de `parametros_reforma` (pode vir incompleta) em parâmetros válidos. */
export function normalizarParametros(row?: Record<string, unknown> | null): ParametrosReforma {
  if (!row) return PARAMETROS_PADRAO;
  const d = PARAMETROS_PADRAO;
  const redutor = num(row.redutor_transicao_cbs, d.redutor_transicao_cbs);
  let ref = num(row.aliquota_cbs_referencia, NaN);
  // Sem a coluna nova, usa `aliquota_cbs` (CBS efetiva de 2027 = referência − redutor).
  // Valores abaixo de 9% são a estimativa antiga (8,8%) e são ignorados.
  const cbsEfetiva = num(row.aliquota_cbs, NaN);
  if (!(ref > 0) && cbsEfetiva >= ALIQUOTA_MINIMA_VALIDA) ref = cbsEfetiva + redutor;
  return {
    aliquota_cbs_referencia: Number.isFinite(ref) && ref > 0 ? ref : d.aliquota_cbs_referencia,
    redutor_transicao_cbs: redutor,
    aliquota_ibs_estadual: num(row.aliquota_ibs_estadual, d.aliquota_ibs_estadual),
    aliquota_ibs_municipal: num(row.aliquota_ibs_municipal, d.aliquota_ibs_municipal),
    status_aliquota: (row.status_aliquota as string) || d.status_aliquota,
    fonte_aliquota: (row.fonte_aliquota as string) || d.fonte_aliquota,
    data_referencia: (row.data_referencia as string) || d.data_referencia,
  };
}

const pct = (v: number, casas = 2) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

/** Rodapé legal das páginas de cálculo (gerado dos parâmetros vigentes). */
export function rodapeAliquota(p: ParametrosReforma = PARAMETROS_PADRAO): string {
  const a = aliquotas2027(p);
  const pendente = p.status_aliquota !== "fixada_senado";
  return (
    `Alíquota de referência da CBS de ${pct(p.aliquota_cbs_referencia)} (${p.fonte_aliquota}). ` +
    `Em 2027 e 2028 a CBS é a referência menos ${pct(p.redutor_transicao_cbs)} = ${pct(a.cbs)} ` +
    `(LC 214/2025, art. 347), e o IBS é de ${pct(a.ibs)} (art. 344). ` +
    "As reduções setoriais aplicadas decorrem de dispositivos da LC 214/2025, indicados linha a linha." +
    (pendente ? " Os cenários serão recalculados após a resolução do Senado." : "")
  );
}
