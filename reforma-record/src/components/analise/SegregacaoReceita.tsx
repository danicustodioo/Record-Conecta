// Bloco 14 — Etapa de segregação de receita por linha (enquadramento setorial).
// Um mesmo CNPJ pode ter várias alíquotas de CBS. Sem esta etapa o motor aplica
// alíquota cheia (regime regular) em toda a receita.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { REGIMES_SETORIAIS_FALLBACK, type RegimeSetorial } from "@/lib/enquadramento";
import { AVISO_NAO_IDENTIFICADO, tipoReceitaSugeridoPorCnae } from "@/lib/documentos-catalogo";
import { extrairSegregacaoSaidas } from "@/lib/documentos.functions";
import { formatarFatorAnualizacao } from "@/lib/dre-periodo";

export type ReceitaLinhaRow = {
  id: string;
  tipo_receita: string;
  descricao_livre: string | null;
  valor_periodo: number;
  meses: number;
  valor_anualizado: number;
  descricao_operacao?: string | null;
  cfop?: string | null;
  imposto_destacado?: string | null;
  origem?: string | null;
  requer_atencao?: boolean | null;
  conferido_em?: string | null;
};

export function useRegimesSetoriais() {
  return useQuery({
    queryKey: ["regimes-setoriais"],
    queryFn: async (): Promise<Record<string, RegimeSetorial>> => {
      const { data, error } = await supabase
        .from("regimes_setoriais" as never)
        .select("*");
      if (error || !data) return REGIMES_SETORIAIS_FALLBACK;
      const dic: Record<string, RegimeSetorial> = {};
      for (const r of data as unknown as RegimeSetorial[]) {
        dic[r.tipo_receita] = { ...r, reducao: Number(r.reducao) };
      }
      return Object.keys(dic).length ? dic : REGIMES_SETORIAIS_FALLBACK;
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useReceitasLinhas(analiseId: string) {
  return useQuery({
    queryKey: ["receitas-cliente", analiseId],
    queryFn: async (): Promise<ReceitaLinhaRow[]> => {
      const { data, error } = await supabase
        .from("receitas_cliente" as never)
        .select("*")
        .eq("analise_id", analiseId);
      if (error) return [];
      return ((data ?? []) as unknown as ReceitaLinhaRow[]).map((r) => ({
        ...r,
        valor_periodo: Number(r.valor_periodo),
        valor_anualizado: Number(r.valor_anualizado),
      }));
    },
  });
}

export function SegregacaoReceita({
  clienteId,
  analiseId,
  receitaAnual,
  receitaPeriodo,
  mesesDre,
  cnaePrincipal,
}: {
  clienteId: string;
  analiseId: string;
  receitaAnual: number;
  receitaPeriodo: number;
  mesesDre: number | null;
  cnaePrincipal?: string | null;
}) {
  const qc = useQueryClient();
  const { data: regimes = REGIMES_SETORIAIS_FALLBACK } = useRegimesSetoriais();
  const { data: linhas = [] } = useReceitasLinhas(analiseId);
  const extrairSaidas = useServerFn(extrairSegregacaoSaidas);

  // Correção 1 — a classificação padrão vem do CNAE principal, não de "regular".
  const tipoCnae = tipoReceitaSugeridoPorCnae(cnaePrincipal);
  const [tipo, setTipo] = useState(tipoCnae);
  const [tipoTocado, setTipoTocado] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [autoBusy, setAutoBusy] = useState(false);

  useEffect(() => {
    if (!tipoTocado) setTipo(tipoCnae);
  }, [tipoCnae, tipoTocado]);

  const total = useMemo(() => linhas.reduce((a, l) => a + l.valor_anualizado, 0), [linhas]);
  const diff = receitaAnual - total;
  const conferido = receitaAnual > 0 && Math.abs(diff) <= Math.max(1, receitaAnual * 0.005);
  const divergenciaPct = receitaAnual > 0 && total > 0 ? Math.abs(diff) / receitaAnual : 0;
  const divergeMais1pct = linhas.length > 0 && divergenciaPct > 0.01;
  const fator = mesesDre ? 12 / mesesDre : null;
  const periodoResumo = mesesDre
    ? `período de ${mesesDre} ${mesesDre === 1 ? "mês" : "meses"} · fator ${formatarFatorAnualizacao(fator ?? 1)}`
    : "período da DRE não identificado";

  const regimeCnae = regimes[tipoCnae] ?? REGIMES_SETORIAIS_FALLBACK[tipoCnae];
  const cnaeIndicaSetorial = tipoCnae !== "regular";
  const linhasRegularComCnaeSetorial = cnaeIndicaSetorial
    ? linhas.filter((l) => l.tipo_receita === "regular")
    : [];
  const avisoCnae = regimeCnae
    ? `CNAE indica ${regimeCnae.descricao} — confira se a alíquota cheia está correta.`
    : null;

  const add = useMutation({
    mutationFn: async (payload: { tipo_receita: string; descricao_livre: string; valor: number; meses: number }) => {
      const { error } = await supabase.from("receitas_cliente" as never).insert({
        cliente_id: clienteId,
        analise_id: analiseId,
        tipo_receita: payload.tipo_receita,
        descricao_livre: payload.descricao_livre || null,
        valor_periodo: payload.valor,
        meses: payload.meses,
        origem: "manual",
        // Entra como sugestão pendente de conferência, sempre editável.
        conferido_por: null,
        conferido_em: null,
        requer_atencao: payload.tipo_receita === "regular" && cnaeIndicaSetorial,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setValor("");
      setDescricao("");
      qc.invalidateQueries({ queryKey: ["receitas-cliente", analiseId] });
    },
    onError: (e: Error) => toast.error("Falha ao salvar linha de receita", { description: e.message }),
  });

  const reclassificar = useMutation({
    mutationFn: async (p: { rowId: string; tipo_receita: string }) => {
      const { error } = await supabase
        .from("receitas_cliente" as never)
        .update({ tipo_receita: p.tipo_receita, requer_atencao: false } as never)
        .eq("id", p.rowId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["receitas-cliente", analiseId] }),
    onError: (e: Error) => toast.error("Falha ao reclassificar", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("receitas_cliente" as never).delete().eq("id", rowId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["receitas-cliente", analiseId] }),
  });

  function preencherTotal() {
    if (!mesesDre) return toast.error("Confirme o período da DRE antes de lançar a receita");
    if (!(receitaPeriodo > 0)) return;
    add.mutate({
      tipo_receita: tipoCnae,
      descricao_livre: "Receita total (não segregada)",
      valor: receitaPeriodo,
      meses: mesesDre,
    });
  }

  /** Localiza o PDF de saídas já anexado (Central de Documentos ou anexos da análise). */
  async function baixarPdfSaidas(): Promise<Blob | null> {
    const central = await supabase
      .from("documentos_cliente" as never)
      .select("arquivo_path, nome_arquivo, updated_at")
      .eq("cliente_id", clienteId)
      .eq("codigo_documento", "saidas")
      .order("updated_at", { ascending: false })
      .limit(1);
    const cPath = (central.data as { arquivo_path?: string | null }[] | null)?.[0]?.arquivo_path;
    if (cPath) {
      const { data } = await supabase.storage.from("documentos-dominio").download(cPath);
      if (data) return data;
    }

    const anexo = await supabase
      .from("documentos")
      .select("storage_path, created_at")
      .eq("analise_id", analiseId)
      .eq("tipo", "SAIDAS")
      .order("created_at", { ascending: false })
      .limit(1);
    const aPath = (anexo.data as { storage_path?: string | null }[] | null)?.[0]?.storage_path;
    if (aPath) {
      const { data } = await supabase.storage.from("pdfs").download(aPath);
      if (data) return data;
    }
    return null;
  }

  /** Correção 2 — preenchimento automático das linhas a partir do livro de saídas. */
  async function preencherAutomatico() {
    if (!mesesDre) {
      toast.error("Confirme o período da DRE antes do preenchimento automático");
      return;
    }
    setAutoBusy(true);
    const t = toast.loading("Procurando o livro de Apurações de Saídas…");
    try {
      const blob = await baixarPdfSaidas();
      if (!blob) {
        toast.dismiss(t);
        if (!(receitaPeriodo > 0)) {
          toast.error("Nenhum PDF de saídas encontrado", {
            description: "Envie o livro de Apurações de Saídas na Central de Documentos.",
          });
          return;
        }
        preencherTotal();
        toast.warning("Nenhum PDF de saídas encontrado", {
          description: `Receita total lançada como ${regimeCnae?.descricao ?? "regime regular"} — confira a segregação.`,
        });
        return;
      }

      toast.loading("Lendo o livro de saídas e sugerindo a segregação…", { id: t });
      const { extractPdfText } = await import("@/lib/pdf-extract.browser");
      const file = new File([blob], "saidas.pdf", { type: "application/pdf" });
      const texto = await extractPdfText(file);
      const res = await extrairSaidas({
        data: {
          cliente_id: clienteId,
          analise_id: analiseId,
          texto,
          meses: mesesDre,
          modo: "SUBSTITUIR",
        },
      });
      await qc.invalidateQueries({ queryKey: ["receitas-cliente", analiseId] });

      const anualExtraido = res.total_extraido * (12 / mesesDre);
      const desvio = receitaAnual > 0 ? Math.abs(receitaAnual - anualExtraido) / receitaAnual : 0;
      toast.success(`${res.linhas} linha(s) de receita sugeridas`, {
        id: t,
        description: res.atencao
          ? `${res.atencao} linha(s) sem natureza identificada — em amarelo, classificadas na alíquota cheia por precaução.`
          : "Sugestões pendentes de conferência — revise cada linha.",
      });
      if (desvio > 0.01) {
        toast.warning("Soma das saídas divergente da DRE", {
          description: `Saídas anualizadas ${formatBRL(anualExtraido)} vs. DRE ${formatBRL(receitaAnual)} (${(desvio * 100).toFixed(1)}%).`,
        });
      }
    } catch (e) {
      toast.error("Falha no preenchimento automático", {
        id: t,
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setAutoBusy(false);
    }
  }

  const lista = Object.values(regimes).sort((a, b) => a.descricao.localeCompare(b.descricao));



  return (
    <Card className="border-navy/15" data-export-title="Segregação de receita por regime">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-navy flex items-center justify-between gap-3">
          <span>Segregação de receita por regime</span>
          {conferido ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Conferida
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500 text-amber-700">
              <AlertTriangle className="h-3 w-3 mr-1" /> Pendente
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          A alíquota de CBS não depende do regime tributário, e sim do tipo de receita (LC 214/2025).
          Um mesmo CNPJ pode ter várias alíquotas — separe cada linha abaixo.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[2fr_2fr_1fr_auto] items-end">
          <div>
            <Label className="text-xs">Tipo de receita</Label>
            <Select value={tipo} onValueChange={(v) => { setTipoTocado(true); setTipo(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {lista.map((r) => (
                  <SelectItem key={r.tipo_receita} value={r.tipo_receita}>
                    {r.descricao}
                    {r.monofasico
                      ? " · monofásico"
                      : r.reducao > 0
                        ? ` · −${(r.reducao * 100).toFixed(0)}%`
                        : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Descrição (opcional)</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: restaurante do hotel" />
          </div>
          <div>
            <Label className="text-xs">Valor no período (R$)</Label>
            <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const v = Number(valor.replace(/\./g, "").replace(",", "."));
                if (!(v > 0)) return toast.error("Informe um valor válido");
                if (!mesesDre) return toast.error("Confirme o período da DRE antes de adicionar receitas");
                add.mutate({ tipo_receita: tipo, descricao_livre: descricao, valor: v, meses: mesesDre });
              }}
              disabled={add.isPending || !mesesDre}
              className="bg-navy hover:bg-navy/90"
            >
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
            <Button
              variant="outline"
              onClick={preencherAutomatico}
              disabled={!mesesDre || autoBusy}
              title="Preencher automaticamente a partir do livro de Apurações de Saídas"
            >
              {autoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {linhas.length > 0 && (
          <div className="rounded-lg border border-navy/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-navy/5 text-navy">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Linha</th>
                  <th className="text-right px-3 py-2 font-medium">Redução</th>
                  <th className="text-right px-3 py-2 font-medium">Anualizado</th>
                  <th className="px-2" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, idx) => {
                  const r = regimes[l.tipo_receita] ?? REGIMES_SETORIAIS_FALLBACK["regular"];
                  return (
                    <motion.tr
                      key={l.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className={`border-t border-navy/5 ${l.requer_atencao ? "bg-amber-50" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <Select
                          value={l.tipo_receita}
                          onValueChange={(v) => reclassificar.mutate({ rowId: l.id, tipo_receita: v })}
                        >
                          <SelectTrigger className="h-8 text-xs font-medium text-navy border-navy/15">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {lista.map((op) => (
                              <SelectItem key={op.tipo_receita} value={op.tipo_receita}>
                                {op.descricao}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {l.descricao_livre ? `${l.descricao_livre} · ` : ""}{r.artigo}
                          {l.origem === "ia" ? " · sugerido pela leitura do documento" : ""}
                        </div>
                        {l.requer_atencao && (
                          <div className="text-[11px] text-amber-800 mt-1 flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            {AVISO_NAO_IDENTIFICADO}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.monofasico ? "Monofásico" : `${(r.reducao * 100).toFixed(0)}%`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatBRL(l.valor_anualizado)}</td>
                      <td className="px-2 py-2 text-right">
                        <Button size="icon" variant="ghost" onClick={() => remove.mutate(l.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-navy/10 bg-navy/[0.03] font-medium text-navy">
                  <td className="px-3 py-2">
                    <div>Total segregado</div>
                    <div className="text-[11px] font-normal text-muted-foreground">{periodoResumo}</div>
                  </td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!conferido && receitaAnual > 0 && (
          <p className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
            Receita bruta anualizada da DRE: <strong>{formatBRL(receitaAnual)}</strong>. Diferença a
            segregar: <strong>{formatBRL(diff)}</strong>. Sem a segregação completa o cálculo aplica
            alíquota cheia sobre toda a receita.
          </p>
        )}
        {divergeMais1pct && (
          <p className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
            A soma das linhas ({formatBRL(total)}) divergiu {(divergenciaPct * 100).toFixed(1)}% da receita bruta
            anualizada da DRE ({formatBRL(receitaAnual)}). Revise as linhas antes de gerar o relatório.
          </p>
        )}

        {avisoCnae && linhasRegularComCnaeSetorial.length > 0 && (
          <p className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {linhasRegularComCnaeSetorial.length} linha(s) classificada(s) como regime regular. {avisoCnae}
            </span>
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Base da DRE: {formatBRL(receitaPeriodo)} no {periodoResumo}. A coluna “Anualizado” já mostra o valor multiplicado pelo fator.
        </p>
      </CardContent>
    </Card>
  );
}
