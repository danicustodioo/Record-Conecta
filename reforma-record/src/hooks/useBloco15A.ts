// Bloco 15A — leitura dos parâmetros 2027, janelas de opção e perfil de clientes.
// Toda leitura tem padrão embutido: sem tabela (migration ainda não aplicada), o app continua funcionando.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  normalizarParametros,
  PARAMETROS_PADRAO,
  type ParametrosReforma,
} from "@/lib/tax-engine/parametros";
import { JANELAS_PADRAO, type JanelaOpcao } from "@/lib/tax-engine/janelas";
import type { CategoriaCliente } from "@/lib/tax-engine/calc";

export function useParametrosReforma() {
  return useQuery({
    queryKey: ["parametros-reforma-2027"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ParametrosReforma> => {
      const { data, error } = await supabase.from("parametros_reforma").select("*");
      if (error || !data?.length) return PARAMETROS_PADRAO;
      const rows = data as unknown as Array<Record<string, unknown>>;
      const comRef = rows.filter((r) => r.aliquota_cbs_referencia != null);
      const linha = (comRef.length ? comRef : rows).sort((a, b) =>
        String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
      )[0];
      return comRef.length ? normalizarParametros(linha) : PARAMETROS_PADRAO;
    },
  });
}

export function useJanelasOpcao() {
  return useQuery({
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
}

export type LinhaPerfilCliente = {
  id?: string;
  categoria: CategoriaCliente;
  percentual_receita: number; // 0..1
  valor_anualizado?: number | null;
  origem?: "manual" | "extraido_dominio" | "extraido_xml";
};

export const CATEGORIAS_CLIENTE: Array<{ v: CategoriaCliente; l: string; credita: boolean }> = [
  { v: "pj_regime_regular", l: "PJ do regime regular (Lucro Presumido/Real)", credita: true },
  { v: "pj_simples", l: "PJ optante do Simples / MEI", credita: false },
  { v: "pessoa_fisica", l: "Pessoa física", credita: false },
  { v: "orgao_publico", l: "Órgão público", credita: false },
  { v: "exterior", l: "Exterior", credita: false },
];

export function usePerfilClientes(clienteId?: string) {
  return useQuery({
    queryKey: ["perfil-clientes", clienteId],
    enabled: Boolean(clienteId),
    queryFn: async (): Promise<LinhaPerfilCliente[]> => {
      const { data, error } = await supabase
        .from("perfil_clientes" as never)
        .select("id, categoria, percentual_receita, valor_anualizado, origem")
        .eq("cliente_id", clienteId as string);
      if (error || !data) return [];
      return (data as unknown as LinhaPerfilCliente[]).map((l) => ({
        ...l,
        percentual_receita: Number(l.percentual_receita ?? 0),
      }));
    },
  });
}

/**
 * Lê o bloco CLIENTES do relatório de Simulação da Reforma do Domínio:
 *   Regime de Apuração        Valor Contábil        %
 *   Normal                        35.119,10    100,00 %
 * Normal → pj_regime_regular · Simples Nacional → pj_simples · etc.
 */
export function extrairPerfilClientesDominio(texto: string): LinhaPerfilCliente[] {
  const inicio = texto.search(/\bCLIENTES\b/);
  if (inicio < 0) return [];
  const trecho = texto.slice(inicio, inicio + 2000);
  const mapa: Array<[RegExp, CategoriaCliente]> = [
    [/^normal\b/i, "pj_regime_regular"],
    [/^(lucro\s+(real|presumido))\b/i, "pj_regime_regular"],
    [/^simples(\s+nacional)?\b|^mei\b/i, "pj_simples"],
    [/^(pessoa\s+f[ií]sica|consumidor\s+final|n[aã]o\s+contribuinte)\b/i, "pessoa_fisica"],
    [/^([oó]rg[aã]o\s+p[uú]blico|administra[cç][aã]o\s+p[uú]blica)\b/i, "orgao_publico"],
    [/^(exterior|exporta[cç][aã]o)\b/i, "exterior"],
  ];
  const acumulado = new Map<CategoriaCliente, { pct: number; valor: number }>();
  for (const bruta of trecho.split(/\r?\n/)) {
    const linha = bruta.trim();
    const m = linha.match(/^(.+?)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s*%/);
    if (!m) continue;
    const cat = mapa.find(([re]) => re.test(m[1].trim()))?.[1];
    if (!cat) continue;
    const valor = Number(m[2].replace(/\./g, "").replace(",", "."));
    const pct = Number(m[3].replace(/\./g, "").replace(",", ".")) / 100;
    const a = acumulado.get(cat) ?? { pct: 0, valor: 0 };
    acumulado.set(cat, { pct: a.pct + pct, valor: a.valor + valor });
  }
  return [...acumulado.entries()].map(([categoria, a]) => ({
    categoria,
    percentual_receita: a.pct,
    valor_anualizado: null,
    origem: "extraido_dominio" as const,
  }));
}
