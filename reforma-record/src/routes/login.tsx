import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

import { RecordLogo } from "@/components/brand/Logo";
import { toast } from "sonner";
import { motion } from "framer-motion";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error("Falha no acesso", { description: error.message });
    toast.success("Bem-vindo de volta");
    navigate({ to: "/dashboard", replace: true });
  }

  // Self-registration removed: this is an internal platform.
  // New team members must be provisioned by an administrator.

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-off-white">
      {/* Brand panel */}
      <motion.aside
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
        className="hidden lg:flex relative bg-navy text-white p-14 flex-col justify-between overflow-hidden"
      >
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_30%_20%,var(--gold),transparent_55%)]" />
        <div className="relative z-10">
          <RecordLogo variant="white" size="lg" />
        </div>
        <div className="relative z-10 max-w-md">
          <p className="label-uppercase text-gold/90">Diagnóstico Tributário</p>
          <h1 className="font-display text-5xl leading-[1.05] mt-3">
            A Reforma chega em <span className="text-gold">2027</span>.<br />
            Seu cliente decide até <span className="text-gold">30/09/2026</span>.
          </h1>
          <p className="text-white/70 mt-6 text-base leading-relaxed">
            Estudos comparativos de Simples Tradicional, Híbrido, Lucro Presumido e Lucro Real —
            gerados com a precisão de quem conhece cada cliente do escritório.
          </p>
          <div className="gold-divider my-8" />
          <p className="text-white/60 text-xs">
            Plataforma interna — Record Assessoria Contábil · Londrina/PR
          </p>
        </div>
      </motion.aside>

      {/* Form panel */}
      <main className="flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden mb-8 flex justify-center">
            <RecordLogo size="md" />
          </div>
          <Card className="p-8 shadow-[var(--shadow-elegant)]">
            <h2 className="font-display text-2xl text-navy">Acesso da equipe</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Plataforma interna. Use seu e-mail Record.
            </p>
            <form onSubmit={handleLogin} className="space-y-4 mt-6">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" name="password" type="password" required autoComplete="current-password" />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-navy text-white hover:bg-navy/90">
                {loading ? "Entrando..." : "Entrar"}
              </Button>
              <p className="text-xs text-muted-foreground text-center pt-2">
                Novos acessos são criados por um administrador.
              </p>
            </form>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
