import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const createLovableAiGatewayProvider = (lovableApiKey: string) =>
  createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });

/**
 * Traduz falhas do AI Gateway em mensagens acionáveis para o usuário.
 * Sem isso, um 403 de limite de créditos chega na tela apenas como "Forbidden".
 */
export function mensagemErroIA(e: unknown): string {
  const bruto = e instanceof Error ? e.message : String(e);
  const extra =
    typeof e === "object" && e !== null
      ? String((e as { responseBody?: unknown }).responseBody ?? "")
      : "";
  const alvo = `${bruto} ${extra}`;

  if (/credit_limit_reached|credit limit/i.test(alvo)) {
    return "Limite de créditos de IA do workspace atingido. O proprietário do workspace precisa aumentar o limite (Settings > Workspace > Usage) para voltar a processar os PDFs.";
  }
  if (/402|insufficient|top_up|add credits/i.test(alvo)) {
    return "Créditos de IA esgotados. Adicione créditos no workspace para retomar a leitura dos PDFs.";
  }
  if (/^Forbidden$|\b403\b|admin_action|disabled/i.test(alvo)) {
    return "Acesso à IA bloqueado por política do workspace (IA desabilitada ou limite administrativo). Peça a um administrador para liberar o uso de IA.";
  }
  if (/\b401\b|Unauthorized|API_KEY/i.test(alvo)) {
    return "Configuração de IA inválida no projeto. É necessário reprovisionar a chave do AI Gateway.";
  }
  if (/\b429\b|rate limit/i.test(alvo)) {
    return "Muitas requisições de IA em sequência. Aguarde alguns segundos e tente novamente.";
  }
  if (/\b5\d\d\b/.test(alvo)) {
    return "O serviço de IA está instável neste momento. Tente novamente em instantes.";
  }
  return bruto;
}
