// Bloco 12 — Página de fornecedores por cliente
// Upload PDF → extração via IA → fila de consultas ReceitaWS com progresso → tabela + alertas.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Upload,
  Search,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileWarning,
  Building2,
} from "lucide-react";
import { formatBRL, formatCNPJ } from "@/lib/format";
import { extractPdfText } from "@/lib/pdf-extract.browser";
import {
  extrairFornecedoresDominio,
  consultarRegimeReceita,
  definirCnpjManual,
} from "@/lib/fornecedores-cnpj.functions";
import { regimePorTipo, tipoReceitaPorCnae } from "@/lib/enquadramento";

export const Route = createFileRoute("/_authenticated/clientes/$id/fornecedores")({
  component: FornecedoresClientePage,
});

type Fornecedor = {
  id: string;
  nome: string;
  cnpj: string | null;
  cpf: string | null;
  uf: string | null;
  tipo_imposto: string | null;
  valor_total: number;
  regime: string | null;
  situacao_receita: string | null;
  nome_receita: string | null;
  credito_cbs: number;
  cnpj_inserido_manualmente: boolean;
  data_consulta_regime: string | null;
  cnae: string | null;
  tipo_receita_fornecedor: string | null;
};

const DELAY_MS = 400; // plano pago — ~2,5/s conservador

function FornecedoresClientePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const extrair = useServerFn(extrairFornecedoresDominio);
  const consultar = useServerFn(consultarRegimeReceita);
  const definirCnpj = useServerFn(definirCnpjManual);
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [askModo, setAskModo] = useState<File | null>(null);
  const [consultProgress, setConsultProgress] = useState<{ atual: number; total: number } | null>(null);
  const [cnpjManualId, setCnpjManualId] = useState<string | null>(null);
  const [cnpjManualValue, setCnpjManualValue] = useState("");

  const { data: cliente } = useQuery({
    queryKey: ["cliente", id],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("razao_social, cnpj").eq("id", id).single();
      return data;
    },
  });

  const { data: fornecedores = [], refetch } = useQuery({
    queryKey: ["fornecedores-cliente", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fornecedores_entradas")
        .select("*")
        .eq("cliente_id", id)
        .order("valor_total", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fornecedor[];
    },
  });

  async function handleFile(file: File, modo: "SUBSTITUIR" | "ADICIONAR") {
    setUploading(true);
    try {
      const avisoFormato = () =>
        toast.info("Processando PDF...", {
          description: "Formato especial detectado — convertendo automaticamente. Aguarde.",
          duration: 4000,
        });

      toast.info("Lendo PDF…");
      const texto = await extractPdfText(file, avisoFormato);
      toast.info("Extraindo fornecedores com IA (Gemini 2.5 Pro)…");
      let res = await extrair({ data: { cliente_id: id, texto_pdf: texto, modo } });

      // Rede de segurança: texto legível mas sem fornecedores → refaz por OCR.
      if (!res.total) {
        avisoFormato();
        const textoOcr = await extractPdfText(file, undefined, true);
        res = await extrair({ data: { cliente_id: id, texto_pdf: textoOcr, modo } });
      }

      if (!res.total) {
        toast.warning("Nenhum fornecedor identificado neste relatório.");
      } else {
        toast.success(`${res.total} fornecedor(es) extraído(s)`);
      }
      qc.invalidateQueries({ queryKey: ["fornecedores-cliente", id] });

    } catch (e) {
      toast.error("Falha na extração", { description: (e as Error).message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (fornecedores.length > 0) setAskModo(f);
    else handleFile(f, "SUBSTITUIR");
  }

  async function consultarTodos() {
    const alvos = fornecedores.filter((f) => f.cnpj && (!f.regime || f.regime === "PENDENTE"));
    if (alvos.length === 0) {
      toast.info("Nada a consultar — todos já têm regime.");
      return;
    }
    setConsultProgress({ atual: 0, total: alvos.length });
    let ok = 0, fail = 0;
    for (let i = 0; i < alvos.length; i++) {
      setConsultProgress({ atual: i + 1, total: alvos.length });
      try {
        await consultar({ data: { fornecedor_id: alvos[i].id } });
        ok++;
      } catch (e) {
        fail++;
        console.warn("consulta falhou", alvos[i].cnpj, e);
      }
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    setConsultProgress(null);
    await refetch();
    toast.success(`Consulta concluída: ${ok} ok, ${fail} falhas`);
  }

  async function salvarCnpjManual() {
    if (!cnpjManualId) return;
    try {
      await definirCnpj({ data: { fornecedor_id: cnpjManualId, cnpj: cnpjManualValue } });
      toast.success("CNPJ atualizado. Consultando regime…");
      await consultar({ data: { fornecedor_id: cnpjManualId } });
      await refetch();
    } catch (e) {
      toast.error("Falha", { description: (e as Error).message });
    } finally {
      setCnpjManualId(null);
      setCnpjManualValue("");
    }
  }

  // Estatísticas
  const totalCompras = fornecedores.reduce((s, f) => s + Number(f.valor_total), 0);
  const totalCredito = fornecedores.reduce((s, f) => s + Number(f.credito_cbs), 0);
  const semRegime = fornecedores.filter((f) => !f.regime || f.regime === "PENDENTE").length;
  const irregulares = fornecedores.filter((f) => f.regime === "IRREGULAR");
  // Bloco 14B — fornecedores do regime normal cujo setor veda o crédito ao adquirente
  const vedados = fornecedores.filter((f) => {
    const setor = regimePorTipo(f.tipo_receita_fornecedor ?? tipoReceitaPorCnae(f.cnae));
    return f.regime === "NORMAL" && (!setor.gera_credito_adquirente || setor.monofasico);
  });
  const vedadosValor = vedados.reduce((s, f) => s + Number(f.valor_total), 0);
  const semCnpj = fornecedores.filter((f) => !f.cnpj && !f.cpf).length;
  const coberturaPct =
    totalCompras > 0
      ? Math.round(
          (fornecedores
            .filter((f) => f.regime === "NORMAL" || f.regime === "SIMPLES")
            .reduce((s, f) => s + Number(f.valor_total), 0) /
            totalCompras) *
            100,
        )
      : 0;

  const maiorFornecedor = fornecedores[0];
  const concentracaoPct =
    maiorFornecedor && totalCompras > 0 ? (Number(maiorFornecedor.valor_total) / totalCompras) * 100 : 0;

  const simplesCompras = fornecedores
    .filter((f) => f.regime === "SIMPLES")
    .reduce((s, f) => s + Number(f.valor_total), 0);
  const simplesPct = totalCompras > 0 ? (simplesCompras / totalCompras) * 100 : 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link
        to="/clientes/$id"
        params={{ id }}
        className="text-xs text-muted-foreground hover:text-navy inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar para o cliente
      </Link>

      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="label-uppercase">Análise de fornecedores</p>
          <h1 className="font-display text-3xl text-navy mt-1">{cliente?.razao_social ?? "Cliente"}</h1>
          {cliente?.cnpj && (
            <p className="text-sm text-muted-foreground mt-1 tabular-nums">CNPJ {formatCNPJ(cliente.cnpj)}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onPickFile}
          />
          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Carregar PDF de Entradas
          </Button>
          <Button
            onClick={consultarTodos}
            disabled={!!consultProgress || fornecedores.length === 0}
            className="bg-gold text-navy hover:bg-gold/90"
          >
            <Search className="h-4 w-4 mr-2" />
            Consultar Receita Federal
          </Button>
        </div>
      </div>

      {/* Progresso da consulta */}
      {consultProgress && (
        <Card className="mt-6 p-4 bg-navy/[0.03] border-navy/20">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-navy" />
            <p className="text-sm font-medium text-navy">
              Consultando {consultProgress.atual} de {consultProgress.total} fornecedores…
            </p>
          </div>
          <Progress value={(consultProgress.atual / consultProgress.total) * 100} />
        </Card>
      )}

      {/* Estatísticas */}
      {fornecedores.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <Stat label="Fornecedores" value={String(fornecedores.length)} />
          <Stat label="Total compras" value={formatBRL(totalCompras)} />
          <Stat label="Crédito CBS estimado" value={formatBRL(totalCredito)} tone="gold" />
          <Stat label="Cobertura com crédito" value={`${coberturaPct}%`} />
        </div>
      )}

      {/* Alertas */}
      <div className="mt-6 space-y-2">
        {irregulares.length > 0 && (
          <Alerta
            tone="rose"
            icon={<AlertTriangle className="h-4 w-4" />}
            title={`${irregulares.length} fornecedor(es) com situação irregular na Receita`}
            desc="Empresas baixadas ou inaptas — risco fiscal e sem crédito de CBS."
          />
        )}
        {concentracaoPct > 60 && maiorFornecedor && (
          <Alerta
            tone="amber"
            icon={<AlertTriangle className="h-4 w-4" />}
            title={`Concentração alta: ${concentracaoPct.toFixed(0)}% em ${maiorFornecedor.nome}`}
            desc="Um único fornecedor concentra a maior parte das compras — avalie diversificar."
          />
        )}
        {simplesPct > 60 && (
          <Alerta
            tone="sky"
            icon={<AlertTriangle className="h-4 w-4" />}
            title={`${simplesPct.toFixed(0)}% das compras vêm de fornecedores do Simples`}
            desc="Crédito de CBS é reduzido nesse regime — impacta os cenários Híbrido e Lucro Real."
          />
        )}
        {vedados.length > 0 && (
          <Alerta
            tone="amber"
            icon={<AlertTriangle className="h-4 w-4" />}
            title={`${vedados.length} fornecedor(es) do regime Normal sem direito a crédito de CBS`}
            desc={`${formatBRL(vedadosValor)} em compras de setores com vedação legal ao crédito do adquirente (hotelaria, bar/restaurante e combustível monofásico — arts. 172 a 180, 276 e 283 da LC 214/2025). O crédito é R$ 0,00, mesmo com o fornecedor no regime normal.`}
          />
        )}
        {semRegime > 0 && (
          <Alerta
            tone="slate"
            icon={<Search className="h-4 w-4" />}
            title={`${semRegime} fornecedor(es) ainda sem regime`}
            desc="Clique em 'Consultar Receita Federal' para preencher automaticamente."
          />
        )}
        {semCnpj > 0 && (
          <Alerta
            tone="slate"
            icon={<FileWarning className="h-4 w-4" />}
            title={`${semCnpj} fornecedor(es) sem CNPJ no relatório`}
            desc="Cadastro incompleto no Domínio — insira o CNPJ manualmente na tabela abaixo."
          />
        )}
      </div>

      {/* Tabela */}
      <Card className="mt-6 shadow-[var(--shadow-elegant)] overflow-hidden">
        {fornecedores.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p>Nenhum fornecedor ainda.</p>
            <p className="text-xs mt-1">Carregue o PDF "Acompanhamento de Entradas" do Domínio.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-off-white text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Fornecedor</th>
                  <th className="px-3 py-3 text-left font-medium">CNPJ</th>
                  <th className="px-3 py-3 text-left font-medium">Regime</th>
                  <th className="px-3 py-3 text-left font-medium">Setor (LC 214/2025)</th>
                  <th className="px-3 py-3 text-right font-medium">Valor total</th>
                  <th className="px-3 py-3 text-right font-medium">Crédito CBS</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id} className="border-t hover:bg-off-white/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-navy">{f.nome}</div>
                      {f.uf && <div className="text-[10px] uppercase text-muted-foreground">{f.uf}</div>}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-xs text-muted-foreground">
                      {f.cnpj ?? (f.cpf ? f.cpf : "—")}
                    </td>
                    <td className="px-3 py-3">
                      <RegimeBadge regime={f.regime} />
                    </td>
                    <td className="px-3 py-3">
                      <SetorCelula fornecedor={f} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{formatBRL(Number(f.valor_total))}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-gold">
                      {Number(f.credito_cbs) > 0 ? formatBRL(Number(f.credito_cbs)) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {!f.cnpj && !f.cpf ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCnpjManualId(f.id);
                            setCnpjManualValue("");
                          }}
                        >
                          Inserir CNPJ
                        </Button>
                      ) : f.cnpj && !f.regime ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await consultar({ data: { fornecedor_id: f.id } });
                              await refetch();
                            } catch (e) {
                              toast.error("Falha", { description: (e as Error).message });
                            }
                          }}
                        >
                          <Search className="h-3 w-3" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-navy/5 border-t-2 border-navy/20">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-xs uppercase tracking-wider text-navy font-medium">
                    Total crédito CBS estimado 2027
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {formatBRL(totalCompras)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold text-navy text-base">
                    {formatBRL(totalCredito)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* Dialog: substituir/adicionar */}
      <AlertDialog open={!!askModo} onOpenChange={(o) => !o && setAskModo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Já existem fornecedores para este cliente</AlertDialogTitle>
            <AlertDialogDescription>
              O que deseja fazer com o novo PDF?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (askModo) handleFile(askModo, "ADICIONAR");
                setAskModo(null);
              }}
            >
              Adicionar período
            </Button>
            <AlertDialogAction
              onClick={() => {
                if (askModo) handleFile(askModo, "SUBSTITUIR");
                setAskModo(null);
              }}
            >
              Substituir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: CNPJ manual */}
      <AlertDialog open={!!cnpjManualId} onOpenChange={(o) => !o && setCnpjManualId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Informar CNPJ do fornecedor</AlertDialogTitle>
            <AlertDialogDescription>
              O CNPJ não estava no relatório do Domínio. Digite abaixo para consultarmos o regime na Receita Federal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="00.000.000/0000-00"
            value={cnpjManualValue}
            onChange={(e) => setCnpjManualValue(e.target.value)}
            className="tabular-nums"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={salvarCnpjManual}>Salvar e consultar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gold" }) {
  return (
    <Card className="p-4">
      <p className="label-uppercase">{label}</p>
      <p className={`num-display text-xl mt-1 truncate ${tone === "gold" ? "text-gold" : "text-navy"}`}>
        {value}
      </p>
    </Card>
  );
}

function RegimeBadge({ regime }: { regime: string | null }) {
  if (!regime) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, { label: string; cls: string; icon?: React.ReactNode }> = {
    NORMAL: { label: "Normal", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
    SIMPLES: { label: "Simples", cls: "bg-amber-50 text-amber-800 border-amber-200" },
    MEI: { label: "MEI", cls: "bg-sky-50 text-sky-700 border-sky-200" },
    IRREGULAR: { label: "Irregular", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: <AlertTriangle className="h-3 w-3" /> },
    PF: { label: "Pessoa Física", cls: "bg-slate-50 text-slate-700 border-slate-200" },
    PENDENTE: { label: "Consultar", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  };
  const m = map[regime] ?? { label: regime, cls: "bg-slate-50 text-slate-700 border-slate-200" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${m.cls}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

function Alerta({
  tone,
  icon,
  title,
  desc,
}: {
  tone: "rose" | "amber" | "sky" | "slate";
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  const map = {
    rose: "bg-rose-50 border-rose-200 text-rose-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    sky: "bg-sky-50 border-sky-200 text-sky-900",
    slate: "bg-slate-50 border-slate-200 text-slate-800",
  } as const;
  return (
    <div className={`border rounded-lg p-3 flex items-start gap-3 ${map[tone]}`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs opacity-80 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

/** Bloco 14B — setor do fornecedor e sinalização de vedação ao crédito. */
function SetorCelula({ fornecedor }: { fornecedor: Fornecedor }) {
  const tipo = fornecedor.tipo_receita_fornecedor ?? tipoReceitaPorCnae(fornecedor.cnae);
  const setor = regimePorTipo(tipo);
  const veda = !setor.gera_credito_adquirente || setor.monofasico;
  return (
    <div className="max-w-[220px]">
      <div className="text-xs font-medium text-navy">{setor.descricao}</div>
      <div className="text-[10px] text-muted-foreground">
        {fornecedor.cnae ? `CNAE ${fornecedor.cnae} · ` : ""}
        {setor.artigo}
      </div>
      {veda && (
        <div className="text-[10px] text-amber-700 mt-0.5">
          {setor.monofasico ? "Monofásico — sem crédito" : "Vedação legal ao crédito"}
        </div>
      )}
    </div>
  );
}
