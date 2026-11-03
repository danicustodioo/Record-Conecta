// Wizard de upload + extração + cálculo de uma análise.
// Suporta MÚLTIPLOS arquivos por tipo. Cada upload é uma linha em `documentos`.
// Após cada extração, consolida todos os documentos do tipo no campo dados_* da analise.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Upload, CheckCircle2, AlertCircle, Loader2, Calculator, X, FileText, FileDown, Share2, Copy, RefreshCw, Eye, Plus, Trash2, ChevronDown, FilePlus2, Presentation } from "lucide-react";
import { regerarTokenAnalise } from "@/lib/relatorio-publico.functions";
import { gerarDiagnosticoPDF } from "@/lib/diagnostico-pdf";
import { toast } from "sonner";
import { extrairDocumento } from "@/lib/extracao.functions";
import { calcularTodos, type InputCalculo } from "@/lib/tax-engine";
import {
  SegregacaoReceita,
  useReceitasLinhas,
  useRegimesSetoriais,
} from "@/components/analise/SegregacaoReceita";
import { tipoReceitaPorCnae } from "@/lib/enquadramento";
import { usePendenciasDocumentos } from "@/hooks/useDocumentosCliente";
import {
  alertasConsistencia,
  isConcluido,
  STATUS_LABEL,
  type PerfilCliente,
  type StatusDocumento,
} from "@/lib/documentos-catalogo";
import { melhorDocumentoPorCodigo } from "@/hooks/useDocumentosCliente";


import { resumirFolha } from "@/lib/folha-normalize";
import { formatBRL } from "@/lib/format";
import { formatarFatorAnualizacao, identificarPeriodoDre, mesesManualValido } from "@/lib/dre-periodo";
import { AnalysisDashboard } from "@/components/analise/AnalysisDashboard";
import { FornecedoresDashboard } from "@/components/fornecedores/FornecedoresDashboard";
import { consolidarMultiplosArquivos, type ArquivoFornecedoresExtraido } from "@/lib/fornecedores/consolidador";
import type { FornecedorClassificado } from "@/lib/fornecedores/classificador";

export const Route = createFileRoute("/_authenticated/analises/$id")({
  component: WizardPage,
});

type Tipo = "DRE" | "BALANCO" | "FORNECEDORES" | "FOLHA" | "SAIDAS";
const TIPOS: { tipo: Tipo; label: string; hint: string }[] = [
  { tipo: "DRE", label: "DRE", hint: "Demonstrativo de Resultado (1 ou + períodos)" },
  { tipo: "BALANCO", label: "Balanço Patrimonial", hint: "Balanço/Balancete" },
  { tipo: "FORNECEDORES", label: "Apurações de Entradas", hint: "Notas de fornecedores" },
  { tipo: "FOLHA", label: "Folha de Pagamento", hint: "Resumos mensais" },
  { tipo: "SAIDAS", label: "Apurações de Saídas", hint: "ICMS/ISS de saídas" },
];

const REQUIRED_FOR_CALC: Tipo[] = ["DRE", "FORNECEDORES", "FOLHA"];
// Ponte entre os documentos desta análise e a central de documentos do cliente.
const CODIGO_CENTRAL: Record<Tipo, string> = {
  DRE: "dre",
  BALANCO: "balanco",
  FORNECEDORES: "entradas",
  FOLHA: "folha",
  SAIDAS: "saidas",
};

const MAX_TEXT_CHARS = 350_000;

function normalizeFileName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function safeStorageName(name: string) {
  const c = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return c || "documento.pdf";
}
function detectTipoFromName(name: string): Tipo | null {
  const n = normalizeFileName(name);
  if (n.includes("DRE") || n.includes("DEMONSTRA")) return "DRE";
  if (n.includes("FORNECEDOR") || n.includes("ENTRADA") || n.includes("COMPRA")) return "FORNECEDORES";
  if (n.includes("FOLHA") || n.includes("PROVENTO") || n.includes("SALARIO")) return "FOLHA";
  if (n.includes("SAIDA") || n.includes("VENDAS") || n.includes("ISS")) return "SAIDAS";
  if (n.includes("BALANC")) return "BALANCO";
  return null;
}
function tipoLabel(tipo: Tipo) { return TIPOS.find((t) => t.tipo === tipo)?.label ?? tipo; }

type DocRow = {
  id: string;
  tipo: Tipo;
  nome_arquivo: string;
  storage_path: string;
  status_extracao: "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "ERRO_MANUAL";
  erro_mensagem: string | null;
  dados_extraidos: Record<string, unknown> | null;
};

// Consolida múltiplos documentos do mesmo tipo num único objeto para `analises.dados_*`
function consolidar(tipo: Tipo, docs: DocRow[]): Record<string, unknown> {
  const ok = docs.filter((d) => d.status_extracao === "CONCLUIDO" && d.dados_extraidos);
  if (!ok.length) return {};

  if (tipo === "DRE") {
    const periodos = ok.map((d) => d.dados_extraidos as Record<string, unknown>);
    const numKeys = ["receita_bruta_total", "receita_servicos", "receita_mercadorias", "cmv", "csp", "despesas_pessoal", "despesas_administrativas", "despesas_financeiras", "lucro_liquido", "impostos_sobre_receita"];
    const soma: Record<string, number> = {};
    for (const k of numKeys) soma[k] = periodos.reduce((s, p) => s + Number(p[k] ?? 0), 0);
    return { ...soma, periodos, num_periodos: periodos.length };
  }
  if (tipo === "FOLHA") {
    const competencias: unknown[] = [];
    for (const d of ok) {
      const data = d.dados_extraidos as { competencias?: unknown[] };
      if (Array.isArray(data.competencias)) competencias.push(...data.competencias);
      else competencias.push(data);
    }
    return { competencias };
  }
  if (tipo === "FORNECEDORES") {
    const arquivos: ArquivoFornecedoresExtraido[] = ok.map((d) => {
      const data = d.dados_extraidos as Record<string, unknown>;
      return {
        empresa_cliente_nome: data.empresa_cliente_nome as string | null,
        empresa_cliente_cnpj: data.empresa_cliente_cnpj as string | null,
        periodo_inicio: data.periodo_inicio as string | null,
        periodo_fim: data.periodo_fim as string | null,
        total_geral: data.total_geral as number | null,
        fornecedores: ((data.fornecedores as unknown[]) ?? []) as ArquivoFornecedoresExtraido["fornecedores"],
      };
    });
    return consolidarMultiplosArquivos(arquivos) as unknown as Record<string, unknown>;
  }
  if (tipo === "SAIDAS") {
    const periodos = ok.map((d) => d.dados_extraidos);
    return { periodos };
  }
  // BALANCO: mantém o mais recente
  return ok[ok.length - 1].dados_extraidos as Record<string, unknown>;
}

function WizardPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const extrair = useServerFn(extrairDocumento);

  const { data: analise, refetch: refetchAnalise } = useQuery({
    queryKey: ["analise", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("analises").select("*, cliente:clientes(*)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: documentos = [], refetch: refetchDocs } = useQuery({
    queryKey: ["analise-docs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("documentos").select("*").eq("analise_id", id).order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as DocRow[];
    },
  });

  // Bloco 14: enquadramento setorial
  const { data: regimesSetoriais } = useRegimesSetoriais();
  const { data: linhasReceita = [] } = useReceitasLinhas(id);

  // Bloco 14A: trava de conferência da central de documentos
  const clienteIdAtual = (analise as { cliente_id?: string } | undefined)?.cliente_id;
  const { pendencias, docs: docsCentral } = usePendenciasDocumentos(
    clienteIdAtual,
    (analise as { cliente?: PerfilCliente } | undefined)?.cliente,
  );




  const [busy, setBusy] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [mesesDreManual, setMesesDreManual] = useState("");

  async function processOne(tipo: Tipo, file: File) {
    const path = `${id}/${tipo}-${Date.now()}-${safeStorageName(file.name)}`;
    const { error: upErr } = await supabase.storage.from("documentos-dominio").upload(path, file, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { data: inserted, error: insErr } = await supabase.from("documentos").insert({
      analise_id: id, tipo, nome_arquivo: file.name, storage_path: path, status_extracao: "PROCESSANDO", erro_mensagem: null,
    }).select("id").single();
    if (insErr || !inserted) throw insErr ?? new Error("Não foi possível registrar o documento");
    const docId = inserted.id;
    await refetchDocs();

    try {
      const { extractPdfText } = await import("@/lib/pdf-extract.browser");
      const texto = (
        await extractPdfText(file, (nome) =>
          toast.info("Processando PDF...", {
            description: `${nome}: formato especial detectado — convertendo automaticamente. Aguarde.`,
            duration: 4000,
          }),
        )
      ).slice(0, MAX_TEXT_CHARS);
      if (!texto.trim()) throw new Error("Não consegui ler texto. PDF pode ser imagem escaneada.");
      const res = await extrair({ data: { tipo, texto_pdf: texto } });
      if (!res.ok) {
        await supabase.from("documentos").update({ status_extracao: "ERRO_MANUAL", erro_mensagem: res.error }).eq("id", docId);
        return { ok: false as const, error: res.error };
      }
      const dados = JSON.parse(res.json);
      await supabase.from("documentos").update({ status_extracao: "CONCLUIDO", dados_extraidos: dados, erro_mensagem: null }).eq("id", docId);
      return { ok: true as const, dados };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("documentos").update({ status_extracao: "ERRO_MANUAL", erro_mensagem: msg }).eq("id", docId);
      return { ok: false as const, error: msg };
    }
  }

  async function consolidarECommit(tipo: Tipo) {
    const { data: fresh } = await supabase.from("documentos").select("*").eq("analise_id", id).eq("tipo", tipo);
    const consolidated = consolidar(tipo, (fresh ?? []) as unknown as DocRow[]);
    const fieldMap: Record<Tipo, string> = {
      DRE: "dados_dre", BALANCO: "dados_balanco", FORNECEDORES: "dados_fornecedores", FOLHA: "dados_folha", SAIDAS: "dados_saidas",
    };
    await supabase.from("analises").update({ [fieldMap[tipo]]: consolidated as never, status: "EM_ANALISE" } as never).eq("id", id);
  }

  async function handleUploadMulti(tipo: Tipo, files: FileList | File[]) {
    const arr = Array.from(files);
    setBusy(`${tipo}-multi`);
    let sucesso = 0, erros = 0;
    try {
      for (const f of arr) {
        const r = await processOne(tipo, f);
        if (r.ok) sucesso++; else erros++;
        await refetchDocs();
      }
      await consolidarECommit(tipo);
      qc.invalidateQueries({ queryKey: ["documentos-cliente"] });
      qc.invalidateQueries({ queryKey: ["documentos-analise-cliente"] });
      await Promise.all([refetchDocs(), refetchAnalise()]);
      if (sucesso) toast.success(`${tipoLabel(tipo)}: ${sucesso} arquivo(s) importado(s)${erros ? ` · ${erros} com erro` : ""}`);
      if (!sucesso && erros) toast.error(`${tipoLabel(tipo)}: falha em todos os ${erros} arquivos`);
    } finally {
      setBusy(null);
    }
  }

  async function handleArchiveUpload(files: FileList | File[]) {
    const arr = Array.from(files);
    setBusy("archive");
    try {
      const { extractAndClassify } = await import("@/lib/archive-extract.browser");
      const buckets = new Map<Tipo, File[]>();
      const desconhecidos: string[] = [];
      let totalPdfs = 0;

      for (const input of arr) {
        try {
          const extracted = await extractAndClassify(input);
          for (const e of extracted) {
            totalPdfs++;
            if (!e.tipo) {
              desconhecidos.push(e.file.name);
              continue;
            }
            const list = buckets.get(e.tipo) ?? [];
            list.push(e.file);
            buckets.set(e.tipo, list);
          }
        } catch (e) {
          toast.error(`Falha em "${input.name}"`, { description: e instanceof Error ? e.message : String(e) });
        }
      }

      const classificados = Array.from(buckets.values()).reduce((s, l) => s + l.length, 0);
      if (!classificados) {
        toast.error("Nenhum PDF reconhecido", {
          description: desconhecidos.length ? `${desconhecidos.length} arquivo(s) não identificado(s) — envie manualmente no card do tipo correto.` : undefined,
        });
        return;
      }
      toast.info(`Identifiquei ${classificados} PDF(s) em ${buckets.size} categoria(s)${desconhecidos.length ? ` · ${desconhecidos.length} não reconhecido(s)` : ""}`);
      for (const [tipo, files] of buckets) {
        await handleUploadMulti(tipo, files);
      }
      if (desconhecidos.length) {
        toast.warning(`${desconhecidos.length} arquivo(s) não classificado(s)`, {
          description: desconhecidos.slice(0, 3).join(", ") + (desconhecidos.length > 3 ? "..." : ""),
        });
      }
      toast.success(`Processamento concluído (${totalPdfs} PDF(s))`);
    } finally {
      setBusy(null);
    }
  }


  async function removerDoc(doc: DocRow) {
    if (!confirm(`Remover "${doc.nome_arquivo}"?`)) return;
    await supabase.storage.from("documentos-dominio").remove([doc.storage_path]).catch(() => {});
    await supabase.from("documentos").delete().eq("id", doc.id);
    await consolidarECommit(doc.tipo);
    qc.invalidateQueries({ queryKey: ["documentos-cliente"] });
    qc.invalidateQueries({ queryKey: ["documentos-analise-cliente"] });
    await Promise.all([refetchDocs(), refetchAnalise()]);
    toast.success("Documento removido");
  }

  async function substituirTodos(tipo: Tipo) {
    const docs = documentos.filter((d) => d.tipo === tipo);
    if (!docs.length) return;
    if (!confirm(`Remover TODOS os ${docs.length} arquivo(s) de "${tipoLabel(tipo)}"? Você poderá enviar novos em seguida.`)) return;
    setBusy(`${tipo}-multi`);
    try {
      const paths = docs.map((d) => d.storage_path);
      await supabase.storage.from("documentos-dominio").remove(paths).catch(() => {});
      await supabase.from("documentos").delete().in("id", docs.map((d) => d.id));
      const fieldMap: Record<Tipo, string> = {
        DRE: "dados_dre", BALANCO: "dados_balanco", FORNECEDORES: "dados_fornecedores", FOLHA: "dados_folha", SAIDAS: "dados_saidas",
      };
      await supabase.from("analises").update({ [fieldMap[tipo]]: null } as never).eq("id", id);
      qc.invalidateQueries({ queryKey: ["documentos-cliente"] });
      qc.invalidateQueries({ queryKey: ["documentos-analise-cliente"] });
      await Promise.all([refetchDocs(), refetchAnalise()]);
      toast.success(`${tipoLabel(tipo)}: tudo limpo. Envie os novos arquivos.`);
    } finally {
      setBusy(null);
    }
  }

  async function criarNovoCenario(modo: "duplicar" | "branco") {
    if (!analise) return;
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const base = modo === "duplicar"
      ? {
          cliente_id: analise.cliente_id,
          responsavel_id: userId,
          status: "RASCUNHO" as const,
          dados_dre: analise.dados_dre,
          dados_balanco: analise.dados_balanco,
          dados_fornecedores: analise.dados_fornecedores,
          dados_folha: analise.dados_folha,
          dados_saidas: analise.dados_saidas,
        }
      : {
          cliente_id: analise.cliente_id,
          responsavel_id: userId,
          status: "RASCUNHO" as const,
        };
    const { data: nova, error } = await supabase.from("analises").insert(base as never).select("id").single();
    if (error || !nova) {
      toast.error("Falha ao criar cenário", { description: error?.message });
      return;
    }
    toast.success(modo === "duplicar" ? "Cenário duplicado" : "Novo cenário em branco criado");
    navigate({ to: "/analises/$id", params: { id: (nova as { id: string }).id } });
  }


  async function calcular() {
    if (!analise || !analise.cliente) return;
    setCalculando(true);
    try {
      const dre = (analise.dados_dre ?? {}) as Record<string, unknown>;
      const saidas = (analise.dados_saidas ?? {}) as Record<string, number | null>;
      const fornecedoresRaw = (analise.dados_fornecedores ?? {}) as {
        fornecedores_classificados?: FornecedorClassificado[];
        total_compras_anuais?: number;
      };
      const cli = analise.cliente as {
        setor: string;
        subsetor: string | null;
        rbt12: number;
        pct_b2b: number | null;
        iss_aliquota_efetiva?: number | null;
        pct_empreitada?: number | null;
        pct_creditavel?: number | null;
        base_creditavel_estimada?: number | null;
      };

      // ---- Anualização da DRE ----
      const periodoDre = identificarPeriodoDre(dre);
      const mesesConfirmados = periodoDre?.meses ?? mesesManualValido(mesesDreManual);
      if (!mesesConfirmados) {
        toast.error("Período da DRE não identificado", {
          description: "Confirme manualmente o número de meses da DRE antes de calcular. O sistema não assume mais 12 meses automaticamente.",
        });
        return;
      }
      const mesesDre = mesesConfirmados;
      const fator = 12 / mesesDre;
      const n = (k: string) => Number(dre[k] ?? 0) * fator;

      const receitaAnual = n("receita_bruta_total");
      if (!(receitaAnual > 0)) {
        toast.error("Receita bruta da DRE não identificada", {
          description: "Reenvie a DRE ou confira a extração antes de calcular. O sistema não substitui a DRE pela RBT12.",
        });
        return;
      }

      // ---- Anualização da folha (fonte dos encargos: folha, não DRE) ----
      // Os PDFs do Domínio vêm em layouts distintos; resumirFolha achata todos.
      const resumoFolha = resumirFolha(analise.dados_folha);
      const folhaInformada = resumoFolha.meses > 0 && resumoFolha.proventos_anual > 0;
      const folhaBaseAnual = resumoFolha.proventos_anual;
      const cppApurado = resumoFolha.cpp_anual;
      const fgtsApurado = resumoFolha.fgts_anual;

      // ---- ISS efetivo: cadastro do cliente > apuração nas saídas. Nunca 5% default ----
      const servicosSaidas = Number(saidas.total_servicos_prestados ?? saidas.total_saidas_iss ?? 0);
      const issApurado = Number(saidas.total_saidas_iss ?? 0);
      const issCadastro = Number(cli.iss_aliquota_efetiva ?? 0);
      const issAliqEfetiva =
        issCadastro > 0
          ? issCadastro / 100
          : servicosSaidas > 0 && issApurado > 0
            ? issApurado / servicosSaidas
            : undefined;

      const fornecedores = (fornecedoresRaw.fornecedores_classificados ?? []).map((f) => {
        const regime: "SIMPLES_SEM_HIBRIDO" | "SIMPLES_HIBRIDO" | "NORMAL" | "DESCONHECIDO" =
          f.regime === "NORMAL" ? "NORMAL" :
          f.regime === "SIMPLES" && f.opcao_hibrido ? "SIMPLES_HIBRIDO" :
          f.regime === "SIMPLES" ? "SIMPLES_SEM_HIBRIDO" : "DESCONHECIDO";
        const meta = f as unknown as { cnae?: string | null; tipo_receita_fornecedor?: string | null };
        return {
          nome: f.nome,
          regime,
          compras_anuais: f.valor_anual ?? f.valor_contabil_total ?? 0,
          cnae: meta.cnae ?? null,
          tipo_receita: meta.tipo_receita_fornecedor ?? tipoReceitaPorCnae(meta.cnae),
        };
      });

      const anexo = cli.subsetor?.toUpperCase().includes("ANEXO")
        ? (cli.subsetor.toUpperCase().replace(/\s/g, "_") as InputCalculo["anexo"])
        : "ANEXO_III";
      const receitaLiquidaAnual = Math.max(0, receitaAnual - n("simples_nacional_pago"));
      const linhasReceitaCalculo = linhasReceita.map((l) => ({
        ...l,
        meses: mesesDre,
        valor_anualizado: (Number(l.valor_periodo ?? 0) / mesesDre) * 12,
      }));
      if (linhasReceita.some((l) => Number(l.meses) !== mesesDre)) {
        const { error: mesesErr } = await supabase
          .from("receitas_cliente" as never)
          .update({ meses: mesesDre } as never)
          .eq("analise_id", id);
        if (mesesErr) throw new Error(`Falha ao atualizar meses da segregação: ${mesesErr.message}`);
        qc.invalidateQueries({ queryKey: ["receitas-cliente", id] });
      }

      const input: InputCalculo = {
        setor: cli.setor,
        anexo,
        rbt12: Number(cli.rbt12 ?? 0) || receitaAnual,
        receita_anual: receitaAnual,
        receita_liquida_anual: receitaLiquidaAnual,
        receita_servicos: n("receita_servicos"),
        receita_mercadorias: n("receita_mercadorias"),
        meses_dre: mesesDre,
        fator_anualizacao: fator,
        cmv: n("cmv"),
        csp: n("csp"),
        despesas_pessoal: n("despesas_pessoal"),
        despesas_administrativas: n("despesas_administrativas"),
        despesas_financeiras: n("despesas_financeiras"),
        receitas_financeiras: n("receitas_financeiras"),
        base_fgts_anual: resumoFolha.base_fgts_anual,
        folha_base_anual: folhaBaseAnual,
        folha_informada: folhaInformada,
        meses_folha: resumoFolha.meses,
        cpp_anual_informado: cppApurado > 0 ? cppApurado : undefined,
        fgts_anual_informado: fgtsApurado > 0 ? fgtsApurado : undefined,
        fgts_alertas: resumoFolha.alertas,
        cpp_rate_efetivo:
          cppApurado > 0 && folhaBaseAnual > 0 ? cppApurado / folhaBaseAnual : undefined,
        iss_aliquota_efetiva: issAliqEfetiva,
        pct_empreitada:
          cli.pct_empreitada != null && Number(cli.pct_empreitada) > 0
            ? Number(cli.pct_empreitada) / 100
            : undefined,
        base_creditavel_estimada:
          cli.base_creditavel_estimada != null && Number(cli.base_creditavel_estimada) > 0
            ? Number(cli.base_creditavel_estimada)
            : undefined,
        pct_creditavel:
          cli.pct_creditavel != null && Number(cli.pct_creditavel) > 0
            ? Number(cli.pct_creditavel) / 100
            : undefined,
        pct_b2b: Number(cli.pct_b2b ?? 0),
        fornecedores,
        // ---- Bloco 14: enquadramento setorial ----
        linhas_receita: linhasReceitaCalculo.map((l) => ({
          tipo_receita: l.tipo_receita,
          descricao_livre: l.descricao_livre,
          valor_anualizado: l.valor_anualizado,
        })),
        regimes_setoriais: regimesSetoriais,
        socios_habilitados:
          (cli as { socios_habilitados?: boolean | null }).socios_habilitados ?? null,
        // ---- Bloco 14B: alertas setoriais ----
        regime_atual: (cli as { regime_atual?: string | null }).regime_atual ?? null,
        tem_patrimonio_afetacao:
          (cli as { tem_patrimonio_afetacao?: boolean | null }).tem_patrimonio_afetacao ?? null,
      };
      const resultado = calcularTodos(input);
      await supabase.from("analises").update({
        resultados_calculo: resultado as never,
        recomendacao_regime: resultado.recomendado,
        aliquota_cbs_utilizada: resultado.cbs_aliquota_media_efetiva,
        data_base_calculo: new Date().toISOString(),
        versao_engine: resultado.versao_engine,
        saldo_credor_cbs: resultado.saldo_credor_cbs || null,
        conferido_por: (await supabase.auth.getUser()).data.user?.email ?? null,
        status: "CONCLUIDO",
      } as never).eq("id", id);

      await refetchAnalise();
      qc.invalidateQueries({ queryKey: ["analises-stats"] });
      const inel = resultado.inelegiveis.length;
      toast.success(`Recomendação: ${resultado.recomendado}`, {
        description: `Economia anual: ${formatBRL(resultado.economia_anual)}${inel ? ` · ${inel} regime(s) inelegível(is) excluído(s)` : ""}`,
      });
    } catch (e) {
      toast.error("Falha no cálculo", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCalculando(false);
    }
  }


  if (!analise) return <div className="p-8 text-sm text-muted-foreground">Carregando...</div>;
  const docsByTipo = (t: Tipo) => documentos.filter((d) => d.tipo === t);
  const dreAtual = (analise.dados_dre ?? {}) as Record<string, unknown>;
  const periodoDreAtual = identificarPeriodoDre(dreAtual);
  const mesesManualAtual = mesesManualValido(mesesDreManual);
  const mesesDreAtual = periodoDreAtual?.meses ?? mesesManualAtual;
  const fatorDreAtual = mesesDreAtual ? 12 / mesesDreAtual : null;
  const receitaPeriodoAtual = Number(dreAtual.receita_bruta_total ?? 0);
  const receitaAnualAtual = fatorDreAtual ? receitaPeriodoAtual * fatorDreAtual : 0;
  // Status do mesmo documento na central de documentos do cliente (Bloco 14A).
  const statusCentral = (t: Tipo): StatusDocumento | null => {
    const codigo = CODIGO_CENTRAL[t];
    if (!codigo) return null;
    return melhorDocumentoPorCodigo(docsCentral ?? [], codigo)?.status ?? null;
  };
  // Fonte ÚNICA de verdade: mesma função alimenta o aviso, o badge, o tooltip e o disabled.
  const tipoAtendido = (t: Tipo): boolean =>
    isConcluido(statusCentral(t)) ||
    docsByTipo(t).some((d) => d.status_extracao === "CONCLUIDO");

  const bloqueios: string[] = [
    ...REQUIRED_FOR_CALC.filter((t) => !tipoAtendido(t)).map(
      (t) => `Enviar e extrair, conferir ou dispensar o documento: ${TIPOS.find((x) => x.tipo === t)?.label ?? t}`,
    ),
    ...(tipoAtendido("DRE") && !mesesDreAtual
      ? ["Confirmar manualmente o número de meses da DRE — o período não foi identificado na extração"]
      : []),
    // pendencias já trata "dispensado" como equivalente a "conferido"
    ...pendencias.map((p) => `Conferir ou dispensar na central de documentos: ${p.nome}`),
  ];
  const todosOk = bloqueios.length === 0;

  if (typeof window !== "undefined") {
    console.info("[calcular-cenarios] bloqueios:", todosOk ? "nenhum — botão habilitado" : bloqueios);
  }

  const cliente = analise.cliente as never;

  // Bloco 14A — alertas de consistência antes do cálculo
  const dreCons = (analise.dados_dre ?? {}) as Record<string, unknown>;
  const saidasCons = (analise.dados_saidas ?? {}) as { periodos?: Array<Record<string, unknown>> };
  const fornCons = (analise.dados_fornecedores ?? {}) as { fornecedores?: Array<{ cnpj?: string | null }> };
  const resumoFolhaAtual = resumirFolha(analise.dados_folha);
  const totalSaidas = (saidasCons.periodos ?? []).reduce((acc, p) => {
    const v = Number(p["receita_total"] ?? p["total"] ?? p["valor_total"] ?? 0);
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);
  const cadastroCli = (analise.cliente ?? {}) as {
    iss_aliquota_efetiva?: number | null;
    pct_empreitada?: number | null;
    base_creditavel_estimada?: number | null;
  };
  const alertas = [
    ...alertasConsistencia({
      receitaDre: receitaAnualAtual || Number(dreCons["receita_bruta_total"] ?? 0),
      totalSaidas: fatorDreAtual ? totalSaidas * fatorDreAtual : totalSaidas,
      totalSegregado: linhasReceita.reduce((a, l) => a + Number(l.valor_anualizado ?? 0), 0),
      folhaMensal: resumoFolhaAtual.competencias.map((c) => c.total_proventos),
      fornecedoresSemCnpj: (fornCons.fornecedores ?? []).filter((f) => !f.cnpj).length,
      cliente: (analise.cliente ?? {}) as PerfilCliente,
      temPgdas: undefined,
      issAliquotaCadastro: cadastroCli.iss_aliquota_efetiva ?? null,
      pctEmpreitada: cadastroCli.pct_empreitada ?? null,
      baseCreditavelEstimada: cadastroCli.base_creditavel_estimada ?? null,
      custoDiretoAnual:
        (Number(dreCons["cmv"] ?? 0) + Number(dreCons["csp"] ?? 0)) * (fatorDreAtual || 1),
    }),
    ...resumoFolhaAtual.alertas.map((mensagem) => ({ nivel: "atencao" as const, mensagem })),
  ];
  const resultados = analise.resultados_calculo as never;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link to="/analises" className="text-xs text-muted-foreground hover:text-navy inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </Link>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="label-uppercase">Análise · {analise.status}</p>
          <h1 className="font-display text-3xl text-navy mt-1">{(cliente as { razao_social?: string })?.razao_social ?? "—"}</h1>
        </div>
        <div className="flex items-center gap-2">
          {resultados && cliente && (
            <ShareLinkDialog
              analiseId={analise.id}
              token={analise.link_token as string | null}
              acessos={analise.link_acessos ?? 0}
              onTokenRegenerated={refetchAnalise}
            />
          )}
          {resultados && cliente && (
            <Button
              variant="outline"
              onClick={async () => {
                const t = toast.loading("Gerando diagnóstico em PDF...");
                try {
                  await gerarDiagnosticoPDF({
                    cliente: cliente as never,
                    analise: analise as never,
                    dashboardElementId: "diagnostico-export",
                  });
                  toast.success("Diagnóstico gerado", { id: t });
                } catch (e) {
                  toast.error("Falha ao gerar PDF", { id: t, description: e instanceof Error ? e.message : String(e) });
                }
              }}
              className="border-navy text-navy hover:bg-navy hover:text-white"
              title="Baixar diagnóstico completo em PDF para enviar ao cliente"
            >
              <FileDown className="h-4 w-4 mr-2" /> Diagnóstico PDF
            </Button>
          )}
          {resultados && cliente && (
            <Button
              variant="outline"
              onClick={async () => {
                const t = toast.loading("Gerando apresentação em PowerPoint...");
                try {
                  const { gerarDiagnosticoPPTX } = await import("@/lib/diagnostico-pptx");
                  await gerarDiagnosticoPPTX({
                    cliente: cliente as never,
                    analise: analise as never,
                    dashboardElementId: "diagnostico-export",
                  });
                  toast.success("Apresentação gerada", { id: t });
                } catch (e) {
                  toast.error("Falha ao gerar PPTX", { id: t, description: e instanceof Error ? e.message : String(e) });
                }
              }}
              className="border-navy text-navy hover:bg-navy hover:text-white"
              title="Baixar apresentação em PowerPoint com o estudo completo e a auditoria da CBS 2027"
            >
              <Presentation className="h-4 w-4 mr-2" /> Diagnóstico PPTX
            </Button>
          )}

          <span
            title={
              todosOk
                ? undefined
                : `Pendências que bloqueiam o cálculo:\n• ${bloqueios.join("\n• ")}`
            }
            className="inline-flex"
          >
            <Button
              onClick={calcular}
              disabled={!todosOk || calculando}
              className="bg-gold text-navy hover:bg-gold/90"
            >
              {calculando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}
              {resultados ? "Recalcular cenários" : "Calcular cenários"}
            </Button>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-navy/30 text-navy hover:bg-navy/5" title="Criar outro cenário para este cliente">
                <Plus className="h-4 w-4 mr-1" /> Novo cenário <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Para o mesmo cliente</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => criarNovoCenario("duplicar")} className="cursor-pointer">
                <Copy className="h-4 w-4 mr-2 text-navy" />
                <div className="flex flex-col">
                  <span className="font-medium">Duplicar este cenário</span>
                  <span className="text-[11px] text-muted-foreground">Clona dados extraídos para você ajustar</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => criarNovoCenario("branco")} className="cursor-pointer">
                <FilePlus2 className="h-4 w-4 mr-2 text-navy" />
                <div className="flex flex-col">
                  <span className="font-medium">Começar do zero</span>
                  <span className="text-[11px] text-muted-foreground">Análise em branco, novos documentos</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="mt-6 space-y-2">
          {alertas.map((a, i) => (
            <div
              key={i}
              className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${
                a.nivel === "erro"
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{a.mensagem}</span>
            </div>
          ))}
        </div>
      )}

      {bloqueios.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">O cálculo está bloqueado pelas pendências abaixo</p>
            <ul className="text-xs mt-1 list-disc pl-4 space-y-0.5">
              {bloqueios.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {clienteIdAtual && (
              <Link
                to="/clientes/$id/documentos"
                params={{ id: clienteIdAtual }}
                className="underline font-medium text-xs mt-1 inline-block"
              >
                Abrir central de documentos
              </Link>
            )}
          </div>
        </div>
      )}

      {tipoAtendido("DRE") && !periodoDreAtual && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Confirmação manual do período da DRE</p>
          <p className="mt-1 text-xs">
            As datas não foram encontradas em <span className="font-mono">dados_dre.periodos[]</span>. Informe quantos meses a DRE cobre para liberar o cálculo sem assumir 12 meses automaticamente.
          </p>
          <div className="mt-3 flex max-w-xs items-end gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium" htmlFor="meses-dre-manual">Meses da DRE</label>
              <Input
                id="meses-dre-manual"
                value={mesesDreManual}
                onChange={(e) => setMesesDreManual(e.target.value)}
                inputMode="numeric"
                placeholder="Ex.: 6"
              />
            </div>
            {mesesManualAtual && (
              <span className="pb-2 text-xs font-medium">fator {formatarFatorAnualizacao(12 / mesesManualAtual)}</span>
            )}
          </div>
        </div>
      )}





      <Card className="mt-8 p-6 shadow-[var(--shadow-elegant)]">
        <div className="flex items-start justify-between gap-4 mb-1 flex-wrap">
          <div>
            <h2 className="font-display text-xl text-navy">Documentos do Domínio</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Aceita <strong>vários PDFs por tipo</strong> e também <strong>ZIP/RAR</strong> com todos os documentos juntos.
              Identifico o tipo automaticamente pelo nome <em>e</em> pelo conteúdo do PDF.
            </p>
          </div>
          <label className="cursor-pointer shrink-0">
            <input
              type="file"
              accept=".pdf,.zip,.rar,application/pdf,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed"
              multiple
              className="hidden"
              disabled={busy !== null}
              onChange={(e) => { if (e.target.files?.length) handleArchiveUpload(e.target.files); e.target.value = ""; }}
            />
            <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-2 border-gold rounded-md hover:bg-gold/10 text-navy">
              <Upload className="h-3.5 w-3.5" /> Enviar ZIP / RAR / PDFs
            </span>
          </label>
        </div>


        <div className="mt-6 space-y-3">
          {TIPOS.map(({ tipo, label, hint }) => {
            const docs = docsByTipo(tipo);
            const isBusy = busy === `${tipo}-multi`;
            const okCount = docs.filter((d) => d.status_extracao === "CONCLUIDO").length;
            return (
              <div key={tipo} className="border rounded-lg p-4 bg-off-white/40">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-navy">{label}</p>
                      {okCount > 0 && (
                        <span className="text-[10px] uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                          {okCount} ok
                        </span>
                      )}
                      {isConcluido(statusCentral(tipo)) && (
                        <span className="text-[10px] uppercase bg-navy/10 text-navy px-2 py-0.5 rounded">
                          {STATUS_LABEL[statusCentral(tipo) as StatusDocumento]}
                        </span>
                      )}
                      {REQUIRED_FOR_CALC.includes(tipo) && !tipoAtendido(tipo) && (
                        <span className="text-[10px] uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded">obrigatório</span>
                      )}

                    </div>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {docs.length > 0 && (
                      <button
                        onClick={() => substituirTodos(tipo)}
                        disabled={isBusy}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10"
                        title="Remove todos os PDFs deste tipo"
                      >
                        <Trash2 className="h-3 w-3" /> Substituir todos
                      </button>
                    )}
                    <label className="cursor-pointer">
                      <input
                        type="file" accept=".pdf,application/pdf" multiple className="hidden" disabled={isBusy}
                        onChange={(e) => { if (e.target.files?.length) handleUploadMulti(tipo, e.target.files); e.target.value = ""; }}
                      />
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md hover:bg-navy hover:text-white">
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Adicionar PDFs
                      </span>
                    </label>
                  </div>
                </div>

                {docs.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {docs.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 text-xs bg-white border rounded px-2.5 py-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate" title={d.nome_arquivo}>{d.nome_arquivo}</span>
                        <StatusInline status={d.status_extracao} erro={d.erro_mensagem} />
                        <button onClick={() => removerDoc(d)} className="text-muted-foreground hover:text-destructive p-0.5" title="Remover">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {cliente && (() => {
        const cli = cliente as { id: string; rbt12: number; cnae_principal?: string | null };
        return (
          <div className="mt-6">
            <SegregacaoReceita
              clienteId={cli.id}
              analiseId={id}
              receitaAnual={receitaAnualAtual}
              receitaPeriodo={receitaPeriodoAtual}
              mesesDre={mesesDreAtual}
              cnaePrincipal={cli.cnae_principal ?? null}
            />
          </div>
        );
      })()}



      {(() => {
        const dadosForn = (analise.dados_fornecedores ?? {}) as {
          fornecedores_classificados?: FornecedorClassificado[];
          total_compras_anuais?: number;
        };
        const lista = dadosForn.fornecedores_classificados ?? [];
        if (!lista.length) return null;
        const cli = cliente as { rbt12: number };
        const receitaAnual = receitaAnualAtual || Number(cli?.rbt12 ?? 0);
        return (
          <FornecedoresDashboard
            fornecedores={lista}
            receitaAnual={receitaAnual}
            totalComprasAnuais={dadosForn.total_compras_anuais ?? 0}
            onSave={async (nova) => {
              const novoDado = { ...dadosForn, fornecedores_classificados: nova };
              await supabase.from("analises").update({ dados_fornecedores: novoDado as never } as never).eq("id", id);
              await refetchAnalise();
              toast.success("Fornecedores atualizados");
            }}
          />
        );
      })()}

      {resultados && cliente && (
        <AnalysisDashboard analise={analise as never} cliente={cliente as never} />
      )}

      {!cliente && (
        <Button variant="ghost" className="mt-6" onClick={() => navigate({ to: "/clientes" })}>Voltar para clientes</Button>
      )}
    </div>
  );
}

function StatusInline({ status, erro }: { status: string; erro: string | null }) {
  if (status === "PROCESSANDO") return <span className="flex items-center gap-1 text-amber-700"><Loader2 className="h-3 w-3 animate-spin" /> Extraindo</span>;
  if (status === "CONCLUIDO") return <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> OK</span>;
  if (status === "ERRO_MANUAL") return <span className="flex items-center gap-1 text-destructive" title={erro ?? ""}><AlertCircle className="h-3 w-3" /> Erro</span>;
  return <span className="text-muted-foreground">—</span>;
}



function ShareLinkDialog({
  analiseId,
  token,
  acessos,
  onTokenRegenerated,
}: {
  analiseId: string;
  token: string | null;
  acessos: number;
  onTokenRegenerated: () => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const regerar = useServerFn(regerarTokenAnalise);

  const url = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${token}` : "";

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado!", { description: "Cole no e-mail ou WhatsApp do cliente." });
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  async function handleRegerar() {
    if (!confirm("Gerar um novo link invalidará o atual. O cliente precisará receber a nova URL. Continuar?")) return;
    setRegenerating(true);
    try {
      await regerar({ data: { analiseId } });
      await onTokenRegenerated();
      toast.success("Novo link gerado");
    } catch (e) {
      toast.error("Falha ao gerar novo link", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-gold text-navy hover:bg-gold/10" title="Compartilhar link interativo com o cliente">
          <Share2 className="h-4 w-4 mr-2" /> Link do cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-navy">Compartilhar relatório interativo</DialogTitle>
          <DialogDescription>
            Envie este link ao cliente. Ele abre o diagnóstico completo no navegador, com todos os gráficos e animações — sem precisar de login.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Link público</label>
            <div className="flex gap-2 mt-1.5">
              <Input value={url} readOnly className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button onClick={copiar} className="bg-navy text-white hover:bg-navy/90 shrink-0">
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-off-white/60 border rounded-lg p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Acessos do cliente</p>
              <p className="font-display text-2xl text-navy mt-1">{acessos}</p>
              <p className="text-[10px] text-muted-foreground">vezes que o link foi aberto</p>
            </div>
            <div className="bg-off-white/60 border rounded-lg p-3">
              <p className="text-[10px] uppercase text-muted-foreground">Validade</p>
              <p className="font-display text-base text-navy mt-1">Sem expiração</p>
              <p className="text-[10px] text-muted-foreground">ativo até você revogar</p>
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground bg-amber-50 border border-amber-200 rounded p-2.5">
            <strong className="text-amber-900">Segurança:</strong> o link contém um token único. Compartilhe apenas com o cliente desta análise.
            Se suspeitar de vazamento, gere um novo link — o anterior deixará de funcionar imediatamente.
          </div>

          <div className="flex justify-between items-center pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => window.open(url, "_blank")} disabled={!url}>
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Visualizar como cliente
            </Button>
            <Button variant="outline" size="sm" onClick={handleRegerar} disabled={regenerating} className="text-destructive border-destructive/30 hover:bg-destructive/10">
              {regenerating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              Gerar novo link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

