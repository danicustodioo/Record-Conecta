// Card de Diagnóstico IA — 3 colunas: positivos / alertas / soluções.
// Busca via server function gerarDiagnosticoIA (cache em analises.diagnostico_ia).

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Lightbulb, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { gerarDiagnosticoIA, type DiagnosticoIA } from "@/lib/diagnostico-ia.functions";

export function DiagnosticoIACard({
  analiseId,
  diagnosticoInicial,
}: {
  analiseId: string;
  diagnosticoInicial?: DiagnosticoIA | null;
}) {
  const fn = useServerFn(gerarDiagnosticoIA);
  const q = useQuery({
    queryKey: ["diagnostico-ia", analiseId],
    queryFn: () => fn({ data: { analise_id: analiseId } }),
    initialData: diagnosticoInicial ?? undefined,
    staleTime: Infinity,
    retry: false,
  });

  const handleRefresh = async () => {
    await fn({ data: { analise_id: analiseId, force: true } });
    await q.refetch();
  };

  if (q.isLoading && !q.data) {
    return (
      <Card className="p-8 bg-gradient-to-br from-navy/95 to-navy text-white border border-gold/30 shadow-[var(--shadow-elevated)]">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gold">Diagnóstico Inteligente</p>
            <p className="text-sm text-white/80 mt-1">Gerando interpretação com IA…</p>
          </div>
        </div>
      </Card>
    );
  }

  if (q.isError) {
    return (
      <Card className="p-6 bg-rose-50 border border-rose-200">
        <p className="text-sm text-rose-900 font-medium">Não foi possível gerar o diagnóstico IA</p>
        <p className="text-xs text-rose-700 mt-1">{(q.error as Error)?.message}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => q.refetch()}>
          <RefreshCw className="h-3 w-3 mr-1.5" /> Tentar de novo
        </Button>
      </Card>
    );
  }

  const d = q.data;
  if (!d) return null;

  return (
    <Card data-export-section="diagnostico-ia" className="p-6 md:p-8 bg-gradient-to-br from-navy/[0.02] to-gold/[0.04] border border-gold/30 shadow-[var(--shadow-elegant)]">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gold flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Diagnóstico Inteligente
          </p>
          <h3 className="font-display text-2xl text-navy mt-1">Interpretação dos resultados</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Gerado por IA com base no perfil da empresa e nos cálculos da reforma.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={q.isFetching} data-export-skip="true">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Coluna
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="text-emerald-700"
          bg="bg-emerald-50/70 border-emerald-200"
          titulo="Pontos positivos"
          itens={d.pontos_positivos.map((p) => ({ titulo: p.titulo, descricao: p.descricao }))}
          delay={0}
        />
        <Coluna
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="text-amber-700"
          bg="bg-amber-50/70 border-amber-200"
          titulo="Pontos de alerta"
          itens={d.pontos_alerta.map((p) => ({ titulo: p.titulo, descricao: p.descricao }))}
          delay={0.1}
        />
        <Coluna
          icon={<Lightbulb className="h-4 w-4" />}
          accent="text-sky-700"
          bg="bg-sky-50/70 border-sky-200"
          titulo="Soluções acionáveis"
          itens={d.solucoes.map((p) => ({ titulo: p.titulo, descricao: p.descricao, badge: p.prazo }))}
          delay={0.2}
        />
      </div>
    </Card>
  );
}

function Coluna({
  icon,
  accent,
  bg,
  titulo,
  itens,
  delay,
}: {
  icon: React.ReactNode;
  accent: string;
  bg: string;
  titulo: string;
  itens: Array<{ titulo: string; descricao: string; badge?: string }>;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className={`rounded-lg border p-4 ${bg}`}
    >
      <div className={`flex items-center gap-2 ${accent} font-medium text-sm mb-3`}>
        {icon}
        <span>{titulo}</span>
      </div>
      <ul className="space-y-3">
        {itens.map((it, i) => (
          <li key={i} className="text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-navy leading-snug">{it.titulo}</p>
              {it.badge && (
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${accent} bg-white/70 whitespace-nowrap`}>
                  {it.badge}
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{it.descricao}</p>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
