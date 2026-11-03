// Bloco 12 — Extração de fornecedores do relatório "Acompanhamento de Entradas"
// do Domínio via Lovable AI (Gemini 2.5 Pro) + consulta de regime na ReceitaWS
// (plano pago com token). Guardado por cliente na tabela fornecedores_entradas.

import { createServerFn } from "@tanstack/react-start";
import { CBS_2027_PADRAO } from "@/lib/tax-engine/parametros";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { regimePorTipo, tipoReceitaPorCnae } from "@/lib/enquadramento";


// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────
export type RegimeFornecedor = "NORMAL" | "SIMPLES" | "MEI" | "IRREGULAR" | "PF" | "PENDENTE";

// Cache simples de parâmetros CBS (evita 1 select por consulta)
async function getParametrosCBS(supabase: {
  from: (t: string) => {
    select: (c: string) => {
      order: (col: string, opts: { ascending: boolean }) => {
        limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> };
      };
    };
  };
}): Promise<{ cbs: number; simples: number }> {
  try {
    const { data } = await supabase
      .from("parametros_reforma")
      .select("aliquota_cbs, credito_simples_estimado")
      .order("vigencia_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { aliquota_cbs?: number; credito_simples_estimado?: number } | null;
    return {
      cbs: Number(row?.aliquota_cbs ?? CBS_2027_PADRAO),
      simples: Number(row?.credito_simples_estimado ?? 0.032),
    };
  } catch {
    return { cbs: CBS_2027_PADRAO, simples: 0.032 };
  }
}

// Bloco 14: o crédito depende do regime tributário E do setor do fornecedor.
// Setores com vedação legal (combustível monofásico, bar/restaurante, hotelaria)
// não geram crédito ao adquirente, ainda que o fornecedor esteja no regime normal.
function calcularCredito(
  valor: number,
  regime: RegimeFornecedor,
  cbs: number,
  simples: number,
  tipoReceita: string = "regular",
): number {
  const setor = regimePorTipo(tipoReceita);
  if (!setor.gera_credito_adquirente || setor.monofasico) return 0;
  const fatorSetor = 1 - setor.reducao;
  if (regime === "NORMAL") return +(valor * cbs * fatorSetor).toFixed(2);
  if (regime === "SIMPLES") return +(valor * simples * fatorSetor).toFixed(2);
  return 0;
}


// ─────────────────────────────────────────────────────────────
// 1) Extração via Lovable AI Gateway (Gemini 2.5 Pro)
// ─────────────────────────────────────────────────────────────
export const extrairFornecedoresDominio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    cliente_id: string;
    texto_pdf: string;
    modo: "SUBSTITUIR" | "ADICIONAR";
  }) =>
    z.object({
      cliente_id: z.string().uuid(),
      texto_pdf: z.string().min(50).max(400_000),
      modo: z.enum(["SUBSTITUIR", "ADICIONAR"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const body = {
      model: "google/gemini-2.5-pro",
      messages: [
        {
          role: "system",
          content:
            "Você é especialista em contabilidade brasileira e no relatório 'ACOMPANHAMENTO DE ENTRADAS' do sistema Domínio. Responda em JSON via tool call.",
        },
        {
          role: "user",
          content: `Analise o relatório abaixo e extraia TODOS os fornecedores.

REGRAS:
- Cada bloco "Fornecedor: NOME" (ou "NOME FORNECEDOR ... CNPJ") inicia um novo fornecedor.
- Consolide todas as notas fiscais do bloco em UMA linha (valor_total = soma da coluna "Valor Contábil" OU a linha "Total Fornecedor").
- cnpj: no formato XX.XXX.XXX/XXXX-XX se presente; null se ausente.
- cpf: se pessoa física (000.000.000-00).
- tipo_imposto: "ICMS", "ISS", "IRRF", "CRF" ou "sem_imposto".
- uf: sigla do estado (ex: PR, SP).
- Datas em YYYY-MM-DD; valores em número (1.234,56 → 1234.56).
- IGNORE o cabeçalho (empresa cliente) — não é fornecedor.

=== DOCUMENTO ===
${data.texto_pdf.slice(0, 350_000)}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extrair_fornecedores",
            parameters: {
              type: "object",
              properties: {
                periodo_inicio: { type: ["string", "null"] },
                periodo_fim: { type: ["string", "null"] },
                total_geral: { type: ["number", "null"] },
                fornecedores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      nome: { type: "string" },
                      cnpj: { type: ["string", "null"] },
                      cpf: { type: ["string", "null"] },
                      uf: { type: ["string", "null"] },
                      tipo_imposto: { type: ["string", "null"] },
                      valor_total: { type: "number" },
                    },
                    required: ["nome", "valor_total"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["fornecedores"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extrair_fornecedores" } },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      if (resp.status === 403) throw new Error("Acesso à IA bloqueado: limite de créditos do workspace atingido ou IA desabilitada. Um administrador precisa ajustar o limite em Settings > Workspace > Usage.");
      if (resp.status === 429) throw new Error("Limite de uso da IA atingido. Tente em instantes.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados.");
      throw new Error(`Falha na IA (${resp.status})`);
    }

    const json = (await resp.json()) as {
      choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("IA não retornou dados estruturados");

    const parsed = JSON.parse(args) as {
      periodo_inicio?: string | null;
      periodo_fim?: string | null;
      fornecedores: Array<{
        nome: string;
        cnpj?: string | null;
        cpf?: string | null;
        uf?: string | null;
        tipo_imposto?: string | null;
        valor_total: number;
      }>;
    };

    if (data.modo === "SUBSTITUIR") {
      await supabase.from("fornecedores_entradas").delete().eq("cliente_id", data.cliente_id);
    }

    const rows = parsed.fornecedores.map((f) => {
      const isPF = !!f.cpf && !f.cnpj;
      return {
        cliente_id: data.cliente_id,
        periodo_inicio: parsed.periodo_inicio ?? null,
        periodo_fim: parsed.periodo_fim ?? null,
        nome: f.nome,
        cnpj: f.cnpj ?? null,
        cpf: f.cpf ?? null,
        uf: f.uf ?? null,
        tipo_imposto: f.tipo_imposto ?? null,
        valor_total: Number(f.valor_total ?? 0),
        regime: (isPF ? "PF" : f.cnpj ? "PENDENTE" : null) as RegimeFornecedor | null,
        credito_cbs: 0,
      };
    });

    if (rows.length > 0) {
      const { error } = await supabase.from("fornecedores_entradas").insert(rows);
      if (error) throw new Error(`Falha ao salvar fornecedores: ${error.message}`);
    }

    return {
      total: rows.length,
      periodo_inicio: parsed.periodo_inicio ?? null,
      periodo_fim: parsed.periodo_fim ?? null,
    };
  });

// ─────────────────────────────────────────────────────────────
// 2) Consulta ReceitaWS (plano pago) — 1 fornecedor por chamada
// ─────────────────────────────────────────────────────────────
export const consultarRegimeReceita = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fornecedor_id: string }) =>
    z.object({ fornecedor_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const token = process.env.RECEITAWS_TOKEN;
    if (!token) throw new Error("RECEITAWS_TOKEN não configurado");

    const { data: forn, error } = await supabase
      .from("fornecedores_entradas")
      .select("id, cnpj, valor_total")
      .eq("id", data.fornecedor_id)
      .maybeSingle();
    if (error || !forn) throw new Error("Fornecedor não encontrado");
    if (!forn.cnpj) throw new Error("Fornecedor sem CNPJ");

    const cnpjLimpo = forn.cnpj.replace(/\D/g, "");
    const resp = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpjLimpo}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (resp.status === 429) throw new Error("Rate limit ReceitaWS — aguarde alguns segundos");
    if (!resp.ok) throw new Error(`ReceitaWS retornou ${resp.status}`);

    const rf = (await resp.json()) as {
      nome?: string;
      situacao?: string;
      simples?: { optante?: boolean };
      simei?: { optante?: boolean };
      atividade_principal?: Array<{ code?: string; text?: string }>;
      status?: string;
      message?: string;
    };

    if (rf.status === "ERROR") throw new Error(rf.message ?? "Erro na ReceitaWS");

    let regime: RegimeFornecedor;
    if (rf.situacao && rf.situacao.toUpperCase() !== "ATIVA") regime = "IRREGULAR";
    else if (rf.simei?.optante === true) regime = "MEI";
    else if (rf.simples?.optante === true) regime = "SIMPLES";
    else regime = "NORMAL";

    // Bloco 14: CNAE principal define o enquadramento setorial do fornecedor
    const cnae = rf.atividade_principal?.[0]?.code ?? null;
    const tipoReceita = tipoReceitaPorCnae(cnae);

    const { cbs, simples } = await getParametrosCBS(supabase as never);
    const credito = calcularCredito(Number(forn.valor_total), regime, cbs, simples, tipoReceita);

    const { error: uerr } = await supabase
      .from("fornecedores_entradas")
      .update({
        regime,
        situacao_receita: rf.situacao ?? null,
        nome_receita: rf.nome ?? null,
        cnae,
        tipo_receita_fornecedor: tipoReceita,
        credito_cbs: credito,
        data_consulta_regime: new Date().toISOString(),
      } as never)
      .eq("id", forn.id);
    if (uerr) throw new Error(uerr.message);

    return {
      regime,
      credito_cbs: credito,
      situacao: rf.situacao ?? null,
      cnae,
      tipo_receita_fornecedor: tipoReceita,
    };
  });


// ─────────────────────────────────────────────────────────────
// 3) Atualiza CNPJ manualmente e re-consulta
// ─────────────────────────────────────────────────────────────
export const definirCnpjManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fornecedor_id: string; cnpj: string }) =>
    z.object({
      fornecedor_id: z.string().uuid(),
      cnpj: z.string().min(14),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const clean = data.cnpj.replace(/\D/g, "");
    if (clean.length !== 14) throw new Error("CNPJ inválido");
    const formatado = `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;

    const { error } = await supabase
      .from("fornecedores_entradas")
      .update({ cnpj: formatado, cnpj_inserido_manualmente: true, regime: "PENDENTE" })
      .eq("id", data.fornecedor_id);
    if (error) throw new Error(error.message);
    return { ok: true, cnpj: formatado };
  });
