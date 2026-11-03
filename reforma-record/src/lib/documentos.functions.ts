// Bloco 14A — Server functions da central de documentos.
// Wrapper fino: só imports, tipos e declarações de server function.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chamarIaEstruturada, consultarReceitaWs } from "@/lib/documentos.server";
import { sugerirTipoReceita, type GrupoSaida } from "@/lib/documentos-catalogo";

// ─────────────────────────────────────────────────────────────
// 1) Classificação automática pelo CNPJ (seção 4)
// ─────────────────────────────────────────────────────────────
export const classificarClientePorCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cliente_id: string }) =>
    z.object({ cliente_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cli, error } = await supabase
      .from("clientes")
      .select("id, cnpj")
      .eq("id", data.cliente_id)
      .maybeSingle();
    if (error || !cli) throw new Error("Cliente não encontrado");

    const rf = await consultarReceitaWs(cli.cnpj);

    const cnaePrincipal = rf.atividade_principal?.[0]?.code ?? null;
    const secundarios = (rf.atividades_secundarias ?? [])
      .map((a) => a.code)
      .filter((c): c is string => !!c && c !== "00.00-0-00");

    const patch = {
      cnae_principal: cnaePrincipal,
      cnaes_secundarios: secundarios,
      natureza_juridica: rf.natureza_juridica ?? null,
      porte: rf.porte ?? null,
      opcao_simples: rf.simples?.optante === true || rf.simei?.optante === true,
      situacao_cadastral: rf.situacao ?? null,
      municipio: rf.municipio ?? null,
    };

    const { error: uerr } = await supabase
      .from("clientes")
      .update(patch as never)
      .eq("id", cli.id);
    if (uerr) throw new Error(uerr.message);

    // Marca o documento 'cnpj' como extraído
    await supabase
      .from("documentos_cliente" as never)
      .delete()
      .eq("cliente_id", cli.id)
      .eq("codigo_documento", "cnpj");
    await supabase.from("documentos_cliente" as never).insert({
      cliente_id: cli.id,
      codigo_documento: "cnpj",
      status: "extraido",
      extraido_em: new Date().toISOString(),
      resumo_extracao: patch,
    } as never);

    return {
      ...patch,
      nome_receita: rf.nome ?? null,
      atividade_principal_texto: rf.atividade_principal?.[0]?.text ?? null,
    };
  });

// ─────────────────────────────────────────────────────────────
// 2) Extração da segregação de receita a partir do livro de saídas (seção 5)
// ─────────────────────────────────────────────────────────────
export const extrairSegregacaoSaidas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    cliente_id: string;
    analise_id?: string | null;
    texto: string;
    meses: number;
    modo: "SUBSTITUIR" | "ADICIONAR";
  }) =>
    z.object({
      cliente_id: z.string().uuid(),
      analise_id: z.string().uuid().nullable().optional(),
      texto: z.string().min(50).max(400_000),
      meses: z.number().int().min(1).max(60),
      modo: z.enum(["SUBSTITUIR", "ADICIONAR"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: cli } = await supabase
      .from("clientes")
      .select("cnae_principal")
      .eq("id", data.cliente_id)
      .maybeSingle();
    const cnae = (cli as { cnae_principal?: string | null } | null)?.cnae_principal ?? null;

    const parsed = await chamarIaEstruturada<{
      total_geral?: number | null;
      grupos: GrupoSaida[];
    }>({
      system:
        "Você é especialista em escrituração fiscal brasileira. Responda exclusivamente pelo tool call, sem markdown.",
      user: `Analise o relatório de saídas abaixo e agrupe a receita por natureza da operação.

Regras:
- Agrupe operações de mesma natureza; não retorne nota a nota
- Não classifique setor nem alíquota; apenas descreva e some
- Se não conseguir identificar a natureza, use "não identificado"
- A soma dos valores deve fechar com o total geral do relatório
- Valores em número (1.234,56 → 1234.56)

=== DOCUMENTO ===
${data.texto.slice(0, 350_000)}`,
      toolName: "extrair_saidas",
      parameters: {
        type: "object",
        properties: {
          total_geral: { type: ["number", "null"] },
          grupos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                descricao_operacao: { type: "string" },
                cfop: { type: ["string", "null"] },
                cst: { type: ["string", "null"] },
                valor_total: { type: "number" },
                imposto_destacado: { type: ["string", "null"] },
              },
              required: ["descricao_operacao", "valor_total"],
              additionalProperties: false,
            },
          },
        },
        required: ["grupos"],
        additionalProperties: false,
      },
    });

    if (data.modo === "SUBSTITUIR") {
      let del = supabase.from("receitas_cliente" as never).delete().eq("cliente_id", data.cliente_id);
      if (data.analise_id) del = del.eq("analise_id", data.analise_id);
      await del;
    }

    const rows = (parsed.grupos ?? [])
      .filter((g) => Number(g.valor_total) > 0)
      .map((g) => {
        const s = sugerirTipoReceita(g, cnae);
        return {
          cliente_id: data.cliente_id,
          analise_id: data.analise_id ?? null,
          tipo_receita: s.tipo_receita,
          descricao_livre: g.descricao_operacao,
          descricao_operacao: g.descricao_operacao,
          cfop: g.cfop ?? null,
          cst: g.cst ?? null,
          imposto_destacado: g.imposto_destacado ?? null,
          valor_periodo: Number(g.valor_total),
          meses: data.meses,
          origem: "ia",
          requer_atencao: s.requer_atencao,
        };
      });

    if (rows.length > 0) {
      const { error } = await supabase.from("receitas_cliente" as never).insert(rows as never);
      if (error) throw new Error(`Falha ao salvar linhas de receita: ${error.message}`);
    }

    return {
      linhas: rows.length,
      total_geral: parsed.total_geral ?? null,
      total_extraido: rows.reduce((a, r) => a + r.valor_periodo, 0),
      atencao: rows.filter((r) => r.requer_atencao).length,
    };
  });

// ─────────────────────────────────────────────────────────────
// 3) Extração do contrato social (seção 6)
// ─────────────────────────────────────────────────────────────
export const extrairContratoSocial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { cliente_id: string; texto: string }) =>
    z.object({
      cliente_id: z.string().uuid(),
      texto: z.string().min(50).max(300_000),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    return chamarIaEstruturada<{
      objeto_social: string;
      natureza_juridica?: string | null;
      socios: Array<{ nome: string; qualificacao?: string | null }>;
    }>({
      system: "Você é advogado societário. Responda exclusivamente pelo tool call, sem markdown.",
      user: `Leia o contrato social abaixo e retorne objeto social, sócios (nome e qualificação/profissão declarada quando houver) e o tipo societário.

=== DOCUMENTO ===
${data.texto.slice(0, 250_000)}`,
      toolName: "extrair_contrato",
      parameters: {
        type: "object",
        properties: {
          objeto_social: { type: "string" },
          natureza_juridica: { type: ["string", "null"] },
          socios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nome: { type: "string" },
                qualificacao: { type: ["string", "null"] },
              },
              required: ["nome"],
              additionalProperties: false,
            },
          },
        },
        required: ["objeto_social", "socios"],
        additionalProperties: false,
      },
    });
  });
