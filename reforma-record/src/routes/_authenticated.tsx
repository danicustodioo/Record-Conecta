import { Link, Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RecordLogo } from "@/components/brand/Logo";
import { CountdownBar } from "@/components/layout/CountdownBar";
import { LayoutDashboard, Users, FileSearch, Settings, LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthenticatedLayout,
});

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/analises", label: "Análises", icon: FileSearch },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

function AuthenticatedLayout() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col bg-off-white">
      <CountdownBar />
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="hidden md:flex w-64 bg-navy text-white flex-col">
          <div className="p-6 border-b border-gold/20">
            <RecordLogo variant="white" size="sm" />
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeProps={{ className: "bg-gold/15 text-gold border-gold/40" }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-white/80 hover:text-white hover:bg-white/5 border border-transparent transition-colors"
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="p-3 border-t border-gold/20 space-y-3">
            <Link to="/clientes/novo">
              <Button className="w-full bg-gold text-navy hover:bg-gold/90 font-medium">
                <Plus className="h-4 w-4 mr-2" /> Novo cliente
              </Button>
            </Link>
            <div className="text-xs px-2 text-white/60">
              <div className="font-medium text-white truncate">{user?.email}</div>
              <div className="mt-0.5">{isAdmin ? "Administrador" : "Analista"}</div>
            </div>
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="w-full justify-start text-white/70 hover:text-white hover:bg-white/5"
            >
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <div className="md:hidden fixed bottom-4 inset-x-4 z-50 rounded-lg bg-warning-bg text-warning border border-warning/30 p-3 text-xs text-center shadow-lg">
        Para a melhor experiência, abra o painel em um computador.
      </div>
    </div>
  );
}
