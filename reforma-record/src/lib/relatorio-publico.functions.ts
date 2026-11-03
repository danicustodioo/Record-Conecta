// Server function PÚBLICA: busca uma análise pelo link_token (sem auth)
// e registra o acesso em link_acessos para fins de auditoria.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAnaliseByToken = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ token: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data }) => {
    const { token } = data;

    const { data: analise, error } = await supabaseAdmin
      .from("analises")
      .select("*, cliente:clientes(*)")
      .eq("link_token", token)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!analise) throw new Error("LINK_INVALIDO");

    // Verifica expiração se houver
    if (analise.link_expira_em && new Date(analise.link_expira_em) < new Date()) {
      throw new Error("LINK_EXPIRADO");
    }

    // Só permite acessar análises concluídas (com resultados)
    if (!analise.resultados_calculo) {
      throw new Error("RELATORIO_NAO_DISPONIVEL");
    }

    // Registra acesso (best-effort, não falha se der erro)
    try {
      const ip = getRequestIP({ xForwardedFor: true }) ?? null;
      const ua = getRequestHeader("user-agent") ?? null;
      await supabaseAdmin.from("link_acessos").insert({
        analise_id: analise.id,
        ip_address: ip,
        user_agent: ua,
      });
      // Incrementa contador na análise
      await supabaseAdmin
        .from("analises")
        .update({ link_acessos: (analise.link_acessos ?? 0) + 1 })
        .eq("id", analise.id);
    } catch (e) {
      console.error("Falha ao registrar acesso:", e);
    }

    return { analise };
  });

export const regerarTokenAnalise = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ analiseId: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data }) => {
    // Gera novo UUID via banco
    const { data: row, error } = await supabaseAdmin
      .from("analises")
      .update({
        link_token: crypto.randomUUID(),
        link_acessos: 0,
      })
      .eq("id", data.analiseId)
      .select("link_token")
      .single();
    if (error) throw new Error(error.message);
    return { link_token: row.link_token };
  });
