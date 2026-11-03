// Bloco 15A — Perfil de clientes do contribuinte (repartição da receita por tipo de cliente).
// Só a categoria "PJ do regime regular" aproveita crédito de IBS/CBS.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CATEGORIAS_CLIENTE,
  extrairPerfilClientesDominio,
  usePerfilClientes,
  type LinhaPerfilCliente,
} from "@/hooks/useBloco15A";
import type { CategoriaCliente } from "@/lib/tax-engine/calc";

type Valores = Record<CategoriaCliente, string>;

const vazio = (): Valores => ({
  pj_regime_regular: "",
  pj_simples: "",
  pessoa_fisica: "",
  orgao_publico: "",
  exterior: "",
});

const paraNumero = (v: string) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function PerfilClientesEditor({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const { data: linhas = [], isLoading } = usePerfilClientes(clienteId);
  const [valores, setValores] = useState<Valores>(vazio);
  const [origem, setOrigem] = useState<LinhaPerfilCliente["origem"]>("manual");
  const [textoDominio, setTextoDominio] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const v = vazio();
    for (const l of linhas) v[l.categoria] = String(Math.round(l.percentual_receita * 10000) / 100);
    setValores(v);
    if (linhas[0]?.origem) setOrigem(linhas[0].origem);
  }, [linhas]);

  const soma = Object.values(valores).reduce((a, v) => a + paraNumero(v), 0);
  const somaOk = Math.abs(soma - 100) < 0.01;

  function importarDominio() {
    const extraido = extrairPerfilClientesDominio(textoDominio);
    if (!extraido.length) {
      toast.error("Bloco CLIENTES não encontrado", {
        description:
          "Cole o trecho do relatório de Simulação da Reforma do Domínio que começa em CLIENTES.",
      });
      return;
    }
    const v = vazio();
    for (const l of extraido)
      v[l.categoria] = String(Math.round(l.percentual_receita * 10000) / 100);
    setValores(v);
    setOrigem("extraido_dominio");
    toast.success("Perfil importado do Domínio — confira e salve.");
  }

  async function salvar() {
    if (!somaOk) {
      toast.error("A soma precisa dar 100%", { description: `Soma atual: ${soma.toFixed(2)}%` });
      return;
    }
    setSalvando(true);
    try {
      const { error: delErr } = await supabase
        .from("perfil_clientes" as never)
        .delete()
        .eq("cliente_id", clienteId);
      if (delErr) throw delErr;
      const novas = CATEGORIAS_CLIENTE.filter((c) => paraNumero(valores[c.v]) > 0).map((c) => ({
        cliente_id: clienteId,
        categoria: c.v,
        percentual_receita: paraNumero(valores[c.v]) / 100,
        origem,
      }));
      if (novas.length) {
        const { error } = await supabase.from("perfil_clientes" as never).insert(novas as never);
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["perfil-clientes", clienteId] });
      toast.success("Perfil de clientes salvo");
    } catch (e) {
      toast.error("Não foi possível salvar o perfil", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSalvando(false);
    }
  }

  if (isLoading)
    return <p className="text-xs text-muted-foreground">Carregando perfil de clientes...</p>;

  return (
    <div className="space-y-3">
      <div>
        <p className="label-uppercase">Perfil de clientes — % da receita por tipo de cliente</p>
        <p className="text-xs text-muted-foreground mt-1">
          Só PJ do regime regular aproveita crédito de IBS/CBS. É o dado que decide entre manter o
          Simples unificado e o regime regular. A soma precisa dar 100%.
        </p>
      </div>
      <div className="grid gap-2">
        {CATEGORIAS_CLIENTE.map((c) => (
          <label key={c.v} className="flex items-center gap-3 text-sm">
            <span className="flex-1">
              {c.l}
              {c.credita && (
                <span className="ml-2 text-[10px] uppercase text-emerald-700">
                  aproveita crédito
                </span>
              )}
            </span>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="w-28 text-right"
              value={valores[c.v]}
              onChange={(e) => {
                setValores((v) => ({ ...v, [c.v]: e.target.value }));
                setOrigem("manual");
              }}
            />
            <span className="text-xs text-muted-foreground w-4">%</span>
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className={`text-xs ${somaOk ? "text-emerald-700" : "text-danger"}`}>
          Soma: {soma.toFixed(2)}% {origem === "extraido_dominio" && "· importado do Domínio"}
        </span>
        <Button type="button" size="sm" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar perfil de clientes"}
        </Button>
      </div>
      <details className="rounded-md border border-border p-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium">
          Importar do relatório de Simulação da Reforma (Domínio)
        </summary>
        <Textarea
          rows={5}
          className="mt-2 font-mono text-xs"
          placeholder={
            "CLIENTES\nRegime de Apuração        Valor Contábil        %\nNormal                        35.119,10    100,00 %"
          }
          value={textoDominio}
          onChange={(e) => setTextoDominio(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={importarDominio}
        >
          Ler bloco CLIENTES
        </Button>
      </details>
    </div>
  );
}
