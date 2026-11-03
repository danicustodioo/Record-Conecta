// Bloco 14 — Enquadramento setorial e alíquota de CBS por linha de receita.
// A alíquota deixa de ser constante: é resolvida por tipo de receita (LC 214/2025).
// Funções puras, sem acesso a banco — os regimes são passados como dicionário.

export type RegimeSetorial = {
  tipo_receita: string;
  descricao: string;
  reducao: number;
  monofasico: boolean;
  gera_credito_adquirente: boolean;
  requer_validacao_societaria: boolean;
  artigo: string;
  status: string;
};

export type LinhaReceita = {
  tipo_receita: string;
  descricao_livre?: string | null;
  valor_anualizado: number;
};

export type LinhaCBS = {
  tipo_receita: string;
  descricao: string;
  descricao_livre?: string | null;
  base: number;
  reducao: number;
  aliquota_efetiva: number;
  cbs: number;
  artigo: string;
  status: string;
  monofasico: boolean;
  gera_credito_adquirente: boolean;
  reducao_negada_societaria: boolean;
};

export const ENGINE_VERSAO = "v14";

// Fallback embutido (espelha o seed de public.regimes_setoriais) para que o motor
// funcione mesmo quando a tabela não puder ser lida (SSR, link público).
export const REGIMES_SETORIAIS_FALLBACK: Record<string, RegimeSetorial> = {
  saude_anexo_iii: {
    tipo_receita: "saude_anexo_iii",
    descricao: "Serviços de saúde listados no Anexo III",
    reducao: 0.6,
    monofasico: false,
    gera_credito_adquirente: true,
    requer_validacao_societaria: false,
    artigo: "LC 214/2025, art. 130 e Anexo III",
    status: "lei",
  },
  profissao_regulamentada: {
    tipo_receita: "profissao_regulamentada",
    descricao: "Profissões intelectuais regulamentadas",
    reducao: 0.3,
    monofasico: false,
    gera_credito_adquirente: true,
    requer_validacao_societaria: true,
    artigo: "LC 214/2025, art. 127",
    status: "lei",
  },
  construcao_civil: {
    tipo_receita: "construcao_civil",
    descricao: "Serviços de construção civil",
    reducao: 0.5,
    monofasico: false,
    gera_credito_adquirente: true,
    requer_validacao_societaria: false,
    artigo: "LC 214/2025, arts. 252, V e 261",
    status: "lei",
  },
  incorporacao_imobiliaria: {
    tipo_receita: "incorporacao_imobiliaria",
    descricao: "Alienação de unidades de incorporação",
    reducao: 0.5,
    monofasico: false,
    gera_credito_adquirente: true,
    requer_validacao_societaria: false,
    artigo: "LC 214/2025, arts. 252 e 261",
    status: "lei",
  },
  hotelaria: {
    tipo_receita: "hotelaria",
    descricao: "Hotelaria, parques de diversão e temáticos",
    reducao: 0.4,
    monofasico: false,
    gera_credito_adquirente: false,
    requer_validacao_societaria: false,
    artigo: "LC 214/2025, arts. 281 e 283",
    status: "lei",
  },
  bar_restaurante: {
    tipo_receita: "bar_restaurante",
    descricao: "Alimentação e bebida não alcoólica preparadas no local",
    reducao: 0.4,
    monofasico: false,
    gera_credito_adquirente: false,
    requer_validacao_societaria: false,
    artigo: "LC 214/2025, arts. 275 e 276",
    status: "lei",
  },
  combustivel_revenda: {
    tipo_receita: "combustivel_revenda",
    descricao: "Revenda de combustível — monofásico",
    reducao: 0,
    monofasico: true,
    gera_credito_adquirente: false,
    requer_validacao_societaria: false,
    artigo: "LC 214/2025, arts. 172 a 180",
    status: "lei",
  },
  locacao_imovel: {
    tipo_receita: "locacao_imovel",
    descricao: "Locação, cessão onerosa e arrendamento de imóvel",
    reducao: 0.7,
    monofasico: false,
    gera_credito_adquirente: true,
    requer_validacao_societaria: false,
    artigo: "LC 214/2025, art. 261, parágrafo único",
    status: "lei",
  },
  regular: {
    tipo_receita: "regular",
    descricao: "Regime regular — alíquota cheia",
    reducao: 0,
    monofasico: false,
    gera_credito_adquirente: true,
    requer_validacao_societaria: false,
    artigo: "LC 214/2025, art. 47",
    status: "lei",
  },
};

export function regimePorTipo(
  tipo_receita: string,
  regimes?: Record<string, RegimeSetorial>,
): RegimeSetorial {
  const dic = regimes && Object.keys(regimes).length ? regimes : REGIMES_SETORIAIS_FALLBACK;
  return dic[tipo_receita] ?? dic["regular"] ?? REGIMES_SETORIAIS_FALLBACK["regular"];
}

/**
 * Alíquota CBS efetiva de uma linha de receita.
 * `aliquotaBase` vem dos parâmetros da reforma (hoje 0,088).
 * Os benefícios NÃO se acumulam: cada linha tem um único tipo_receita.
 */
export function aliquotaEfetiva(
  regime: RegimeSetorial,
  aliquotaBase: number,
  socios_habilitados: boolean | null,
): number {
  if (regime.monofasico) return 0;

  // art. 127, §1º, II: a PJ só mantém a redução de 30% se cumprir o requisito societário.
  if (regime.requer_validacao_societaria && socios_habilitados !== true) {
    return aliquotaBase;
  }

  return aliquotaBase * (1 - regime.reducao);
}

/** Débito de CBS somando todas as linhas de receita do cliente. */
export function debitoCBS(
  linhas: LinhaReceita[],
  regimes: Record<string, RegimeSetorial>,
  aliquotaBase: number,
  socios_habilitados: boolean | null,
): { detalhe: LinhaCBS[]; total: number } {
  const detalhe: LinhaCBS[] = linhas.map((l) => {
    const r = regimePorTipo(l.tipo_receita, regimes);
    const aliq = aliquotaEfetiva(r, aliquotaBase, socios_habilitados);
    return {
      tipo_receita: r.tipo_receita,
      descricao: r.descricao,
      descricao_livre: l.descricao_livre ?? null,
      base: l.valor_anualizado,
      reducao: r.reducao,
      aliquota_efetiva: aliq,
      cbs: l.valor_anualizado * aliq,
      artigo: r.artigo,
      status: r.status,
      monofasico: r.monofasico,
      gera_credito_adquirente: r.gera_credito_adquirente,
      reducao_negada_societaria: r.requer_validacao_societaria && socios_habilitados !== true,
    };
  });

  return { detalhe, total: detalhe.reduce((a, d) => a + d.cbs, 0) };
}

// ─────────────────────────────────────────────────────────────
// CNAE → tipo_receita (prefixo). Sem chamada adicional de API.
// ─────────────────────────────────────────────────────────────
export function tipoReceitaPorCnae(cnae?: string | null): string {
  const d = (cnae ?? "").replace(/\D/g, "");
  if (!d) return "regular";
  if (d.startsWith("4731") || d.startsWith("4732")) return "combustivel_revenda";
  const p2 = d.slice(0, 2);
  if (p2 === "55") return "hotelaria";
  if (p2 === "56") return "bar_restaurante";
  if (p2 === "41" || p2 === "42" || p2 === "43") return "construcao_civil";
  if (p2 === "86") return "saude_anexo_iii";
  return "regular";
}

// Rodapé legal obrigatório em toda página de cálculo.
export const RODAPE_CBS =
  "Alíquota base de CBS estimada em 8,8%, pendente de fixação oficial pelo Senado Federal até 31/10/2026 " +
  "(art. 349 da LC 214/2025). As reduções setoriais aplicadas decorrem de dispositivos vigentes da " +
  "LC 214/2025, indicados linha a linha. Cenários serão recalculados automaticamente após a publicação " +
  "da alíquota oficial.";

/**
 * Crédito de CBS de um fornecedor considerando regime tributário E setor.
 * Vedações legais (arts. 174, 276, 283) zeram o crédito mesmo no regime normal.
 */
export function creditoFornecedor(
  compras: number,
  regimeTributario: "normal" | "simples" | "mei" | "irregular" | "pf",
  setor: RegimeSetorial,
  aliquotaBase: number,
): number {
  if (!setor.gera_credito_adquirente) return 0;
  if (setor.monofasico) return 0;

  const fator = regimeTributario === "normal" ? 1.0 : regimeTributario === "simples" ? 0.36 : 0;

  return compras * aliquotaBase * (1 - setor.reducao) * fator;
}
