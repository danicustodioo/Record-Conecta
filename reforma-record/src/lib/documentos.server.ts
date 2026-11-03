// Bloco 14A — Helpers server-only da central de documentos.
// Isolados aqui para manter *.functions.ts como wrapper fino.

import { mensagemErroIA } from "@/lib/ai-gateway";

type ToolCallResp = {
  choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>;
};

/** Chamada padrão ao Lovable AI Gateway exigindo saída estruturada via tool call. */
export async function chamarIaEstruturada<T>(params: {
  system: string;
  user: string;
  toolName: string;
  parameters: Record<string, unknown>;
  model?: string;
}): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("IA não configurada no projeto");

  let resp: Response;
  try {
    resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model ?? "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: params.system },
          { role: "user", content: params.user },
        ],
        tools: [
          {
            type: "function",
            function: { name: params.toolName, parameters: params.parameters },
          },
        ],
        tool_choice: { type: "function", function: { name: params.toolName } },
      }),
    });
  } catch (e) {
    throw new Error(mensagemErroIA(e));
  }

  if (!resp.ok) {
    throw new Error(mensagemErroIA(new Error(`${resp.status} ${await resp.text()}`)));
  }

  const json = (await resp.json()) as ToolCallResp;
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("A IA não retornou dados estruturados. Tente novamente.");
  return JSON.parse(args) as T;
}

export type ReceitaWsCnpj = {
  nome?: string;
  fantasia?: string;
  situacao?: string;
  porte?: string;
  natureza_juridica?: string;
  municipio?: string;
  uf?: string;
  simples?: { optante?: boolean };
  simei?: { optante?: boolean };
  atividade_principal?: Array<{ code?: string; text?: string }>;
  atividades_secundarias?: Array<{ code?: string; text?: string }>;
  status?: string;
  message?: string;
};

export async function consultarReceitaWs(cnpj: string): Promise<ReceitaWsCnpj> {
  const token = process.env["RECEITAWS_TOKEN"];
  const limpo = cnpj.replace(/\D/g, "");
  if (limpo.length !== 14) throw new Error("CNPJ inválido");

  const resp = await fetch(`https://receitaws.com.br/v1/cnpj/${limpo}`, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (resp.status === 429) throw new Error("Muitas consultas à Receita — aguarde alguns segundos.");
  if (!resp.ok) throw new Error(`Consulta à Receita retornou ${resp.status}`);

  const rf = (await resp.json()) as ReceitaWsCnpj;
  if (rf.status === "ERROR") throw new Error(rf.message ?? "Erro na consulta da Receita");
  return rf;
}
