import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/format";
import { ArrowRight, Plus, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientesPage,
});

function ClientesPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, cnpj, setor, regime_atual, rbt12, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (pathname !== "/clientes") return <Outlet />;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl text-navy">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Cadastre, abra o cliente e acesse o envio dos PDFs/ZIP pela análise.
          </p>
        </div>
        <Link to="/clientes/novo">
          <Button className="bg-navy text-white hover:bg-navy/90">
            <Plus className="h-4 w-4 mr-2" /> Novo cliente
          </Button>
        </Link>
      </header>

      <Card className="mt-8 shadow-[var(--shadow-elegant)] overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Carregando clientes...</div>
        ) : clientes.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-off-white grid place-items-center">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <h2 className="font-display text-lg text-navy mt-4">Nenhum cliente cadastrado</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Crie um cliente para abrir automaticamente a tela de envio do ZIP.
            </p>
            <Link to="/clientes/novo">
              <Button className="mt-6 bg-navy text-white hover:bg-navy/90">
                <Plus className="h-4 w-4 mr-2" /> Cadastrar cliente
              </Button>
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-off-white">
                <th className="px-6 py-3 font-medium">Razão social</th>
                <th className="px-3 py-3 font-medium">CNPJ</th>
                <th className="px-3 py-3 font-medium">Setor</th>
                <th className="px-3 py-3 font-medium text-right">RBT12</th>
                <th className="px-3 py-3 font-medium">Cadastro</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-t hover:bg-off-white/60 transition-colors">
                  <td className="px-6 py-4 font-medium text-navy">{c.razao_social}</td>
                  <td className="px-3 py-4 text-muted-foreground tabular-nums">{formatCNPJ(c.cnpj)}</td>
                  <td className="px-3 py-4">{c.setor}</td>
                  <td className="px-3 py-4 text-right tabular-nums">{formatBRL(Number(c.rbt12))}</td>
                  <td className="px-3 py-4 text-muted-foreground">{formatDate(c.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <Link to="/clientes/$id" params={{ id: c.id }}>
                      <Button variant="ghost" size="sm" className="text-navy hover:text-gold">
                        Abrir <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
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
