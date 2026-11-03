import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/format";
import { ArrowLeft, FileSearch, Plus, Pencil, Building2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/clientes/$id")({
  component: ClientePage,
});

function ClientePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChildRoute = pathname !== `/clientes/${id}`;



  const { data: cliente } = useQuery({
    queryKey: ["cliente", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: analises = [], refetch } = useQuery({
    queryKey: ["cliente-analises", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analises")
        .select("id, status, recomendacao_regime, created_at")
        .eq("cliente_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function novaAnalise() {
    if (!user) return;
    const { data, error } = await supabase
      .from("analises")
      .insert({ cliente_id: id, responsavel_id: user.id, status: "RASCUNHO" })
      .select("id")
      .single();
    if (error || !data) {
      toast.error("Falha ao criar análise", { description: error?.message });
      return;
    }
    await refetch();
    toast.success("Nova análise criada — envie os documentos");
    navigate({ to: "/analises/$id", params: { id: data.id } });
  }

  if (isChildRoute) return <Outlet />;
  if (!cliente) return <div className="p-8 text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-navy inline-flex items-center gap-1 mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </Link>
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="label-uppercase">{cliente.setor} {cliente.subsetor ? `· ${cliente.subsetor}` : ""}</p>
          <h1 className="font-display text-3xl text-navy mt-1">{cliente.razao_social}</h1>
          <p className="text-sm text-muted-foreground mt-1 tabular-nums">CNPJ {formatCNPJ(cliente.cnpj)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/clientes/$id/documentos" params={{ id }}>
            <Button variant="outline">
              <ClipboardList className="h-4 w-4 mr-2" /> Documentos
            </Button>
          </Link>
          <Link to="/clientes/$id/fornecedores" params={{ id }}>
            <Button variant="outline">
              <Building2 className="h-4 w-4 mr-2" /> Fornecedores
            </Button>
          </Link>
          <Link to="/clientes/$id/editar" params={{ id }}>
            <Button variant="outline">
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </Button>
          </Link>
          <Button onClick={novaAnalise} className="bg-gold text-navy hover:bg-gold/90">
            <Plus className="h-4 w-4 mr-2" /> Nova análise
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        <Stat label="Regime atual" value={cliente.regime_atual.replace("_", " ")} />
        <Stat label="RBT12" value={formatBRL(Number(cliente.rbt12))} />
        <Stat label="Funcionários" value={String(cliente.num_funcionarios ?? 0)} />
        <Stat label="% B2B" value={`${cliente.pct_b2b ?? 0}%`} />
      </div>

      <Card className="mt-8 shadow-[var(--shadow-elegant)]">
        <div className="px-6 py-4 border-b">
          <h2 className="font-display text-xl text-navy">Análises</h2>
        </div>
        {analises.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <FileSearch className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
            Nenhuma análise ainda. Clique em <strong>Nova análise</strong> para começar.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-off-white text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Criada em</th>
                <th className="px-3 py-3 text-left font-medium">Status</th>
                <th className="px-3 py-3 text-left font-medium">Recomendação</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {analises.map((a) => (
                <tr key={a.id} className="border-t hover:bg-off-white/60">
                  <td className="px-6 py-3 text-muted-foreground">{formatDate(a.created_at)}</td>
                  <td className="px-3 py-3">{a.status}</td>
                  <td className="px-3 py-3">{a.recomendacao_regime ?? "—"}</td>
                  <td className="px-6 py-3 text-right">
                    <Link to="/analises/$id" params={{ id: a.id }} className="text-gold hover:underline text-xs font-medium">
                      Enviar ZIP →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="label-uppercase">{label}</p>
      <p className="num-display text-xl text-navy mt-1 truncate">{value}</p>
    </Card>
  );
}
