// Fallback de leitura para PDFs do Domínio com encoding Identity-H sem
// ToUnicode: as páginas são renderizadas em imagem no navegador e transcritas
// aqui por IA (Gemini via Lovable AI Gateway), preservando o layout tabular.

import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider, mensagemErroIA } from "./ai-gateway";

export const ocrPaginasPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      imagens: z.array(z.string().min(100)).min(1).max(12),
    }).parse,
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente — habilite o AI Gateway.");
    const gateway = createLovableAiGatewayProvider(apiKey);

    try {
      const partes: string[] = [];
      for (let i = 0; i < data.imagens.length; i++) {
        const { text } = await generateText({
          model: gateway("google/gemini-3-flash-preview"),
          system:
            "Você transcreve relatórios contábeis brasileiros (sistema Domínio) a partir de imagens. Transcreva FIELMENTE todo o texto visível, preservando colunas com espaços (estilo pdftotext -layout). Não resuma, não comente, não use markdown.",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Transcreva integralmente esta página do relatório." },
                { type: "image", image: data.imagens[i]! },
              ],
            },
          ],
        });
        partes.push(`=== Página ${i + 1} ===\n${text.trim()}`);
      }
      return { ok: true as const, texto: partes.join("\n\n") };
    } catch (e) {
      const msg = mensagemErroIA(e);
      console.error("[ocrPaginasPdf] falha:", e);
      return { ok: false as const, texto: "", error: msg };
    }
  });
