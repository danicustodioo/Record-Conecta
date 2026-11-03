// Bloco 14A — Central de documentos: catálogo, condições por perfil de cliente
// e mapeamento de natureza de operação → tipo_receita (LC 214/2025).
// Funções puras, sem acesso a banco. Reutilizadas no cliente e no servidor.

export type TipoDocumento = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  por_que_precisamos: string;
  periodo_minimo: string | null;
  obrigatorio_sempre: boolean;
  condicao: string | null;
  extraivel: boolean;
  ordem: number;
};

export type StatusDocumento = "pendente" | "enviado" | "extraido" | "conferido" | "dispensado";

export type DocumentoCliente = {
  id: string;
  cliente_id: string;
  codigo_documento: string;
  arquivo_path: string | null;
  nome_arquivo: string | null;
  status: StatusDocumento;
  resumo_extracao: unknown;
  extraido_em: string | null;
  conferido_por: string | null;
  conferido_em: string | null;
  observacao: string | null;
  created_at: string;
};

export const STATUS_LABEL: Record<StatusDocumento, string> = {
  pendente: "Pendente",
  enviado: "Enviado",
  extraido: "Extraído",
  conferido: "Conferido",
  dispensado: "Dispensado",
};

/** Perfil mínimo de cliente necessário para decidir quais documentos exibir. */
export type PerfilCliente = {
  cnae_principal?: string | null;
  cnaes_secundarios?: string[] | null;
  regime_atual?: string | null;
  opcao_simples?: boolean | null;
  tem_patrimonio_afetacao?: boolean | null;
};

/**
 * CNAE → tipo_receita sugerido (Bloco 14A, seção 4).
 * Mais amplo que `tipoReceitaPorCnae` do motor: inclui incorporação (68) e
 * profissões regulamentadas (69, 70, 71, 74, 75).
 * A classificação é SUGESTÃO — o que vale é a operação efetivamente praticada.
 */
export function tipoReceitaSugeridoPorCnae(cnae?: string | null): string {
  const d = (cnae ?? "").replace(/\D/g, "");
  if (!d) return "regular";
  if (d.startsWith("4731") || d.startsWith("4732")) return "combustivel_revenda";
  const p2 = d.slice(0, 2);
  if (["41", "42", "43"].includes(p2)) return "construcao_civil";
  if (p2 === "68") return "incorporacao_imobiliaria";
  if (p2 === "55") return "hotelaria";
  if (p2 === "56") return "bar_restaurante";
  if (p2 === "86") return "saude_anexo_iii";
  if (["69", "70", "71", "74", "75"].includes(p2)) return "profissao_regulamentada";
  return "regular";
}

const CONDICAO_POR_TIPO: Record<string, string[]> = {
  construcao_civil: ["construcao_incorporacao", "construcao_locacao"],
  incorporacao_imobiliaria: ["construcao_incorporacao", "construcao_locacao"],
  locacao_imovel: ["construcao_locacao"],
  hotelaria: [],
  saude_anexo_iii: ["profissao_regulamentada"],
  profissao_regulamentada: ["profissao_regulamentada"],
};

/** Condições satisfeitas pelo perfil do cliente — habilitam documentos condicionais. */
export function condicoesDoCliente(cliente: PerfilCliente): string[] {
  const cond = new Set<string>();
  const tipo = tipoReceitaSugeridoPorCnae(cliente.cnae_principal);
  for (const c of CONDICAO_POR_TIPO[tipo] ?? []) cond.add(c);

  for (const sec of cliente.cnaes_secundarios ?? []) {
    for (const c of CONDICAO_POR_TIPO[tipoReceitaSugeridoPorCnae(sec)] ?? []) cond.add(c);
  }

  const regime = (cliente.regime_atual ?? "").toUpperCase();
  const noSimples = cliente.opcao_simples === true || regime.startsWith("SIMPLES");
  if (noSimples) cond.add("regime_simples");
  else cond.add("regime_normal");

  return [...cond];
}

/** Documentos aplicáveis ao perfil, já ordenados. */
export function documentosAplicaveis(
  tipos: TipoDocumento[],
  cliente: PerfilCliente,
): TipoDocumento[] {
  const cond = condicoesDoCliente(cliente);
  return tipos
    .filter((t) => !t.condicao || cond.includes(t.condicao))
    .sort((a, b) => a.ordem - b.ordem);
}

export function isConcluido(status?: StatusDocumento | null): boolean {
  return status === "conferido" || status === "dispensado";
}

/** Lista dos obrigatórios que ainda travam a geração de cenários. */
export function pendenciasObrigatorias(
  aplicaveis: TipoDocumento[],
  docs: DocumentoCliente[],
): TipoDocumento[] {
  return aplicaveis.filter((t) => {
    if (!t.obrigatorio_sempre) return false;
    const meus = docs.filter((d) => d.codigo_documento === t.codigo);
    return !meus.some((d) => isConcluido(d.status));
  });
}

// ─────────────────────────────────────────────────────────────
// Natureza da operação → tipo_receita (Bloco 14A, seção 5)
// ─────────────────────────────────────────────────────────────
export type GrupoSaida = {
  descricao_operacao: string;
  cfop?: string | null;
  cst?: string | null;
  valor_total: number;
  imposto_destacado?: "ICMS" | "ISS" | "nenhum" | string | null;
};

export type SugestaoReceita = GrupoSaida & {
  tipo_receita: string;
  requer_atencao: boolean;
};

export function sugerirTipoReceita(
  grupo: GrupoSaida,
  cnaePrincipal?: string | null,
): { tipo_receita: string; requer_atencao: boolean } {
  const t = (grupo.descricao_operacao ?? "").toLowerCase();
  const cfop = (grupo.cfop ?? "").replace(/\D/g, "");
  const iss = (grupo.imposto_destacado ?? "").toUpperCase() === "ISS";
  const cnaeTipo = tipoReceitaSugeridoPorCnae(cnaePrincipal);

  const has = (...ks: string[]) => ks.some((k) => t.includes(k));

  if (!t.trim() || has("não identificado", "nao identificado", "diversos"))
    return { tipo_receita: "regular", requer_atencao: true };

  // Combustível — CFOP de revenda
  if (has("combustí", "combusti", "gasolina", "diesel", "etanol", "gnv") ||
      ["5656", "6656", "5106", "5405"].includes(cfop))
    return { tipo_receita: "combustivel_revenda", requer_atencao: false };

  if (has("unidade autônoma", "unidade autonoma", "venda de imóvel", "venda de imovel", "incorpora", "apartamento", "lote"))
    return { tipo_receita: "incorporacao_imobiliaria", requer_atencao: false };

  if (has("diária", "diaria", "hospedagem", "pernoite", "apart-hotel"))
    return { tipo_receita: "hotelaria", requer_atencao: false };

  if (has("locação de imóvel", "locacao de imovel", "aluguel", "arrendamento", "cessão onerosa", "cessao onerosa"))
    return { tipo_receita: "locacao_imovel", requer_atencao: false };

  if (has("estética", "estetica", "harmoniza", "bem-estar", "bem estar", "spa"))
    return { tipo_receita: "regular", requer_atencao: false };

  if (has("consulta", "procedimento", "exame", "internação", "internacao", "fisioterapia", "laborat"))
    return { tipo_receita: "saude_anexo_iii", requer_atencao: false };

  if (has("refeição", "refeicao", "almoço", "almoco", "jantar", "alimentação preparada", "alimentacao preparada", "prato", "buffet", "lanche"))
    return { tipo_receita: "bar_restaurante", requer_atencao: false };

  if (has("bebida alcoólica", "bebida alcoolica", "cerveja", "destilado", "revenda de industrializado", "revenda"))
    return { tipo_receita: "regular", requer_atencao: false };

  if (has("obra", "empreitada", "construção", "construcao", "serviço de engenharia", "servico de engenharia", "reforma"))
    return { tipo_receita: "construcao_civil", requer_atencao: false };

  // ISS destacado + CNAE de construção
  if (iss && (cnaeTipo === "construcao_civil" || cnaeTipo === "incorporacao_imobiliaria"))
    return { tipo_receita: "construcao_civil", requer_atencao: false };

  if (iss && cnaeTipo === "profissao_regulamentada")
    return { tipo_receita: "profissao_regulamentada", requer_atencao: false };

  if (iss && cnaeTipo === "saude_anexo_iii")
    return { tipo_receita: "saude_anexo_iii", requer_atencao: false };

  return { tipo_receita: "regular", requer_atencao: true };
}

export const AVISO_NAO_IDENTIFICADO =
  "Natureza não identificada — classificada na alíquota cheia por precaução. Confira antes de gerar o relatório.";

// ─────────────────────────────────────────────────────────────
// Alertas de consistência (Bloco 14A, seção 7)
// ─────────────────────────────────────────────────────────────
export type Alerta = { nivel: "erro" | "atencao"; mensagem: string };

export function alertasConsistencia(params: {
  receitaDre?: number | null;
  totalSaidas?: number | null;
  totalSegregado?: number | null;
  folhaMensal?: number[] | null;
  fornecedoresSemCnpj?: number;
  cliente: PerfilCliente & { tem_patrimonio_afetacao?: boolean | null };
  temPgdas?: boolean;
  /** Cadastro do cliente — ISS efetivo em % (ex.: 2 = 2,00%) */
  issAliquotaCadastro?: number | null;
  /** Cadastro do cliente — % de empreitada com material (0..100) */
  pctEmpreitada?: number | null;
  /** Cadastro do cliente — base creditável estimada anual (R$) */
  baseCreditavelEstimada?: number | null;
  /** Custo direto anualizado (CMV + custo de serviços prestados) */
  custoDiretoAnual?: number | null;
}): Alerta[] {
  const out: Alerta[] = [];
  const brl = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const dre = Number(params.receitaDre ?? 0);
  const saidas = Number(params.totalSaidas ?? 0);
  if (dre > 0 && saidas > 0) {
    const dif = Math.abs(dre - saidas);
    if (dif > dre * 0.01) {
      out.push({
        nivel: "erro",
        mensagem: `Divergência de ${brl(dif)} entre DRE e livro de saídas. Verifique antes de prosseguir — a base de receita de todos os cenários depende dessa conciliação.`,
      });
    }
  }

  const seg = Number(params.totalSegregado ?? 0);
  if (dre > 0 && Math.abs(dre - seg) > Math.max(1, dre * 0.005)) {
    out.push({
      nivel: "erro",
      mensagem: `Segregação incompleta: ${brl(Math.abs(dre - seg))} não classificados.`,
    });
  }

  const folha = (params.folhaMensal ?? []).filter((v) => Number.isFinite(v) && v > 0);
  if (folha.length >= 3) {
    const media = folha.reduce((a, b) => a + b, 0) / folha.length;
    if (folha.some((v) => v > media * 1.5)) {
      out.push({
        nivel: "atencao",
        mensagem:
          "Possível rescisão ou evento não recorrente na folha — confira antes da anualização.",
      });
    }
  }

  if ((params.fornecedoresSemCnpj ?? 0) > 0) {
    out.push({
      nivel: "atencao",
      mensagem: `${params.fornecedoresSemCnpj} fornecedor(es) sem CNPJ no relatório de entradas. Cadastro incompleto no Domínio. Sem CNPJ não há consulta de regime nem apuração de crédito.`,
    });
  }

  const cond = condicoesDoCliente(params.cliente);
  if (cond.includes("construcao_incorporacao") && params.cliente.tem_patrimonio_afetacao == null) {
    out.push({
      nivel: "erro",
      mensagem:
        "Informe se há patrimônio de afetação averbado — muda integralmente o cenário tributário.",
    });
  }

  if (cond.includes("regime_simples") && params.temPgdas === false) {
    out.push({
      nivel: "atencao",
      mensagem:
        "RBT12 estimado pela DRE. Anexe o PGDAS para confirmar a alíquota efetiva real.",
    });
  }

  // ── Campos de cadastro com valor padrão (default) ─────────────
  const pct = (v: number) =>
    `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

  const issCad = Number(params.issAliquotaCadastro ?? 0);
  if (issCad === 2) {
    out.push({
      nivel: "atencao",
      mensagem:
        "ISS cadastrado em 2,00% — valor padrão. Confirme a alíquota efetiva do município e da atividade (código de serviço na lista da LC 116/2003). O ISS entra como carga atual do regime e define o ganho ou perda na transição para a CBS/IBS.",
    });
  }

  const ehConstrucao =
    cond.includes("construcao_incorporacao") || cond.includes("construcao_locacao");
  const pctEmp = Number(params.pctEmpreitada ?? 0);
  if (ehConstrucao && !(pctEmp > 0)) {
    out.push({
      nivel: "atencao",
      mensagem:
        "% de empreitada com material está em 0% para cliente com CNAE de construção. Informe a parcela da receita executada por empreitada com fornecimento de material: ela usa presunção de 8% (IRPJ) e 12% (CSLL) em vez de 32%, o que altera significativamente o IRPJ/CSLL do Lucro Presumido.",
    });
  }

  const baseCred = Number(params.baseCreditavelEstimada ?? 0);
  const custo = Number(params.custoDiretoAnual ?? 0);
  if (!(baseCred > 0)) {
    out.push({
      nivel: "atencao",
      mensagem:
        "Base creditável estimada está em 0 (valor padrão). Informe o total anual de compras e serviços tomados de fornecedores do regime normal — sem essa base não há crédito de CBS/IBS e a carga dos cenários de 2027 fica superestimada.",
    });
  } else if (custo > 0 && baseCred < custo * 0.1) {
    out.push({
      nivel: "atencao",
      mensagem:
        `Base creditável de ${brl(baseCred)} representa ${pct(baseCred / custo)} do custo direto de ${brl(custo)} — implausível para a maioria dos setores. Revise o valor informado no cadastro ou a apuração de entradas: o crédito de CBS/IBS é calculado sobre essa base.`,
    });
  }

  return out;
}
