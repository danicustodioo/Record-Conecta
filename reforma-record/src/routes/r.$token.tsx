// Rota PÚBLICA: cliente acessa relatório via link compartilhado.
// Não exige autenticação. Token UUID na URL valida o acesso.

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { getAnaliseByToken } from "@/lib/relatorio-publico.functions";
import { AnalysisDashboard } from "@/components/analise/AnalysisDashboard";
import { FornecedoresDashboard } from "@/components/fornecedores/FornecedoresDashboard";
import type { FornecedorClassificado } from "@/lib/fornecedores/classificador";

export const Route = createFileRoute("/r/$token")({
  head: () => ({
    meta: [
      { title: "Diagnóstico Tributário · Record" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RelatorioPublicoPage,
});

function RelatorioPublicoPage() {
  const { token } = Route.useParams();
  const fetchByToken = useServerFn(getAnaliseByToken);

  const { data, isLoading, error } = useQuery({
    queryKey: ["relatorio-publico", token],
    queryFn: () => fetchByToken({ data: { token } }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-navy mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">Carregando relatório...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const titulo =
      msg.includes("LINK_INVALIDO") ? "Link inválido" :
      msg.includes("LINK_EXPIRADO") ? "Link expirado" :
      msg.includes("RELATORIO_NAO_DISPONIVEL") ? "Relatório ainda não disponível" :
      "Não foi possível abrir o relatório";
    const desc =
      msg.includes("LINK_INVALIDO") ? "Este link não corresponde a nenhum diagnóstico ativo. Confirme com seu contador." :
      msg.includes("LINK_EXPIRADO") ? "O prazo de acesso deste relatório expirou. Solicite um novo link." :
      msg.includes("RELATORIO_NAO_DISPONIVEL") ? "O diagnóstico ainda está sendo preparado." :
      "Tente novamente em alguns instantes ou contate seu contador.";
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-amber-700" />
          </div>
          <h1 className="font-display text-2xl text-navy mt-4">{titulo}</h1>
          <p className="text-sm text-muted-foreground mt-2">{desc}</p>
        </div>
      </div>
    );
  }

  const analise = data?.analise as never as {
    id: string;
    dados_dre?: Record<string, number | undefined>;
    dados_fornecedores?: {
      fornecedores_classificados?: FornecedorClassificado[];
      total_compras_anuais?: number;
    };
    cliente?: { razao_social?: string; rbt12?: number };
  };
  if (!analise) return null;

  const cliente = analise.cliente ?? {};
  const dadosForn = analise.dados_fornecedores ?? {};
  const lista = dadosForn.fornecedores_classificados ?? [];
  const dre = analise.dados_dre ?? {};
  const receitaAnual = dre.receita_bruta_total ?? Number(cliente?.rbt12 ?? 0);

  return (
    <div className="min-h-screen bg-off-white">
      {/* Header público — branding Record */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-navy text-white"
      >
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gold">Record · Reforma Tributária</p>
            <h1 className="font-display text-xl md:text-2xl mt-1">Diagnóstico Tributário</h1>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/70">
            <Lock className="h-3.5 w-3.5" />
            <span>Documento confidencial · acesso por link</span>
          </div>
        </div>
      </motion.header>

      <main className="max-w-6xl mx-auto px-6 pb-16">
        <AnalysisDashboard analise={analise as never} cliente={cliente as never} />

        {lista.length > 0 && (
          <FornecedoresDashboard
            fornecedores={lista}
            receitaAnual={receitaAnual}
            totalComprasAnuais={dadosForn.total_compras_anuais ?? 0}
            readOnly
          />
        )}

        <footer className="mt-16 pt-8 border-t text-center">
          <p className="text-[11px] text-muted-foreground">
            Documento gerado por <strong className="text-navy">Record Contabilidade</strong> · Análise baseada na LC 214/2025
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Este relatório é confidencial e destinado exclusivamente ao cliente identificado.
          </p>
        </footer>
      </main>
    </div>
  );
}
