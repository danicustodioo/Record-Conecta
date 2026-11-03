// Classificação heurística de regime tributário do fornecedor
// baseada em pistas no nome (sufixo societário) + comportamento fiscal.
// Implementa as Regras A, B, C descritas na especificação.

export type RegimeFornecedor = "NORMAL" | "SIMPLES" | "DESCONHECIDO";
export type ConfiancaClassificacao = "ALTA" | "MEDIA" | "BAIXA";

export interface FornecedorBruto {
  nome: string;
  cnpj?: string | null;
  valor_contabil_total: number; // valor no período do PDF
  tipo_predominante?: "ICMS" | "ISS" | "SEM_IMPOSTO" | string | null;
  tem_icms?: boolean;
  tem_iss?: boolean;
  base_calculo?: number | null;
  valor_ipi?: number | null;
  linhas_nf?: number | null;
}

export interface FornecedorClassificado extends FornecedorBruto {
  regime: RegimeFornecedor;
  confianca: ConfiancaClassificacao;
  motivo_classificacao: string;
  opcao_hibrido: boolean | null;
  aliquota_das_estimada?: number;
  /** Valor anualizado calculado depois (preenchido pelo consolidador). */
  valor_anual?: number;
  /** Edição manual do usuário sobrescreve a heurística. */
  editado_manualmente?: boolean;
}

const SUFIXOS_SIMPLES = /\b(ME|EPP|MEI|LTDA\s*ME|LTDA\s*EPP)\s*$/i;
const SUFIXOS_NORMAL = /\b(S\.?A\.?|S\/A)\b/i;
const PALAVRAS_NORMAL_VOLUME = /(COSMETIC|PERFUM|INDUSTRIA|INDUSTRIAL|DISTRIBUIDOR|ATACAD|FABRIC)/i;
const PALAVRAS_SIMPLES_VOLUME = /(ALARME|MONITORAD|DIGITAL|ASSESSORIA|CONTABIL|GESTAO|TRANSPORTE|RODOVIARIO|MANUTEN|LIMPEZA|JARDINAG)/i;

interface Score {
  normal: number;
  simples: number;
  motivos: string[];
}

function aplicarRegraNome(f: FornecedorBruto, s: Score) {
  const n = (f.nome ?? "").toUpperCase();
  if (SUFIXOS_NORMAL.test(n)) {
    s.normal += 3;
    s.motivos.push("nome contém S.A./S/A");
  } else if (SUFIXOS_SIMPLES.test(n)) {
    s.simples += 3;
    s.motivos.push("nome termina em ME/EPP/MEI");
  }
  if (/EIRELI/i.test(n)) {
    s.simples += 1;
    s.motivos.push("razão EIRELI (porte tipicamente menor)");
  }
}

function aplicarRegraTipoValor(f: FornecedorBruto, s: Score) {
  const v = f.valor_contabil_total ?? 0;
  const tem_icms = f.tem_icms ?? f.tipo_predominante === "ICMS";
  const tem_iss = f.tem_iss ?? f.tipo_predominante === "ISS";

  if (tem_icms && v > 50_000) {
    s.normal += 3;
    s.motivos.push(`ICMS destacado e volume alto (R$ ${Math.round(v).toLocaleString("pt-BR")})`);
  } else if (tem_icms && v > 5_000) {
    s.normal += 1;
    s.motivos.push("ICMS destacado, volume médio");
  } else if (!tem_icms && !tem_iss && v < 5_000) {
    s.simples += 2;
    s.motivos.push("sem ICMS/ISS destacado e volume baixo");
  }
  if (tem_iss && v < 10_000) {
    s.simples += 1;
    s.motivos.push("ISS de prestador pequeno");
  }
}

function aplicarRegraSetor(f: FornecedorBruto, s: Score) {
  const n = (f.nome ?? "").toUpperCase();
  const v = f.valor_contabil_total ?? 0;
  if (PALAVRAS_NORMAL_VOLUME.test(n) && v > 30_000) {
    s.normal += 2;
    s.motivos.push("palavras-chave de indústria/distribuição");
  }
  if (PALAVRAS_SIMPLES_VOLUME.test(n) && v < 30_000) {
    s.simples += 2;
    s.motivos.push("palavras-chave de prestador típico Simples");
  }
}

export function classificarFornecedor(f: FornecedorBruto): FornecedorClassificado {
  const s: Score = { normal: 0, simples: 0, motivos: [] };
  aplicarRegraNome(f, s);
  aplicarRegraTipoValor(f, s);
  aplicarRegraSetor(f, s);

  let regime: RegimeFornecedor = "DESCONHECIDO";
  let confianca: ConfiancaClassificacao = "BAIXA";
  const diff = Math.abs(s.normal - s.simples);

  if (s.normal === 0 && s.simples === 0) {
    regime = "DESCONHECIDO";
    confianca = "BAIXA";
  } else if (s.normal > s.simples) {
    regime = "NORMAL";
    confianca = diff >= 3 ? "ALTA" : diff >= 2 ? "MEDIA" : "BAIXA";
  } else if (s.simples > s.normal) {
    regime = "SIMPLES";
    confianca = diff >= 3 ? "ALTA" : diff >= 2 ? "MEDIA" : "BAIXA";
  } else {
    regime = "DESCONHECIDO";
    confianca = "BAIXA";
  }

  return {
    ...f,
    regime,
    confianca,
    motivo_classificacao: s.motivos.length ? s.motivos.join("; ") : "sem pistas suficientes",
    opcao_hibrido: regime === "SIMPLES" ? false : null,
    aliquota_das_estimada: 0.10,
  };
}

export function classificarFornecedores(lista: FornecedorBruto[]): FornecedorClassificado[] {
  return lista.map(classificarFornecedor);
}
