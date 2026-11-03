import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { FileSearch, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analises")({
  component: AnalisesList,
});

type Row = {
  id: string;
  status: string;
  recomendacao_regime: string | null;
  created_at: string;
  cliente_id: string;
  cliente: { razao_social: string } | null;
};

function AnalisesList() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data = [] } = useQuery({
    queryKey: ["analises-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analises")
        .select("id, status, recomendacao_regime, created_at, cliente_id, cliente:clientes(razao_social)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  if (pathname !== "/analises") return <Outlet />;

  // Agrupa por cliente, numera cenários cronologicamente (Cenário 1 = mais antigo)
  const grupos = new Map<string, { nome: string; analises: (Row & { cenario: number })[] }>();
  for (const a of data) {
    const key = a.cliente_id;
    const nome = a.cliente?.razao_social ?? "—";
    const g = grupos.get(key) ?? { nome, analises: [] };
    g.analises.push({ ...a, cenario: g.analises.length + 1 });
    grupos.set(key, g);
  }
  // Ordena clientes pelo mais recente cenário
  const gruposOrdenados = Array.from(grupos.entries()).sort((a, b) => {
    const lastA = a[1].analises[a[1].analises.length - 1].created_at;
    const lastB = b[1].analises[b[1].analises.length - 1].created_at;
    return lastB.localeCompare(lastA);
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="font-display text-3xl text-navy">Análises</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Diagnósticos tributários agrupados por cliente. Cada cliente pode ter múltiplos cenários para comparação.
      </p>

      {grupos.size === 0 ? (
        <Card className="mt-8 p-12 text-center text-sm text-muted-foreground shadow-[var(--shadow-elegant)]">
          <FileSearch className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
          Nenhuma análise. Abra um cliente e clique em <strong>Nova análise</strong>.
        </Card>
      ) : (
        <div className="mt-8 space-y-4">
          {gruposOrdenados.map(([clienteId, g]) => (
            <Card key={clienteId} className="shadow-[var(--shadow-elegant)] overflow-hidden">
              <div className="bg-off-white/60 border-b px-6 py-3 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg text-navy">{g.nome}</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {g.analises.length} {g.analises.length === 1 ? "cenário" : "cenários"}
                  </p>
                </div>
                <Link
                  to="/clientes/$id"
                  params={{ id: clienteId }}
                  className="text-xs text-muted-foreground hover:text-navy inline-flex items-center gap-1"
                >
                  Ver cliente <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-off-white text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-6 py-2.5 text-left font-medium w-32">Cenário</th>
                    <th className="px-3 py-2.5 text-left font-medium">Criado em</th>
                    <th className="px-3 py-2.5 text-left font-medium">Status</th>
                    <th className="px-3 py-2.5 text-left font-medium">Recomendação</th>
                    <th className="px-6 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {g.analises
                    .slice()
                    .reverse()
                    .map((a) => (
                      <tr key={a.id} className="border-t hover:bg-off-white/60">
                        <td className="px-6 py-3">
                          <span className="font-medium text-navy">Cenário {a.cenario}</span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{formatDate(a.created_at)}</td>
                        <td className="px-3 py-3">{a.status}</td>
                        <td className="px-3 py-3">{a.recomendacao_regime ?? "—"}</td>
                        <td className="px-6 py-3 text-right">
                          <Link
                            to="/analises/$id"
                            params={{ id: a.id }}
                            className="text-gold hover:underline text-xs font-medium"
                          >
                            Abrir →
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
