// Gera diagnóstico interpretativo da análise usando Gemini 2.5 Pro
// (via Lovable AI Gateway) e armazena em analises.diagnostico_ia.

import { createServerFn } from "@tanstack/react-start";
import { CBS_2027_PADRAO } from "@/lib/tax-engine/parametros";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REGIME_LABEL: Record<string, string> = {
  SIMPLES: "Simples Nacional",
  SIMPLES_2027: "Simples unificado 2027",
  HIBRIDO: "Simples + regime regular IBS/CBS",
  LP: "Lucro Presumido",
  LR: "Lucro Real",
  LP_2026: "Lucro Presumido (2026)",
  LP_2027: "Lucro Presumido (2027)",
  LR_2026: "Lucro Real (2026)",
  LR_2027: "Lucro Real (2027)",
};


export type DiagnosticoIA = {
  pontos_positivos: { titulo: string; descricao: string }[];
  pontos_alerta: { titulo: string; descricao: string }[];
  solucoes: { titulo: string; descricao: string; prazo: string }[];
  gerado_em: string;
  modelo: string;
};

export const gerarDiagnosticoIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { analise_id: string; force?: boolean }) =>
    z.object({ analise_id: z.string().uuid(), force: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<DiagnosticoIA> => {
    const { supabase } = context;

    const { data: analise, error: errA } = await supabase
      .from("analises")
      .select("id, cliente_id, resultados_calculo, dados_dre, diagnostico_ia")
      .eq("id", data.analise_id)
      .maybeSingle();
    if (errA) throw new Error(errA.message);
    if (!analise) throw new Error("Análise não encontrada");

    // Cache: já existe diagnóstico e não foi pedido refresh
    if (!data.force && analise.diagnostico_ia) {
      return analise.diagnostico_ia as DiagnosticoIA;
    }

    const { data: cliente, error: errC } = await supabase
      .from("clientes")
      .select("razao_social, cnpj, setor, subsetor, regime_atual, rbt12, pct_b2b, pct_b2c, num_funcionarios")
      .eq("id", analise.cliente_id)
      .maybeSingle();
    if (errC) throw new Error(errC.message);
    if (!cliente) throw new Error("Cliente não encontrado");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const r = analise.resultados_calculo as {
      recomendado: string;
      economia_anual: number;
      receita_anual?: number;
      meses_dre?: number;
      cbs_aliquota_base?: number;
      cbs_aliquota_media_efetiva?: number;
      socios_habilitados?: boolean | null;
      alertas?: string[];
      cbs_detalhe?: Array<{
        descricao: string;
        descricao_livre?: string | null;
        base: number;
        reducao: number;
        aliquota_efetiva: number;
        cbs: number;
        artigo: string;
        monofasico: boolean;
        gera_credito_adquirente: boolean;
        reducao_negada_societaria: boolean;
      }>;
      cenarios: Array<{
        regime: string;
        carga_total: number;
        carga_pct: number;
        lucro_liquido: number;
        elegivel?: boolean;
        motivo_inelegibilidade?: string | null;
        detalhamento: Record<string, number>;
      }>;
    } | null;
    if (!r) throw new Error("Análise sem resultados calculados");

    const receitaAnual = Number(r.receita_anual ?? 0) || Number(cliente.rbt12 ?? 0);
    const elegiveis = r.cenarios.filter((c) => c.elegivel !== false && c.carga_total > 0);
    const inelegiveis = r.cenarios.filter((c) => c.elegivel === false);

    const cenariosTxt = elegiveis
      .map(
        (c) =>
          `- ${REGIME_LABEL[c.regime] ?? c.regime}: carga R$ ${c.carga_total.toFixed(0)} (${(c.carga_pct * 100).toFixed(2)}%), lucro líquido R$ ${c.lucro_liquido.toFixed(0)}`,
      )
      .join("\n");

    const inelegiveisTxt = inelegiveis.length
      ? `\nREGIMES LEGALMENTE IMPEDIDOS (NUNCA os recomende nem os cite como opção viável):\n${inelegiveis
          .map((c) => `- ${REGIME_LABEL[c.regime] ?? c.regime}: ${c.motivo_inelegibilidade ?? "impedimento legal"}`)
          .join("\n")}\n`
      : "";

    // Bloco 14: a IA só pode citar as alíquotas já resolvidas pelo motor.
    const linhas = r.cbs_detalhe ?? [];
    const enquadramentoTxt = linhas.length
      ? `\nENQUADRAMENTO SETORIAL DA RECEITA (fonte única de alíquotas — use SOMENTE estes números):\n${linhas
          .map(
            (l) =>
              `- ${l.descricao}${l.descricao_livre ? ` (${l.descricao_livre})` : ""}: base R$ ${l.base.toFixed(0)}, ` +
              `redução ${(l.reducao * 100).toFixed(0)}%, alíquota efetiva de CBS ${(l.aliquota_efetiva * 100).toFixed(3)}%, ` +
              `CBS R$ ${l.cbs.toFixed(0)} — ${l.artigo} [status: ${(l as { status?: string }).status ?? "lei"}]` +
              `${l.monofasico ? " [MONOFÁSICO: sem débito na revenda e sem crédito ao adquirente]" : ""}` +
              `${!l.gera_credito_adquirente && !l.monofasico ? " [VEDA CRÉDITO ao cliente adquirente]" : ""}` +
              `${l.reducao_negada_societaria ? " [REDUÇÃO NEGADA: quadro societário não confirmado]" : ""}`,
          )
          .join("\n")}\nAlíquota média efetiva de CBS desta empresa: ${(
            (r.cbs_aliquota_media_efetiva ?? CBS_2027_PADRAO) * 100
          ).toFixed(3)}% (base de referência: ${((r.cbs_aliquota_base ?? CBS_2027_PADRAO) * 100).toFixed(1)}% [status: calculada pelo TCU, pendente de resolução do Senado até 15/12/2026]).${
            Number((r as { saldo_credor_cbs?: number }).saldo_credor_cbs ?? 0) > 0
              ? `\nSALDO CREDOR DE CBS APURADO: R$ ${Number((r as { saldo_credor_cbs?: number }).saldo_credor_cbs).toFixed(0)} — crédito das entradas superior ao débito reduzido das saídas.`
              : ""
          }\n`
      : `\nATENÇÃO: a receita NÃO foi segregada por linha. O cálculo aplicou a alíquota cheia de ${(
          (r.cbs_aliquota_base ?? CBS_2027_PADRAO) * 100
        ).toFixed(1)}% sobre toda a receita. Cite isso como ponto de alerta e recomende a segregação.\n`;

    const alertasTxt = (r.alertas ?? []).length
      ? `\nALERTAS APURADOS PELO MOTOR (incorpore os relevantes):\n${(r.alertas ?? [])
          .map((a) => `- ${a}`)
          .join("\n")}\n`
      : "";

    const prompt = `Você é consultor tributário sênior especializado na Reforma Tributária brasileira (LC 214/2025).
Analise os dados desta empresa e gere um diagnóstico interpretativo prático e direto, em português brasileiro.

EMPRESA: ${cliente.razao_social} (${cliente.cnpj})
Setor: ${cliente.setor}${cliente.subsetor ? ` / ${cliente.subsetor}` : ""}
Regime atual: ${cliente.regime_atual}
Receita bruta anualizada (base do estudo): R$ ${receitaAnual.toFixed(0)}${r.meses_dre ? ` (DRE de ${r.meses_dre} meses, anualizada)` : ""}
Mix de clientes: ${cliente.pct_b2b ?? 0}% B2B / ${cliente.pct_b2c ?? 100}% B2C
Funcionários: ${cliente.num_funcionarios ?? 0}
Sócios profissionais habilitados confirmados: ${
      r.socios_habilitados === true ? "sim" : r.socios_habilitados === false ? "não" : "não informado"
    }

CÁLCULOS (apenas regimes aplicáveis):
Regime recomendado: ${REGIME_LABEL[r.recomendado] ?? r.recomendado}
Economia anual vs. pior cenário aplicável: R$ ${r.economia_anual.toFixed(0)}

${cenariosTxt}
${inelegiveisTxt}${enquadramentoTxt}${alertasTxt}
REGRAS ABSOLUTAS SOBRE ALÍQUOTAS:
- NUNCA invente, arredonde ou generalize alíquotas. Use exclusivamente os percentuais listados acima.
- NUNCA afirme que a empresa paga a alíquota cheia de CBS quando houver linha com redução setorial: cite a alíquota efetiva da linha.
- Trate a alíquota base como calculada pelo TCU e pendente de resolução do Senado Federal até 15/12/2026 (LC 214/2025, art. 14).
- Ao citar um benefício setorial, mencione o artigo da LC 214/2025 indicado na linha.
- Quando a linha vedar crédito ao adquirente, alerte sobre a perda de competitividade em vendas B2B.
- Não afirme que reduções se acumulam: cada linha de receita tem um único enquadramento.

Gere EXATAMENTE 3 seções, cada uma com 3 itens curtos e específicos a esta empresa:
1. pontos_positivos: oportunidades concretas (créditos, redução de carga, vantagens setoriais)
2. pontos_alerta: riscos e atenções (prazos, impactos da reforma, mudanças de regime, impedimentos legais)
3. solucoes: ações práticas com prazo (datas/marcos entre 2026 e 2033)

Cada item tem "titulo" (até 8 palavras) e "descricao" (1-2 frases concretas com números reais).
Soluções têm também "prazo" (ex: "Até 20/12/2026", "Jan/2027", "2033").`;


    const body = {
      model: "google/gemini-2.5-pro",

      messages: [
        {
          role: "system",
          content:
            "Você é consultor tributário brasileiro e responde em JSON estruturado. " +
            "Você narra e interpreta resultados já calculados. Você NÃO calcula alíquota, NÃO define enquadramento " +
            "setorial e NÃO cita dispositivo legal que não esteja presente no payload recebido. Se um dado não " +
            "estiver no payload, diga que não foi apurado. Toda menção a alíquota deve indicar se o status é " +
            "'lei' ou 'estimativa'.",
        },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "gerar_diagnostico",
            description: "Retorna diagnóstico tributário estruturado",
            parameters: {
              type: "object",
              properties: {
                pontos_positivos: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      titulo: { type: "string" },
                      descricao: { type: "string" },
                    },
                    required: ["titulo", "descricao"],
                    additionalProperties: false,
                  },
                },
                pontos_alerta: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      titulo: { type: "string" },
                      descricao: { type: "string" },
                    },
                    required: ["titulo", "descricao"],
                    additionalProperties: false,
                  },
                },
                solucoes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      titulo: { type: "string" },
                      descricao: { type: "string" },
                      prazo: { type: "string" },
                    },
                    required: ["titulo", "descricao", "prazo"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["pontos_positivos", "pontos_alerta", "solucoes"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "gerar_diagnostico" } },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      if (resp.status === 403) throw new Error("Acesso à IA bloqueado: limite de créditos do workspace atingido ou IA desabilitada. Um administrador precisa ajustar o limite em Settings > Workspace > Usage.");
      if (resp.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em alguns instantes.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos em Settings > Workspace.");
      const t = await resp.text();
      console.error("Lovable AI error:", resp.status, t);
      throw new Error(`Falha na IA (${resp.status})`);
    }

    const json = (await resp.json()) as {
      choices: Array<{
        message: {
          tool_calls?: Array<{ function: { arguments: string } }>;
        };
      }>;
    };

    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("IA não retornou resposta estruturada");

    const parsed = JSON.parse(args) as Omit<DiagnosticoIA, "gerado_em" | "modelo">;
    const diagnostico: DiagnosticoIA = {
      pontos_positivos: parsed.pontos_positivos?.slice(0, 3) ?? [],
      pontos_alerta: parsed.pontos_alerta?.slice(0, 3) ?? [],
      solucoes: parsed.solucoes?.slice(0, 4) ?? [],
      gerado_em: new Date().toISOString(),
      modelo: "google/gemini-2.5-pro",
    };

    const { error: errU } = await supabase
      .from("analises")
      .update({ diagnostico_ia: diagnostico })
      .eq("id", data.analise_id);
    if (errU) console.error("Falha ao salvar diagnóstico:", errU.message);

    return diagnostico;
  });
