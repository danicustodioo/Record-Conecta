// Dashboard de Fornecedores e Créditos Tributários — Fase 1+2.
// Subseções A (KPIs + alerta), B (gráfico de cobertura) e C (tabela editável).

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, Legend, CartesianGrid,
} from "recharts";
import { CheckCircle2, AlertTriangle, XCircle, Pencil, Save, Plus } from "lucide-react";
import { formatBRL } from "@/lib/format";
import {
  consolidarCreditos, type CenarioCredito, type ConsolidadoCreditos,
} from "@/lib/fornecedores/creditos";
import type { FornecedorClassificado, RegimeFornecedor } from "@/lib/fornecedores/classificador";

interface Props {
  fornecedores: FornecedorClassificado[];
  receitaAnual: number;
  totalComprasAnuais: number;
  onSave?: (lista: FornecedorClassificado[]) => Promise<void> | void;
  readOnly?: boolean;
}

type FiltroRegime = "TODOS" | RegimeFornecedor;

const REGIMES: { value: string; label: string }[] = [
  { value: "NORMAL", label: "Normal" },
  { value: "SIMPLES_HIBRIDO", label: "Simples c/ Híbrido" },
  { value: "SIMPLES", label: "Simples s/ Híbrido" },
  { value: "DESCONHECIDO", label: "Desconhecido" },
];

function regimeLabel(f: FornecedorClassificado): string {
  if (f.regime === "NORMAL") return "Normal";
  if (f.regime === "SIMPLES" && f.opcao_hibrido) return "Simples c/ Híbrido";
  if (f.regime === "SIMPLES") return "Simples s/ Híbrido";
  return "Desconhecido";
}

function regimeColor(f: FornecedorClassificado): string {
  if (f.regime === "NORMAL") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (f.regime === "SIMPLES" && f.opcao_hibrido) return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (f.regime === "SIMPLES") return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function FornecedoresDashboard({ fornecedores, receitaAnual, totalComprasAnuais, onSave, readOnly = false }: Props) {
  const [edit, setEdit] = useState<FornecedorClassificado[]>(fornecedores);
  const [dirty, setDirty] = useState(false);
  const [filtro, setFiltro] = useState<FiltroRegime>("TODOS");
  const [sort, setSort] = useState<{ k: keyof FornecedorClassificado | "credito_total"; dir: "asc" | "desc" }>({ k: "valor_anual", dir: "desc" });
  const [saving, setSaving] = useState(false);

  const cons: Record<CenarioCredito, ConsolidadoCreditos> = useMemo(() => ({
    LR_2027: consolidarCreditos(edit, receitaAnual, "LR_2027"),
    HIBRIDO_2027: consolidarCreditos(edit, receitaAnual, "HIBRIDO_2027"),
    LP_2027: consolidarCreditos(edit, receitaAnual, "LP_2027"),
    SIMPLES_2027: consolidarCreditos(edit, receitaAnual, "SIMPLES_2027"),
  }), [edit, receitaAnual]);

  const main = cons.HIBRIDO_2027;

  const filteredSorted = useMemo(() => {
    let list = [...edit];
    if (filtro !== "TODOS") list = list.filter((f) => f.regime === filtro);
    list.sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      if (sort.k === "credito_total") {
        const ca = (a.valor_anual ?? 0) * 0.265;
        const cb = (b.valor_anual ?? 0) * 0.265;
        return (ca - cb) * dir;
      }
      const va = a[sort.k];
      const vb = b[sort.k];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
    });
    return list;
  }, [edit, filtro, sort]);

  function patch(idx: number, p: Partial<FornecedorClassificado>) {
    setEdit((arr) => {
      const visible = filteredSorted[idx];
      return arr.map((f) => f === visible ? { ...f, ...p, editado_manualmente: true } : f);
    });
    setDirty(true);
  }

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(edit);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  function adicionarManual() {
    const novo: FornecedorClassificado = {
      nome: "NOVO FORNECEDOR",
      valor_contabil_total: 0,
      valor_anual: 0,
      regime: "NORMAL",
      confianca: "ALTA",
      motivo_classificacao: "adicionado manualmente",
      opcao_hibrido: null,
      editado_manualmente: true,
      aliquota_das_estimada: 0.10,
    };
    setEdit((a) => [...a, novo]);
    setDirty(true);
  }

  return (
    <div className="space-y-6 mt-8">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="label-uppercase">Fornecedores e Créditos Tributários</p>
          <h2 className="font-display text-2xl text-navy mt-1">Análise de cadeia · Reforma 2027</h2>
        </div>
        {dirty && !readOnly && (
          <Button onClick={handleSave} disabled={saving} className="bg-gold text-navy hover:bg-gold/90">
            <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        )}
      </header>

      {/* Subseção A — KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total de compras anuais" value={formatBRL(totalComprasAnuais)} sub={`${edit.length} fornecedores identificados`} />
        <Kpi label="Créditos gerados (Híbrido/LR)" value={formatBRL(main.credito_total)} sub={`${main.cobertura_pct.toFixed(1)}% do IVA bruto`} accent="emerald" />
        <Kpi label="Crédito perdido (Simples s/ Híbrido)" value={formatBRL(main.credito_perdido)} sub={`${main.fornecedores_limitados} fornecedores`} accent="amber" />
        <Kpi label="IVA líquido após créditos" value={formatBRL(main.iva_liquido)} sub={receitaAnual > 0 ? `${((main.iva_liquido / receitaAnual) * 100).toFixed(1)}% da receita` : "—"} />
      </div>

      <DiagnosticoCard cons={main} />

      {/* Subseção B — Gráfico de cobertura */}
      <Card className="p-5 shadow-[var(--shadow-elegant)]">
        <h3 className="font-display text-lg text-navy">Cobertura do IVA por cenário</h3>
        <p className="text-xs text-muted-foreground">Quanto do imposto bruto é absorvido por créditos de fornecedores em cada regime.</p>
        <div className="h-72 mt-4">
          <ResponsiveContainer>
            <BarChart
              layout="vertical"
              data={[
                { name: "LR 2027", coberto: cons.LR_2027.credito_total, restante: cons.LR_2027.iva_liquido },
                { name: "Híbrido 2027", coberto: cons.HIBRIDO_2027.credito_total, restante: cons.HIBRIDO_2027.iva_liquido },
                { name: "Simples Trad.", coberto: cons.SIMPLES_2027.credito_total, restante: cons.SIMPLES_2027.iva_liquido },
                { name: "LP 2027", coberto: cons.LP_2027.credito_total, restante: cons.LP_2027.iva_liquido },
              ]}
              margin={{ left: 16, right: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(v) => formatBRL(Number(v))} />
              <YAxis type="category" dataKey="name" width={100} />
              <RTooltip formatter={(v: number) => formatBRL(v)} />
              <Legend />
              <Bar dataKey="coberto" stackId="a" fill="hsl(142 71% 45%)" name="Coberto por crédito" />
              <Bar dataKey="restante" stackId="a" fill="hsl(0 72% 51%)" name="IVA a pagar" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs mt-3 text-muted-foreground">
          <span>LR: {cons.LR_2027.cobertura_pct.toFixed(1)}%</span>
          <span>Híbrido: {cons.HIBRIDO_2027.cobertura_pct.toFixed(1)}%</span>
          <span>Simples: {cons.SIMPLES_2027.cobertura_pct.toFixed(1)}%</span>
          <span>LP: 0%</span>
        </div>
      </Card>

      {/* Subseção C — Tabela */}
      <Card className="p-5 shadow-[var(--shadow-elegant)]">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="font-display text-lg text-navy">Fornecedores</h3>
            <p className="text-xs text-muted-foreground">Edite o regime e a opção pelo Híbrido para refinar o cálculo.</p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={filtro} onValueChange={(v) => setFiltro(v as FiltroRegime)}>
              <TabsList className="h-8">
                <TabsTrigger value="TODOS" className="text-xs h-6 px-2">Todos</TabsTrigger>
                <TabsTrigger value="NORMAL" className="text-xs h-6 px-2">Normal</TabsTrigger>
                <TabsTrigger value="SIMPLES" className="text-xs h-6 px-2">Simples</TabsTrigger>
                <TabsTrigger value="DESCONHECIDO" className="text-xs h-6 px-2">?</TabsTrigger>
              </TabsList>
            </Tabs>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={adicionarManual}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <Th onClick={() => setSort((s) => ({ k: "nome", dir: s.k === "nome" && s.dir === "asc" ? "desc" : "asc" }))}>Fornecedor</Th>
                <Th>Regime</Th>
                <Th>Confiança</Th>
                <Th onClick={() => setSort((s) => ({ k: "valor_anual", dir: s.k === "valor_anual" && s.dir === "desc" ? "asc" : "desc" }))} className="text-right">Compras/ano</Th>
                <Th className="text-right">CBS</Th>
                <Th className="text-right">IBS</Th>
                <Th onClick={() => setSort((s) => ({ k: "credito_total", dir: s.k === "credito_total" && s.dir === "desc" ? "asc" : "desc" }))} className="text-right">Crédito total</Th>
                <Th className="text-right">% total</Th>
                <Th className="text-right">Editar</Th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((f, idx) => {
                const c = (f.valor_anual ?? 0) * 0.265;
                const cbs = (f.valor_anual ?? 0) * 0.088;
                const ibs = (f.valor_anual ?? 0) * 0.177;
                const cred = (f.regime === "NORMAL" || (f.regime === "SIMPLES" && f.opcao_hibrido)) ? c : f.regime === "SIMPLES" ? (f.valor_anual ?? 0) * 0.059 : 0;
                const pct = main.credito_total > 0 ? (cred / main.credito_total) * 100 : 0;
                return (
                  <tr key={`${f.nome}-${idx}`} className="border-b hover:bg-off-white/40">
                    <td className="py-2 pr-2 font-medium text-navy" title={f.motivo_classificacao}>{f.nome}</td>
                    <td className="py-2 pr-2">
                      <Select
                        value={f.regime === "SIMPLES" && f.opcao_hibrido ? "SIMPLES_HIBRIDO" : f.regime}
                        onValueChange={(v) => {
                          if (v === "SIMPLES_HIBRIDO") patch(idx, { regime: "SIMPLES", opcao_hibrido: true });
                          else if (v === "SIMPLES") patch(idx, { regime: "SIMPLES", opcao_hibrido: false });
                          else patch(idx, { regime: v as RegimeFornecedor, opcao_hibrido: null });
                        }}
                      >
                        <SelectTrigger className={`h-7 text-xs w-[150px] border ${regimeColor(f)}`}>
                          <SelectValue>{regimeLabel(f)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {REGIMES.map((r) => <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 pr-2">
                      <Badge variant="outline" className={
                        f.confianca === "ALTA" ? "border-blue-300 text-blue-800" :
                        f.confianca === "MEDIA" ? "border-slate-300 text-slate-700" :
                        "border-rose-300 text-rose-700"
                      }>{f.confianca}</Badge>
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <Input
                        type="number" className="h-7 text-xs text-right w-32 ml-auto"
                        value={Math.round(f.valor_anual ?? 0)}
                        onChange={(e) => patch(idx, { valor_anual: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatBRL(cbs)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatBRL(ibs)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums font-medium">{formatBRL(cred)}</td>
                    <td className="py-2 pr-2 text-right text-muted-foreground">{pct.toFixed(1)}%</td>
                    <td className="py-2 text-right text-muted-foreground"><Pencil className="h-3.5 w-3.5 inline" /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 sticky bottom-0 bg-white">
              <tr className="font-medium">
                <td className="py-2 pr-2">Total</td>
                <td colSpan={2} />
                <td className="py-2 pr-2 text-right tabular-nums">{formatBRL(totalComprasAnuais)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatBRL(main.cbs_total)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatBRL(main.ibs_total)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatBRL(main.credito_total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "emerald" | "amber" }) {
  const color = accent === "emerald" ? "text-emerald-700" : accent === "amber" ? "text-amber-700" : "text-navy";
  return (
    <Card className="p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-display mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}

function DiagnosticoCard({ cons }: { cons: ConsolidadoCreditos }) {
  if (cons.diagnostico === "FAVORAVEL") {
    return (
      <Card className="p-4 border-2 border-emerald-300 bg-emerald-50">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-700 shrink-0" />
          <div>
            <p className="font-medium text-emerald-900">Cadeia FAVORÁVEL ao Simples Híbrido / Lucro Real</p>
            <p className="text-sm text-emerald-800">Cobertura de {cons.cobertura_pct.toFixed(1)}% do IVA bruto — créditos compensam o split payment.</p>
          </div>
        </div>
      </Card>
    );
  }
  if (cons.diagnostico === "MODERADO") {
    return (
      <Card className="p-4 border-2 border-amber-300 bg-amber-50">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-700 shrink-0" />
          <div>
            <p className="font-medium text-amber-900">Créditos MODERADOS</p>
            <p className="text-sm text-amber-800">Cobertura de {cons.cobertura_pct.toFixed(1)}% — avalie folha, regime atual e %B2B antes de decidir.</p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-4 border-2 border-rose-300 bg-rose-50">
      <div className="flex items-center gap-3">
        <XCircle className="h-6 w-6 text-rose-700 shrink-0" />
        <div>
          <p className="font-medium text-rose-900">Créditos INSUFICIENTES</p>
          <p className="text-sm text-rose-800">Apenas {cons.cobertura_pct.toFixed(1)}% de cobertura — Simples Tradicional provavelmente é melhor.</p>
        </div>
      </div>
    </Card>
  );
}

function Th({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <th
      className={`py-2 pr-2 text-left font-medium ${onClick ? "cursor-pointer hover:text-navy" : ""} ${className ?? ""}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}
