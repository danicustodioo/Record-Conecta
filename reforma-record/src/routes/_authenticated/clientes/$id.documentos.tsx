// Bloco 14A — Central de documentos por cliente.
// A plataforma extrai, a equipe confere, a plataforma registra quem conferiu.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Upload,
  CheckCircle2,
  Loader2,
  Search,
  Ban,
  FileText,
  AlertTriangle,
  Info,
} from "lucide-react";
import { formatCNPJ } from "@/lib/format";
import { extractPdfText } from "@/lib/pdf-extract.browser";
import {
  classificarClientePorCnpj,
  extrairSegregacaoSaidas,
  extrairContratoSocial,
} from "@/lib/documentos.functions";
import {
  documentosAplicaveis,
  STATUS_LABEL,
  isConcluido,
  tipoReceitaSugeridoPorCnae,
  type DocumentoCliente,
  type StatusDocumento,
  type TipoDocumento,
} from "@/lib/documentos-catalogo";
import { REGIMES_SETORIAIS_FALLBACK } from "@/lib/enquadramento";
import {
  documentoClientePersistido,
  melhorDocumentoPorCodigo,
  useDocumentosClienteConsolidados,
  useTiposDocumento,
} from "@/hooks/useDocumentosCliente";
import { formatarFatorAnualizacao, mesesManualValido } from "@/lib/dre-periodo";

export const Route = createFileRoute("/_authenticated/clientes/$id/documentos")({
  component: CentralDocumentos,
});

type ClienteRow = {
  id: string;
  razao_social: string;
  cnpj: string;
  regime_atual: string;
  cnae_principal?: string | null;
  cnaes_secundarios?: string[] | null;
  natureza_juridica?: string | null;
  porte?: string | null;
  opcao_simples?: boolean | null;
  situacao_cadastral?: string | null;
  municipio?: string | null;
  tem_patrimonio_afetacao?: boolean | null;
};

const STATUS_STYLE: Record<StatusDocumento, string> = {
  pendente: "border-muted-foreground/30 text-muted-foreground",
  enviado: "border-sky-500 text-sky-700",
  extraido: "border-amber-500 text-amber-700",
  conferido: "border-emerald-600 text-emerald-700",
  dispensado: "border-navy/30 text-navy/70",
};

function CentralDocumentos() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const classificar = useServerFn(classificarClientePorCnpj);
  const extrairSaidas = useServerFn(extrairSegregacaoSaidas);
  const extrairContrato = useServerFn(extrairContratoSocial);

  const [busy, setBusy] = useState<string | null>(null);
  const [dispensar, setDispensar] = useState<TipoDocumento | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [mesesSaidasCentral, setMesesSaidasCentral] = useState("");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: cliente } = useQuery({
    queryKey: ["cliente", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as ClienteRow;
    },
  });

  const { data: tipos = [] } = useTiposDocumento();
  const { data: docs = [] } = useDocumentosClienteConsolidados(id);

  const aplicaveis = useMemo(
    () => (cliente ? documentosAplicaveis(tipos, cliente) : []),
    [tipos, cliente],
  );

  const docPorCodigo = (codigo: string) => melhorDocumentoPorCodigo(docs, codigo);

  const obrigatorios = aplicaveis.filter((t) => t.obrigatorio_sempre);
  const concluidos = obrigatorios.filter((t) => isConcluido(docPorCodigo(t.codigo)?.status));
  const pct = obrigatorios.length ? (concluidos.length / obrigatorios.length) * 100 : 0;

  const tipoSugerido = tipoReceitaSugeridoPorCnae(cliente?.cnae_principal);
  const regimeSugerido = REGIMES_SETORIAIS_FALLBACK[tipoSugerido];

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["documentos-cliente", id] });
    qc.invalidateQueries({ queryKey: ["cliente", id] });
    qc.invalidateQueries({ queryKey: ["receitas-cliente"] });
  }

  async function gravarDoc(codigo: string, patch: Record<string, unknown>) {
    const existente = docPorCodigo(codigo);
    if (existente && documentoClientePersistido(existente)) {
      const { error } = await supabase
        .from("documentos_cliente" as never)
        .update(patch as never)
        .eq("id", existente.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("documentos_cliente" as never)
        .insert({
          cliente_id: id,
          codigo_documento: codigo,
          arquivo_path: existente?.arquivo_path ?? null,
          nome_arquivo: existente?.nome_arquivo ?? null,
          resumo_extracao: existente?.resumo_extracao ?? null,
          extraido_em: existente?.extraido_em ?? null,
          ...patch,
        } as never);
      if (error) throw new Error(error.message);
    }
    invalidate();
  }

  async function consultarCnpj() {
    setBusy("cnpj");
    const t = toast.loading("Consultando a Receita Federal…");
    try {
      const res = await classificar({ data: { cliente_id: id } });
      toast.success(`CNAE ${res.cnae_principal ?? "—"} identificado`, {
        id: t,
        description: res.atividade_principal_texto ?? undefined,
      });
      invalidate();
    } catch (e) {
      toast.error("Falha na consulta", { id: t, description: msg(e) });
    } finally {
      setBusy(null);
    }
  }

  async function enviarArquivo(tipo: TipoDocumento, file: File) {
    if (!user) return;
    setBusy(tipo.codigo);
    const t = toast.loading(`Enviando ${file.name}…`);
    try {
      const path = `${user.id}/${id}/${tipo.codigo}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("documentos-dominio")
        .upload(path, file, { upsert: true });
      if (upErr) throw new Error(upErr.message);

      await gravarDoc(tipo.codigo, {
        arquivo_path: path,
        nome_arquivo: file.name,
        status: "enviado",
        conferido_por: null,
        conferido_em: null,
      });
      toast.success("Arquivo enviado", { id: t });

      if (tipo.codigo === "saidas" && file.name.toLowerCase().endsWith(".pdf")) {
        const mesesSaidas = mesesManualValido(mesesSaidasCentral);
        if (!mesesSaidas) {
          throw new Error("Informe quantos meses o livro de saídas cobre antes da extração. O sistema não assume 12 meses automaticamente.");
        }
        toast.loading("Lendo o livro de saídas e sugerindo a segregação de receita…", { id: t });
        const texto = await extractPdfText(file);
        const res = await extrairSaidas({
          data: { cliente_id: id, analise_id: null, texto, meses: mesesSaidas, modo: "SUBSTITUIR" },
        });
        await gravarDoc(tipo.codigo, {
          status: "extraido",
          extraido_em: new Date().toISOString(),
          resumo_extracao: res,
        });
        toast.success(`${res.linhas} linha(s) de receita sugeridas`, {
          id: t,
          description: res.atencao
            ? `${res.atencao} linha(s) sem natureza identificada — confira antes de gerar o relatório.`
            : "Confira na etapa de segregação de receita da análise.",
        });
      } else if (tipo.codigo === "contrato_social" && file.name.toLowerCase().endsWith(".pdf")) {
        toast.loading("Lendo o contrato social…", { id: t });
        const texto = await extractPdfText(file);
        const res = await extrairContrato({ data: { cliente_id: id, texto } });
        await gravarDoc(tipo.codigo, {
          status: "extraido",
          extraido_em: new Date().toISOString(),
          resumo_extracao: res,
        });
        toast.success("Contrato social lido", {
          id: t,
          description: `${res.socios.length} sócio(s) identificados`,
        });
      }
    } catch (e) {
      toast.error("Falha ao processar documento", { id: t, description: msg(e) });
    } finally {
      setBusy(null);
    }
  }

  async function conferir(tipo: TipoDocumento) {
    if (!user) return;
    setBusy(tipo.codigo);
    try {
      await gravarDoc(tipo.codigo, {
        status: "conferido",
        conferido_por: user.id,
        conferido_em: new Date().toISOString(),
      });
      toast.success(`${tipo.nome} conferido`);
    } catch (e) {
      toast.error("Falha ao registrar conferência", { description: msg(e) });
    } finally {
      setBusy(null);
    }
  }

  async function confirmarDispensa() {
    if (!dispensar) return;
    if (justificativa.trim().length < 5) {
      toast.error("Informe a justificativa da dispensa");
      return;
    }
    try {
      await gravarDoc(dispensar.codigo, {
        status: "dispensado",
        observacao: justificativa.trim(),
        conferido_por: user?.id ?? null,
        conferido_em: new Date().toISOString(),
      });
      toast.success("Documento dispensado");
      setDispensar(null);
      setJustificativa("");
    } catch (e) {
      toast.error("Falha ao dispensar", { description: msg(e) });
    }
  }

  if (!cliente) return <div className="p-8 text-sm text-muted-foreground">Carregando...</div>;

  const precisaAfetacao =
    (tipoSugerido === "construcao_civil" || tipoSugerido === "incorporacao_imobiliaria") &&
    cliente.tem_patrimonio_afetacao == null;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link
        to="/clientes/$id"
        params={{ id }}
        className="text-xs text-muted-foreground hover:text-navy inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao cliente
      </Link>

      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="label-uppercase">Central de documentos</p>
          <h1 className="font-display text-3xl text-navy mt-1">{cliente.razao_social}</h1>
          <p className="text-sm text-muted-foreground mt-1 tabular-nums">
            CNPJ {formatCNPJ(cliente.cnpj)}
          </p>
        </div>
        <Button onClick={consultarCnpj} disabled={busy === "cnpj"} variant="outline" className="border-navy text-navy hover:bg-navy hover:text-white">
          {busy === "cnpj" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
          Classificar pelo CNPJ
        </Button>
      </div>

      {/* Classificação sugerida */}
      <Card className="mt-6 p-5 border-navy/15">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-navy mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-navy">
              Enquadramento sugerido: {regimeSugerido?.descricao ?? "Regime regular"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {regimeSugerido?.artigo} · CNAE principal {cliente.cnae_principal ?? "não consultado"}
              {cliente.natureza_juridica ? ` · ${cliente.natureza_juridica}` : ""}
              {cliente.municipio ? ` · ${cliente.municipio}` : ""}
              {cliente.opcao_simples != null
                ? ` · ${cliente.opcao_simples ? "optante pelo Simples" : "regime normal"}`
                : ""}
            </p>
            <p className="text-xs text-amber-800 mt-2">
              A classificação é sugestão, nunca decisão final. CNAE não é prova de enquadramento — o
              que vale é a operação efetivamente praticada. Ajuste em{" "}
              <Link to="/clientes/$id/editar" params={{ id }} className="underline">
                editar cliente
              </Link>
              .
            </p>
          </div>
        </div>
      </Card>

      {precisaAfetacao && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Informe se há patrimônio de afetação averbado — muda integralmente o cenário tributário.
            Preencha no cadastro do cliente antes de concluir a conferência.
          </span>
        </div>
      )}

      {/* Progresso */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-navy font-medium">
            {concluidos.length} de {obrigatorios.length} documentos obrigatórios concluídos
          </span>
          <span className="text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
        </div>
        <Progress value={pct} />
      </div>

      {/* Lista */}
      <div className="mt-6 space-y-3">
        {aplicaveis.map((t) => {
          const d = docPorCodigo(t.codigo);
          const status = (d?.status ?? "pendente") as StatusDocumento;
          const resumo = d?.resumo_extracao as Record<string, unknown> | null;
          return (
            <Card key={t.codigo} className="p-5 border-navy/10">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-[260px] flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="h-4 w-4 text-navy/60" />
                    <h3 className="font-medium text-navy">{t.nome}</h3>
                    {t.obrigatorio_sempre ? (
                      <Badge variant="outline" className="border-navy/30 text-navy text-[10px]">
                        obrigatório
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">condicional</Badge>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${STATUS_STYLE[status]}`}>
                      {STATUS_LABEL[status]}
                    </Badge>
                    {t.periodo_minimo && (
                      <span className="text-[11px] text-muted-foreground">
                        período mínimo: {t.periodo_minimo}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">{t.descricao}</p>
                  <p className="text-xs text-navy/80 mt-1.5">
                    <strong>Por que precisamos:</strong> {t.por_que_precisamos}
                  </p>
                  {d?.nome_arquivo && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Arquivo: {d.nome_arquivo}
                    </p>
                  )}
                  {resumo && (
                    <div className="mt-2 rounded-md bg-off-white border px-3 py-2 text-[11px] text-navy/80">
                      <strong>Resumo lido:</strong> {resumoTexto(resumo)}
                    </div>
                  )}
                  {d?.observacao && (
                    <p className="text-[11px] text-amber-800 mt-1.5">
                      Justificativa: {d.observacao}
                    </p>
                  )}
                  {d?.conferido_em && (
                    <p className="text-[11px] text-emerald-700 mt-1.5">
                      Conferido em {new Date(d.conferido_em).toLocaleString("pt-BR")}
                      {d.conferido_por ? ` por ${d.conferido_por.slice(0, 8)}…` : ""}
                    </p>
                  )}
                  {t.codigo === "saidas" && (
                    <div className="mt-3 max-w-xs">
                      <Label className="text-[11px]" htmlFor="meses-saidas-central">
                        Meses do livro de saídas
                      </Label>
                      <div className="mt-1 flex items-center gap-2">
                        <Input
                          id="meses-saidas-central"
                          value={mesesSaidasCentral}
                          onChange={(e) => setMesesSaidasCentral(e.target.value)}
                          inputMode="numeric"
                          placeholder="Ex.: 6"
                          className="h-8"
                        />
                        {mesesManualValido(mesesSaidasCentral) && (
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            fator {formatarFatorAnualizacao(12 / (mesesManualValido(mesesSaidasCentral) ?? 12))}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 items-stretch">
                  {t.codigo === "cnpj" ? (
                    <Button size="sm" variant="outline" onClick={consultarCnpj} disabled={busy === "cnpj"}>
                      <Search className="h-3.5 w-3.5 mr-1" /> Consultar
                    </Button>
                  ) : (
                    <>
                      <input
                        ref={(el) => {
                          inputs.current[t.codigo] = el;
                        }}
                        type="file"
                        accept=".pdf,.xml,.zip,.rar"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void enviarArquivo(t, f);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === t.codigo}
                        onClick={() => inputs.current[t.codigo]?.click()}
                      >
                        {busy === t.codigo ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Upload className="h-3.5 w-3.5 mr-1" />
                        )}
                        Enviar
                      </Button>
                    </>
                  )}

                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={status === "pendente" || status === "conferido" || busy === t.codigo}
                    onClick={() => void conferir(t)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Conferir
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => {
                      setDispensar(t);
                      setJustificativa(docPorCodigo(t.codigo)?.observacao ?? "");
                    }}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" /> Dispensar
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!dispensar} onOpenChange={(o) => !o && setDispensar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispensar {dispensar?.nome}</DialogTitle>
            <DialogDescription>
              A justificativa fica registrada no histórico do cliente e substitui a conferência
              deste documento.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Justificativa (obrigatória)</Label>
            <Textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              placeholder="Ex.: cliente não possui esse tipo de operação no período analisado."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispensar(null)}>Cancelar</Button>
            <Button className="bg-navy hover:bg-navy/90" onClick={() => void confirmarDispensa()}>
              Dispensar documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function resumoTexto(r: Record<string, unknown>): string {
  if (typeof r.linhas === "number")
    return `${r.linhas} linha(s) de receita · total ${Number(r.total_extraido ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${r.atencao ? ` · ${r.atencao} sem natureza identificada` : ""}`;
  if (Array.isArray(r.socios))
    return `${(r.socios as unknown[]).length} sócio(s): ${(r.socios as Array<{ nome: string; qualificacao?: string | null }>)
      .map((s) => `${s.nome}${s.qualificacao ? ` (${s.qualificacao})` : ""}`)
      .join("; ")}`;
  if (r.cnae_principal) return `CNAE ${r.cnae_principal} · ${String(r.natureza_juridica ?? "")}`;
  return JSON.stringify(r).slice(0, 200);
}
