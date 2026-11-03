import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { CurrencyInput } from "@/components/ui/currency-input";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { PerfilClientesEditor } from "@/components/clientes/PerfilClientesEditor";

export const Route = createFileRoute("/_authenticated/clientes/$id/editar")({
  component: EditarClientePage,
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
  tem_patrimonio_afetacao: z.enum(["sim", "nao", "indefinido"]).optional(),
  obras_afetadas: z.string().optional().or(z.literal("")),
  tem_contrato_anterior_16012025: z.boolean().optional(),
  aliquota_iss_municipal: z.coerce.number().min(0).max(10).optional(),
  perfil_clientes: z.enum(["b2b", "b2c", "misto", "indefinido"]).optional(),
  // Bloco 15A
  optou_regime_regular: z.enum(["sim", "nao", "indefinido"]).optional(),
  data_opcao_regime_regular: z.string().optional().or(z.literal("")),
  repasse_preco_confirmado: z.enum(["sim", "nao", "indefinido"]).optional(),
  pct_receita_iss_retido: z.coerce.number().min(0).max(100).optional(),
  sujeito_fator_r: z.enum(["sim", "nao", "indefinido"]).optional(),
  folha_12m: z.coerce.number().min(0).optional(),
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

function EditarClientePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente-edit", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

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

  useEffect(() => {
    if (!cliente) return;
    const extra = cliente as unknown as {
      iss_aliquota_efetiva?: number | null;
      pct_empreitada?: number | null;
      pct_creditavel?: number | null;
      base_creditavel_estimada?: number | null;
      socios_habilitados?: boolean | null;
      tem_patrimonio_afetacao?: boolean | null;
      obras_afetadas?: string | null;
      tem_contrato_anterior_16012025?: boolean | null;
      aliquota_iss_municipal?: number | null;
      perfil_clientes?: string | null;
      optou_regime_regular?: boolean | null;
      data_opcao_regime_regular?: string | null;
      repasse_preco_confirmado?: boolean | null;
      pct_receita_iss_retido?: number | null;
      sujeito_fator_r?: boolean | null;
      folha_12m?: number | null;
    };
    const tri = (v?: boolean | null) => (v == null ? "indefinido" : v ? "sim" : "nao");
    form.reset({
      razao_social: cliente.razao_social ?? "",
      nome_fantasia: cliente.nome_fantasia ?? "",
      cnpj: maskCNPJ(cliente.cnpj ?? ""),
      setor: cliente.setor ?? "",
      subsetor: cliente.subsetor ?? "",
      regime_atual: (cliente.regime_atual as FormData["regime_atual"]) ?? "SIMPLES_III",
      rbt12: Number(cliente.rbt12 ?? 0),
      num_funcionarios: cliente.num_funcionarios ?? 0,
      pct_b2b: Number(cliente.pct_b2b ?? 0),
      iss_aliquota_efetiva: extra.iss_aliquota_efetiva ?? undefined,
      pct_empreitada: extra.pct_empreitada ?? undefined,
      pct_creditavel: extra.pct_creditavel ?? undefined,
      base_creditavel_estimada: extra.base_creditavel_estimada ?? undefined,
      socios_habilitados: extra.socios_habilitados ?? false,
      tem_patrimonio_afetacao:
        extra.tem_patrimonio_afetacao == null ? "indefinido" : extra.tem_patrimonio_afetacao ? "sim" : "nao",
      obras_afetadas: extra.obras_afetadas ?? "",
      tem_contrato_anterior_16012025: extra.tem_contrato_anterior_16012025 ?? false,
      aliquota_iss_municipal: extra.aliquota_iss_municipal ?? undefined,
      perfil_clientes: (extra.perfil_clientes as "b2b" | "b2c" | "misto" | null) ?? "indefinido",
      optou_regime_regular: tri(extra.optou_regime_regular),
      data_opcao_regime_regular: extra.data_opcao_regime_regular ?? "",
      repasse_preco_confirmado: tri(extra.repasse_preco_confirmado),
      pct_receita_iss_retido:
        extra.pct_receita_iss_retido != null ? Math.round(Number(extra.pct_receita_iss_retido) * 10000) / 100 : undefined,
      sujeito_fator_r: tri(extra.sujeito_fator_r),
      folha_12m: extra.folha_12m != null ? Number(extra.folha_12m) : undefined,
      email_cliente: cliente.email_cliente ?? "",
      observacoes: cliente.observacoes ?? "",
    });
  }, [cliente]);

  const setor = form.watch("setor");
  const pct_b2b = form.watch("pct_b2b") ?? 0;

  async function onSubmit(values: FormData) {
    const { error } = await supabase
      .from("clientes")
      .update({
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
        tem_patrimonio_afetacao:
          values.tem_patrimonio_afetacao === "indefinido" || !values.tem_patrimonio_afetacao
            ? null
            : values.tem_patrimonio_afetacao === "sim",
        obras_afetadas: values.obras_afetadas || null,
        tem_contrato_anterior_16012025: values.tem_contrato_anterior_16012025 ?? false,
        aliquota_iss_municipal: values.aliquota_iss_municipal ?? null,
        perfil_clientes:
          values.perfil_clientes && values.perfil_clientes !== "indefinido" ? values.perfil_clientes : null,
        // Bloco 15A
        optou_regime_regular: triParaBool(values.optou_regime_regular),
        data_opcao_regime_regular: values.data_opcao_regime_regular || null,
        repasse_preco_confirmado: triParaBool(values.repasse_preco_confirmado),
        pct_receita_iss_retido:
          values.pct_receita_iss_retido != null && !Number.isNaN(values.pct_receita_iss_retido)
            ? values.pct_receita_iss_retido / 100
            : null,
        sujeito_fator_r: triParaBool(values.sujeito_fator_r),
        folha_12m: values.folha_12m && values.folha_12m > 0 ? values.folha_12m : null,
        email_cliente: values.email_cliente || null,
        observacoes: values.observacoes || null,
      } as never)
      .eq("id", id);

    if (error) {
      toast.error("Não foi possível salvar", { description: error.message });
      return;
    }
    toast.success("Cliente atualizado");
    navigate({ to: "/clientes/$id", params: { id } });
  }

  async function excluirCliente() {
    if (!confirm("Excluir este cliente e todas as análises? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("clientes").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível excluir", { description: error.message });
      return;
    }
    toast.success("Cliente excluído");
    navigate({ to: "/dashboard" });
  }

  if (isLoading || !cliente) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <button
        onClick={() => navigate({ to: "/clientes/$id", params: { id } })}
        className="text-xs text-muted-foreground hover:text-navy inline-flex items-center gap-1 mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao cliente
      </button>
      <h1 className="font-display text-3xl text-navy">Editar cliente</h1>
      <p className="text-sm text-muted-foreground mt-1">Atualize qualquer informação cadastral.</p>

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
            Em branco = sem valor padrão: o motor não assume ISS de 5% nem presunção linear de 32%.
          </p>

          {/* Bloco 14A — respostas não extraíveis de documento */}
          <div className="grid gap-4 md:grid-cols-2 pt-2">
            <Field label="Patrimônio de afetação averbado">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                {...form.register("tem_patrimonio_afetacao")}
              >
                <option value="indefinido">Não informado</option>
                <option value="sim">Sim, há afetação averbada</option>
                <option value="nao">Não há afetação</option>
              </select>
            </Field>
            <Field label="Obras afetadas">
              <Input {...form.register("obras_afetadas")} placeholder="Ex.: Matrícula 12.345 — Residencial X" />
            </Field>
            <Field label="Alíquota de ISS do município (%)">
              <Input type="number" step="0.01" {...form.register("aliquota_iss_municipal")} placeholder="Ex.: 3" />
            </Field>
            <Field label="Perfil dos clientes">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                {...form.register("perfil_clientes")}
              >
                <option value="indefinido">Não informado</option>
                <option value="b2b">Predominantemente B2B</option>
                <option value="b2c">Predominantemente B2C</option>
                <option value="misto">Misto</option>
              </select>
            </Field>
          </div>
          <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input type="checkbox" className="mt-0.5" {...form.register("tem_contrato_anterior_16012025")} />
            <span>
              <span className="font-medium">Há contratos firmados até 16/01/2025</span>
              <span className="block text-xs text-muted-foreground">
                Contratos anteriores à publicação da LC 214/2025 têm regra de transição própria (arts. 487 a 490).
              </span>
            </span>
          </label>


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

        {/* Bloco 15A — Simples em 2027: dados da decisão (adição) */}
        <Card className="p-6 space-y-5">
          <div>
            <p className="label-uppercase">Simples Nacional em 2027 — dados da decisão</p>
            <p className="text-xs text-muted-foreground mt-1">
              Usados no Fator R, no crédito transferido e na regra de recomendação do regime regular de IBS/CBS.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Optou pelo regime regular de IBS/CBS para 2027?">
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...form.register("optou_regime_regular")}>
                <option value="indefinido">Não informado</option>
                <option value="sim">Sim, optou</option>
                <option value="nao">Não optou</option>
              </select>
            </Field>
            <Field label="Data da opção">
              <Input type="date" {...form.register("data_opcao_regime_regular")} />
            </Field>
            <Field label="Repasse de preço confirmado (contratos renegociáveis até 31/12/2026)">
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...form.register("repasse_preco_confirmado")}>
                <option value="indefinido">Não informado</option>
                <option value="sim">Sim, repasse viável</option>
                <option value="nao">Não</option>
              </select>
            </Field>
            <Field label="% da receita com ISS retido pelo tomador" error={form.formState.errors.pct_receita_iss_retido?.message}>
              <Input type="number" step="0.01" min="0" max="100" placeholder="ex.: 33,65" {...form.register("pct_receita_iss_retido")} />
            </Field>
            <Field label="Atividade sujeita ao Fator R (Anexo III ou V)?">
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...form.register("sujeito_fator_r")}>
                <option value="indefinido">Não informado (aplicar se Anexo III/V)</option>
                <option value="sim">Sim</option>
                <option value="nao">Não — anexo fixo</option>
              </select>
            </Field>
            <Field label="Folha 12 meses para o Fator R (R$)">
              <Controller
                control={form.control}
                name="folha_12m"
                render={({ field }) => (
                  <CurrencyInput value={Number(field.value ?? 0)} onChange={field.onChange} placeholder="0,00" />
                )}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Folha 12 meses: salários, pró-labore, 13º, FGTS e encargos. Em branco, o motor usa a folha extraída da análise.
          </p>
          <div className="pt-2 border-t">
            <PerfilClientesEditor clienteId={id} />
          </div>
        </Card>

        <div className="flex justify-between items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={excluirCliente}
            className="text-danger border-danger/40 hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4 mr-2" /> Excluir cliente
          </Button>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/clientes/$id", params: { id } })}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting} className="bg-navy hover:bg-navy/90 text-white">
              {form.formState.isSubmitting ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function triParaBool(v?: "sim" | "nao" | "indefinido"): boolean | null {
  return v === "sim" ? true : v === "nao" ? false : null;
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
