import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/format";
import { Plus, ArrowRight, Users, FileSearch, CheckCircle2, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, cnpj, setor, regime_atual, rbt12, created_at, responsavel_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: analises = [] } = useQuery({
    queryKey: ["analises-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analises")
        .select("id, cliente_id, status, recomendacao_regime, created_at");
      if (error) throw error;
      return data;
    },
  });

  const totalClientes = clientes.length;
  const totalConcluidas = analises.filter((a) => a.status === "CONCLUIDO").length;
  const totalRascunho = analises.filter((a) => a.status !== "CONCLUIDO").length;
  const semAnalise = clientes.filter(
    (c) => !analises.some((a) => a.cliente_id === c.id),
  ).length;

  const kpis = [
    { label: "Clientes cadastrados", value: totalClientes, icon: Users, tone: "navy" },
    { label: "Análises concluídas", value: totalConcluidas, icon: CheckCircle2, tone: "success" },
    { label: "Em rascunho", value: totalRascunho, icon: FileSearch, tone: "warning" },
    { label: "Sem análise", value: semAnalise, icon: AlertTriangle, tone: "danger" },
  ] as const;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="label-uppercase">Painel da equipe</p>
          <h1 className="font-display text-4xl text-navy mt-1">
            Bom trabalho, <span className="text-gold">{user?.email?.split("@")[0]}</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Cada cliente do Simples merece um diagnóstico antes do fim da janela de cancelamento, em 20/12/2026.
          </p>
        </div>
        <Link to="/clientes/novo">
          <Button className="bg-navy text-white hover:bg-navy/90 h-11 px-5">
            <Plus className="h-4 w-4 mr-2" /> Novo cliente
          </Button>
        </Link>
      </header>

      <motion.div
        initial="hidden" animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
      >
        {kpis.map(({ label, value, icon: Icon, tone }) => (
          <motion.div
            key={label}
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4 }}
          >
            <Card className="p-5 shadow-[var(--shadow-elegant)] border-border/60 hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5 transition-all duration-150">
              <div className="flex items-start justify-between">
                <span className="label-uppercase">{label}</span>
                <Icon className={`h-4 w-4 text-${tone === "navy" ? "navy" : tone}`} />
              </div>
              <div className="num-display text-4xl text-navy mt-3">{value}</div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <Card className="shadow-[var(--shadow-elegant)] overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl text-navy">Carteira de clientes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalClientes} cliente{totalClientes === 1 ? "" : "s"} sob a régua da Reforma
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : clientes.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-off-white grid place-items-center">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg text-navy mt-4">Nenhum cliente ainda</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Cadastre o primeiro cliente para começar um diagnóstico.
            </p>
            <Link to="/clientes/novo">
              <Button className="mt-6 bg-navy text-white hover:bg-navy/90">
                <Plus className="h-4 w-4 mr-2" /> Cadastrar primeiro cliente
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
