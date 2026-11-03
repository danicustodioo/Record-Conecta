import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  JANELAS_PADRAO,
  fmtDataBR,
  hojeISO,
  janelaAberta,
  janelaCancelamento,
  type JanelaOpcao,
} from "@/lib/tax-engine/janelas";

// Bloco 15A — banner enquanto a janela de cancelamento estiver aberta (Res. CGSN 194/2026).
// Fora da janela, mostra a contagem até a próxima janela aberta ou futura.
export function CountdownBar() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: janelas } = useQuery({
    queryKey: ["janelas-opcao"],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<JanelaOpcao[]> => {
      const { data, error } = await supabase
        .from("janelas_opcao" as never)
        .select("descricao, data_inicio, data_fim, periodo_efeito, irretratavel, fonte")
        .order("data_inicio");
      if (error || !data || !(data as unknown[]).length) return JANELAS_PADRAO;
      return data as unknown as JanelaOpcao[];
    },
  });

  const lista = janelas ?? JANELAS_PADRAO;
  const hoje = hojeISO(new Date(now));
  const canc = janelaCancelamento(lista);

  if (canc && janelaAberta(canc, hoje)) {
    const fim = new Date(`${canc.data_fim}T23:59:59-03:00`).getTime();
    const dias = Math.max(0, Math.ceil((fim - now) / 86_400_000));
    return (
      <div className="bg-navy text-white border-b border-gold/30">
        <div className="px-6 py-2.5 flex items-center justify-center gap-3 text-sm flex-wrap text-center">
          <span className="inline-block h-2 w-2 rounded-full bg-gold animate-pulse" />
          <span className="text-gold/90 font-medium">
            Janela de cancelamento aberta até {fmtDataBR(canc.data_fim)} (
            <span className="num-display text-gold">{dias}</span> dias).
          </span>
          <span className="text-white/80">
            O cancelamento é irretratável para o período de {canc.periodo_efeito}. A resolução do
            Senado com a alíquota definitiva da CBS sai até 15/12/2026 — há cinco dias úteis entre
            as duas datas.
          </span>
        </div>
      </div>
    );
  }

  const proxima = lista.find((j) => j.data_fim >= hoje);
  if (!proxima) return null;
  const alvo = new Date(
    `${janelaAberta(proxima, hoje) ? proxima.data_fim : proxima.data_inicio}T00:00:00-03:00`,
  ).getTime();
  const dias = Math.max(0, Math.ceil((alvo - now) / 86_400_000));
  return (
    <div className="bg-navy text-white border-b border-gold/30">
      <div className="px-6 py-2.5 flex items-center justify-center gap-3 text-sm flex-wrap">
        <span className="inline-block h-2 w-2 rounded-full bg-gold animate-pulse" />
        <span className="text-gold/90 font-medium tracking-wide">
          {janelaAberta(proxima, hoje) ? "Aberta até " : "Faltam "}
          {janelaAberta(proxima, hoje) ? (
            fmtDataBR(proxima.data_fim)
          ) : (
            <>
              <span className="num-display text-gold">{dias}</span> dias para
            </>
          )}{" "}
          · {proxima.descricao}
        </span>
        <span className="text-white/60">
          · {fmtDataBR(proxima.data_inicio)} a {fmtDataBR(proxima.data_fim)} ({proxima.fonte})
        </span>
      </div>
    </div>
  );
}
