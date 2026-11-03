import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: () => (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-3xl text-navy">Configurações</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Parâmetros da Reforma, gestão de usuários e templates de e-mail serão entregues no Bloco 5.
      </p>
    </div>
  ),
});
