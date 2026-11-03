import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm, Controller } from "react-hook-form";
import { CurrencyInput } from "@/components/ui/currency-input";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { classificarClientePorCnpj } from "@/lib/documentos.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clientes/novo")({
  component: NovoClientePage,
});

const SETORES = [
  "Hotelaria",
  "Saúde",
  "Comércio",
  "Indústria",
  "Postos de Gasolina",
  "Construção Civil",
  "Energia Solar",
  "Serviços Profissionais",
  "Outro",
] as const;

const SUBSETORES: Record<string, string[]> = {
  Hotelaria: ["Hotel Negócios", "Hotel Lazer", "Pousada", "Apart-hotel"],
  Saúde: ["Clínica Médica", "Clínica Odontológica", "Laboratório", "Fisioterapia", "Farmácia"],
  Comércio: ["Varejo Geral", "Alimentício", "Vestuário", "Material de Construção", "Autopeças"],
  Indústria: ["Alimentos e Bebidas", "Metal-mecânica", "Têxtil", "Plásticos", "Outros"],
};

const REGIMES = [
  { v: "SIMPLES_I", l: "Simples Nacional — Anexo I" },
  { v: "SIMPLES_II", l: "Simples Nacional — Anexo II" },
  { v: "SIMPLES_III", l: "Simples Nacional — Anexo III" },
  { v: "SIMPLES_IV", l: "Simples Nacional — Anexo IV" },
  { v: "SIMPLES_V", l: "Simples Nacional — Anexo V" },
  { v: "LUCRO_PRESUMIDO", l: "Lucro Presumido" },
  { v: "LUCRO_REAL", l: "Lucro Real" },
] as const;

const schema = z.object({
  razao_social: z.string().min(2, "Obrigatório"),
  nome_fantasia: z.string().optional().or(z.literal("")),
  cnpj: z.string().regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, "Formato 00.000.000/0000-00"),
  setor: z.string().min(1, "Obrigatório"),
  subsetor: z.string().optional().or(z.literal("")),
  regime_atual: z.enum(["SIMPLES_I", "SIMPLES_II", "SIMPLES_III", "SIMPLES_IV", "SIMPLES_V", "LUCRO_PRESUMIDO", "LUCRO_REAL"]),
  rbt12: z.coerce.number().min(0, "Obrigatório"),
  num_funcionarios: z.coerce.number().min(0).optional(),
  pct_b2b: z.coerce.number().min(0).max(100),
  iss_aliquota_efetiva: z.coerce.number().min(0).max(5).optional(),
  pct_empreitada: z.coerce.number().min(0).max(100).optional(),
  pct_creditavel: z.coerce.number().min(0).max(100).optional(),
  base_creditavel_estimada: z.coerce.number().min(0).optional(),
  socios_habilitados: z.boolean().optional(),
  email_cliente: z.string().email("E-mail inválido").optional().or(z.literal("")),
  observacoes: z.string().optional().or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

function maskCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function NovoClientePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      razao_social: "",
      nome_fantasia: "",
      cnpj: "",
      setor: "",
      subsetor: "",
      regime_atual: "SIMPLES_III",
      rbt12: 0,
      num_funcionarios: 0,
      pct_b2b: 0,
      email_cliente: "",
      observacoes: "",
    },
  });

  const setor = form.watch("setor");
  const pct_b2b = form.watch("pct_b2b") ?? 0;
  const classificar = useServerFn(classificarClientePorCnpj);

  async function onSubmit(values: FormData) {
    if (!user) {
      toast.error("Sessão expirada");
      return;
    }
    const { data, error } = await supabase
      .from("clientes")
      .insert({
        razao_social: values.razao_social,
        nome_fantasia: values.nome_fantasia || null,
        cnpj: values.cnpj,
        setor: values.setor,
        subsetor: values.subsetor || null,
        regime_atual: values.regime_atual,
        rbt12: values.rbt12,
        num_funcionarios: values.num_funcionarios ?? 0,
        pct_b2b: values.pct_b2b,
        pct_b2c: 100 - values.pct_b2b,
        iss_aliquota_efetiva: values.iss_aliquota_efetiva ?? null,
        pct_empreitada: values.pct_empreitada ?? null,
        pct_creditavel: values.pct_creditavel ?? null,
        base_creditavel_estimada: values.base_creditavel_estimada ?? null,
        socios_habilitados: values.socios_habilitados ?? false,
        email_cliente: values.email_cliente || null,
        observacoes: values.observacoes || null,
        responsavel_id: user.id,
      } as never)
      .select("id")
      .single();

    if (error || !data) {
      toast.error("Não foi possível salvar", { description: error?.message });
      return;
    }

    // Bloco 14A — classificação setorial automática pelo CNPJ (sugestão, não decisão)
    try {
      const rf = await classificar({ data: { cliente_id: data.id } });
      if (rf.cnae_principal) {
        toast.info(`CNAE ${rf.cnae_principal} identificado na Receita`, {
          description: rf.atividade_principal_texto ?? undefined,
        });
      }
    } catch {
      toast.warning("Não foi possível consultar o CNPJ na Receita agora", {
        description: "Você pode repetir a consulta na central de documentos do cliente.",
      });
    }

    // Cria a análise automaticamente e leva direto ao wizard de upload
    const { data: analise, error: errAn } = await supabase
      .from("analises")
      .insert({ cliente_id: data.id, responsavel_id: user.id, status: "RASCUNHO" })
      .select("id")
      .single();

    if (errAn || !analise) {
      toast.success("Cliente cadastrado");
      navigate({ to: "/clientes/$id", params: { id: data.id } });
      return;
    }
    toast.success("Cliente cadastrado — envie os documentos");
    navigate({ to: "/analises/$id", params: { id: analise.id } });
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <button
        onClick={() => navigate({ to: "/dashboard" })}
        className="text-xs text-muted-foreground hover:text-navy inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao painel
      </button>
      <h1 className="font-display text-3xl text-navy">Novo cliente</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Cadastre os dados básicos. O upload dos PDFs do Domínio acontece na análise.
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-6">
        <Card className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Razão Social *" error={form.formState.errors.razao_social?.message}>
              <Input {...form.register("razao_social")} />
            </Field>
            <Field label="Nome Fantasia">
              <Input {...form.register("nome_fantasia")} />
            </Field>
            <Field label="CNPJ *" error={form.formState.errors.cnpj?.message}>
              <Input
                value={form.watch("cnpj")}
                onChange={(e) => form.setValue("cnpj", maskCNPJ(e.target.value))}
                placeholder="00.000.000/0000-00"
              />
            </Field>
            <Field label="E-mail do cliente" error={form.formState.errors.email_cliente?.message}>
              <Input type="email" {...form.register("email_cliente")} />
            </Field>

            <Field label="Setor *" error={form.formState.errors.setor?.message}>
              <Select
                value={form.watch("setor")}
                onValueChange={(v) => {
                  form.setValue("setor", v);
                  form.setValue("subsetor", "");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {SETORES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Subsetor">
              <Select
                value={form.watch("subsetor") ?? ""}
                onValueChange={(v) => form.setValue("subsetor", v)}
                disabled={!SUBSETORES[setor]?.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder={SUBSETORES[setor]?.length ? "Selecione" : "—"} />
                </SelectTrigger>
                <SelectContent>
                  {(SUBSETORES[setor] ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Regime tributário atual *">
              <Select
                value={form.watch("regime_atual")}
                onValueChange={(v) => form.setValue("regime_atual", v as FormData["regime_atual"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGIMES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="RBT12 — receita 12 meses (R$) *" error={form.formState.errors.rbt12?.message}>
              <Controller
                control={form.control}
                name="rbt12"
                render={({ field }) => (
                  <CurrencyInput value={field.value} onChange={field.onChange} placeholder="0,00" />
                )}
              />
            </Field>

            <Field label="Nº de funcionários">
              <Input type="number" min="0" {...form.register("num_funcionarios")} />
            </Field>

            <Field label="ISS — alíquota efetiva (%)" error={form.formState.errors.iss_aliquota_efetiva?.message}>
              <Input type="number" step="0.0001" min="0" max="5" placeholder="ex.: 1,7388" {...form.register("iss_aliquota_efetiva")} />
            </Field>

            <Field label="% empreitada com material (presunção 8%/12%)" error={form.formState.errors.pct_empreitada?.message}>
              <Input type="number" step="0.01" min="0" max="100" placeholder="ex.: 93,50" {...form.register("pct_empreitada")} />
            </Field>

            <Field label="% creditável do custo de serviços" error={form.formState.errors.pct_creditavel?.message}>
              <Input type="number" step="0.01" min="0" max="100" placeholder="ex.: 70,00" {...form.register("pct_creditavel")} />
            </Field>

            <Field label="Base creditável estimada anual (R$)">
              <Controller
                control={form.control}
                name="base_creditavel_estimada"
                render={({ field }) => (
                  <CurrencyInput value={Number(field.value ?? 0)} onChange={field.onChange} placeholder="0,00" />
                )}
              />
            </Field>
          </div>
          <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input type="checkbox" className="mt-0.5" {...form.register("socios_habilitados")} />
            <span>
              <span className="font-medium">Sócios profissionais habilitados confirmados</span>
              <span className="block text-xs text-muted-foreground">
                Marque apenas se todos os sócios têm habilitação profissional no conselho de classe. Sem
                confirmação, o motor não aplica a redução de 30% de profissão regulamentada (art. 127).
              </span>
            </span>
          </label>

          <p className="text-xs text-muted-foreground">
            Deixe os parâmetros acima em branco quando não houver informação: o sistema não aplica valores padrão
            (nem ISS de 5%, nem presunção linear de 32%).
          </p>

          <div className="pt-2">
            <Label className="label-uppercase">% vendas B2B (para outras empresas)</Label>
            <div className="flex items-center gap-4 mt-3">
              <Slider
                value={[pct_b2b]}
                onValueChange={([v]) => form.setValue("pct_b2b", v ?? 0)}
                max={100} step={1}
                className="flex-1"
              />
              <span className="num-display text-2xl text-navy w-16 text-right">{pct_b2b}%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {pct_b2b}% B2B · {100 - pct_b2b}% B2C — afeta a recomendação de regime híbrido.
            </p>
          </div>

          <Field label="Observações">
            <Textarea rows={3} {...form.register("observacoes")} />
          </Field>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting} className="bg-navy hover:bg-navy/90 text-white">
            {form.formState.isSubmitting ? "Salvando..." : "Cadastrar cliente"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="label-uppercase">{label}</Label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
