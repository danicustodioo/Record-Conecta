// Dashboard interativo completo de uma análise.
// Renderiza todas as seções 1-8 quando `resultados_calculo` está preenchido.

import { motion } from "framer-motion";
import { CBS_2027_PADRAO, IBS_2027_PADRAO, rodapeAliquota } from "@/lib/tax-engine/parametros";
import { resumirFolha } from "@/lib/folha-normalize";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { formatBRL, formatCNPJ, formatPct, formatDate } from "@/lib/format";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { DiagnosticoIACard } from "./DiagnosticoIACard";
import type { DiagnosticoIA } from "@/lib/diagnostico-ia.functions";
import { RODAPE_CBS } from "@/lib/enquadramento";
import { DecisaoSimplesCard, FatorRCard, type DecisaoSimplesView, type FatorRView } from "./DecisaoSimplesCard";
import type { ParametrosReforma } from "@/lib/tax-engine/parametros";


type RegimeKey = "SIMPLES" | "SIMPLES_2027" | "HIBRIDO" | "LP" | "LR" | "LP_2026" | "LP_2027" | "LR_2026" | "LR_2027";
type Cenario = {
  regime: RegimeKey;
  ano?: 2026 | 2027;
  elegivel?: boolean;
  motivo_inelegibilidade?: string;
  base_legal_inelegibilidade?: string;
  carga_total: number;
  carga_pct: number;
  lucro_liquido: number;
  fgts_anual: number;
  cpp_anual?: number;
  encargos_folha?: number;
  carga_total_com_folha?: number;
  detalhamento: Record<string, number>;
  observacoes?: string[];
};
type LinhaCBSView = {
  tipo_receita: string;
  descricao: string;
  descricao_livre?: string | null;
  base: number;
  reducao: number;
  aliquota_efetiva: number;
  cbs: number;
  artigo: string;
  monofasico: boolean;
  gera_credito_adquirente: boolean;
  reducao_negada_societaria: boolean;
};
type Resultados = {
  recomendado: RegimeKey;
  economia_anual: number;
  cenarios: Cenario[];
  ranking: Cenario[];
  inelegiveis?: Cenario[];
  receita_anual?: number;
  meses_dre?: number;
  fator_anualizacao?: number;
  premissas?: Record<string, number | string | boolean>;
  alertas?: string[];
  cbs_detalhe?: LinhaCBSView[];
  cbs_aliquota_base?: number;
  cbs_aliquota_media_efetiva?: number;
  socios_habilitados?: boolean | null;
  versao_engine?: string;
  data_base_calculo?: string;
  saldo_credor_cbs?: number;
  // Bloco 15A
  parametros_reforma?: ParametrosReforma;
  simples_decisao?: DecisaoSimplesView;
  fator_r?: FatorRView;
  anexo_utilizado?: string;
  rbt12_utilizada?: number;
  rbt12_fonte?: "CADASTRO" | "DRE_ANUALIZADA";
};

type Cliente = {
  razao_social: string;
  cnpj: string;
  setor: string;
  subsetor: string | null;
  regime_atual: string;
  rbt12: number;
  pct_b2b: number | null;
  pct_b2c: number | null;
  num_funcionarios: number | null;
};
type Analise = {
  id: string;
  status: string;
  created_at: string;
  recomendacao_regime: string | null;
  resultados_calculo: Resultados;
  dados_dre: Record<string, number | string | null> | null;
  dados_balanco: Record<string, unknown> | null;
  dados_folha: { competencias?: Array<Record<string, number | string | null>> } | null;
  dados_fornecedores: { fornecedores?: Array<Record<string, number | string | null>> } | null;
  diagnostico_ia?: DiagnosticoIA | null;
  aliquota_cbs_utilizada?: number | null;
  data_base_calculo?: string | null;
  versao_engine?: string | null;
  conferido_por?: string | null;
  saldo_credor_cbs?: number | null;
};

const REGIME_LABEL: Record<RegimeKey, string> = {
  SIMPLES: "Simples Nacional",
  SIMPLES_2027: "Simples unificado 2027",
  HIBRIDO: "Simples + regime regular IBS/CBS",
  LP: "Lucro Presumido",
  LR: "Lucro Real",
  LP_2026: "Lucro Presumido 2026",
  LP_2027: "Lucro Presumido 2027",
  LR_2026: "Lucro Real 2026",
  LR_2027: "Lucro Real 2027",
};
const REGIME_COLOR: Record<RegimeKey, string> = {
  SIMPLES: "#1E6E4A",
  SIMPLES_2027: "#2F8F63",
  HIBRIDO: "#BA7517",
  LP: "#993C1D",
  LR: "#185FA5",
  LP_2026: "#993C1D",
  LP_2027: "#C0562C",
  LR_2026: "#185FA5",
  LR_2027: "#2A86D6",
};
const label = (r: RegimeKey) => REGIME_LABEL[r] ?? String(r);

// Bloco 15A: fim da janela de cancelamento das opções (Res. CGSN 194/2026).
function diasAteOpcao(): number {
  const alvo = new Date("2026-12-20T23:59:59-03:00").getTime();
  const diff = alvo - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function AnalysisDashboard({
  analise,
  cliente,
}: {
  analise: Analise;
  cliente: Cliente;
}) {
  const r = analise.resultados_calculo;
  if (!r || !r.cenarios?.length) return null;

  const elegiveis = r.cenarios.filter((c) => c.elegivel !== false && c.carga_total > 0);
  const inelegiveis = r.cenarios.filter((c) => c.elegivel === false);
  const ordenados = [...elegiveis].sort((a, b) => a.carga_total - b.carga_total);
  const recomendado = elegiveis.find((c) => c.regime === r.recomendado) ?? ordenados[0] ?? r.cenarios[0];
  const pior = ordenados[ordenados.length - 1] ?? recomendado;
  const receita = Number(r.receita_anual ?? cliente.rbt12 ?? 0);
  const economia = Math.max(0, pior.carga_total - recomendado.carga_total);
  const cargaAtualPct = recomendado.carga_pct;

  const dre = (analise.dados_dre ?? {}) as Record<string, number | null>;
  const folha = analise.dados_folha?.competencias ?? [];
  const fornecedores = analise.dados_fornecedores?.fornecedores ?? [];


  return (
    <div id="diagnostico-export" className="space-y-6 mt-8">
      {/* SEÇÃO 0 — Banner de prazo + status (não exportar) */}
      <div data-export-skip="true">
        <PrazoBanner status={analise.status} />
      </div>

      {/* SEÇÃO 1 — Identidade + KPIs */}
      <Card className="p-6 bg-navy text-white shadow-[var(--shadow-elevated)]" data-export-title="Panorama do cliente e indicadores-chave">
        <div className="grid md:grid-cols-2 gap-4 items-end">
          <div>
            <p className="text-xs uppercase tracking-widest text-gold/80">Diagnóstico tributário</p>
            <h2 className="font-display text-3xl mt-1">{cliente.razao_social}</h2>
            <p className="text-xs text-white/70 mt-1">{formatCNPJ(cliente.cnpj)} · {cliente.setor}{cliente.subsetor ? ` · ${cliente.subsetor}` : ""}</p>
            <p className="text-xs text-white/70 mt-0.5">Regime atual: <span className="text-gold">{cliente.regime_atual}</span></p>
          </div>
          <div className="text-right text-xs text-white/70">
            <p>Análise emitida em <strong className="text-white">{formatDate(analise.created_at)}</strong></p>
            <p className="mt-1">Receita anual de referência: <strong className="text-gold num-display">{formatBRL(receita)}</strong></p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <KPI label="Receita bruta anualizada" value={formatBRL(receita)} />
          <KPI label={`Carga ${label(recomendado.regime)}`} value={formatBRL(recomendado.carga_total)} accent />
          <KPI label="% sobre receita" value={formatPct(cargaAtualPct)} />
          <KPI label="Lucro líquido estimado" value={formatBRL(recomendado.lucro_liquido)} />
        </div>
        {/* Bloco 14B — cabeçalho técnico do cálculo */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-white/15 pt-4 text-[11px] text-white/70">
          <div>
            <span className="block uppercase tracking-widest text-gold/70">Data-base do cálculo</span>
            <strong className="text-white">
              {formatDate(analise.data_base_calculo ?? r.data_base_calculo ?? analise.created_at)}
            </strong>
          </div>
          <div>
            <span className="block uppercase tracking-widest text-gold/70">Alíquota CBS utilizada</span>
            <strong className="text-white">
              {formatPct(
                Number(analise.aliquota_cbs_utilizada ?? r.cbs_aliquota_media_efetiva ?? CBS_2027_PADRAO),
              )}{" "}
              <span className="text-white/50">(base {formatPct(r.cbs_aliquota_base ?? CBS_2027_PADRAO)})</span>
            </strong>
          </div>
          <div>
            <span className="block uppercase tracking-widest text-gold/70">Versão da engine</span>
            <strong className="text-white">{analise.versao_engine ?? r.versao_engine ?? "v14"}</strong>
          </div>
          <div>
            <span className="block uppercase tracking-widest text-gold/70">Documentos conferidos por</span>
            <strong className="text-white">{analise.conferido_por ?? "Não registrado"}</strong>
          </div>
        </div>
        {r.meses_dre && r.meses_dre < 12 && (
          <p className="text-[10px] text-white/60 mt-3">
            DRE cobre {r.meses_dre} {r.meses_dre === 1 ? "mês" : "meses"} — valores anualizados pelo fator {(12 / r.meses_dre).toFixed(2)}×.
          </p>
        )}
      </Card>

      {/* SEÇÃO 1.5 — Regimes legalmente inaplicáveis */}
      {inelegiveis.length > 0 && (
        <div data-export-title="Regimes legalmente inaplicáveis">
          <RegimesInelegiveis cenarios={inelegiveis} />
        </div>
      )}

      {/* SEÇÃO 2 — Veredito */}
      <div data-export-title="Veredito — regime recomendado">
        <Veredito recomendado={recomendado} pior={pior} cliente={cliente} economia={economia} receita={receita} />
      </div>

      {/* SEÇÃO 2.3 — Resumo executivo (3 parágrafos) */}
      <div data-export-title="Resumo executivo">
        <ResumoExecutivo recomendado={recomendado} pior={pior} cliente={cliente} economia={economia} receita={receita} inelegiveis={inelegiveis} />
      </div>

      {/* SEÇÃO 2.5 — Diagnóstico IA (Gemini 2.5 Pro) */}
      <div data-export-title="Diagnóstico inteligente — forças, alertas e soluções">
        <DiagnosticoIACard analiseId={analise.id} diagnosticoInicial={analise.diagnostico_ia ?? null} />
      </div>

      {/* SEÇÃO 3A — Tabela comparativa */}
      <div data-export-title="Comparativo de regimes tributários">
        <TabelaComparativa cenarios={elegiveis} recomendado={recomendado.regime} pior={pior.regime} receita={receita} />
      </div>

      {/* Bloco 15A — Fator R e decisão do Simples em 2027 (adição) */}
      {r.fator_r && (
        <div data-export-title="Fator R e anexo do Simples">
          <FatorRCard fator={r.fator_r} anexoCadastro={r.premissas?.anexo as string | undefined} />
        </div>
      )}
      {r.simples_decisao && (
        <div data-export-title="Simples em 2027 — crédito transferido e preço de equilíbrio">
          <DecisaoSimplesCard d={r.simples_decisao} />
        </div>
      )}

      {/* SEÇÃO 3A.2 — Composição da CBS por linha de receita (Bloco 14) */}
      {r.cbs_detalhe && r.cbs_detalhe.length > 0 && (
        <div data-export-title="Composição da CBS por linha de receita">
          <ComposicaoCBS
            linhas={r.cbs_detalhe}
            aliquotaBase={r.cbs_aliquota_base ?? CBS_2027_PADRAO}
            aliquotaMedia={r.cbs_aliquota_media_efetiva ?? CBS_2027_PADRAO}
            saldoCredor={Number(analise.saldo_credor_cbs ?? r.saldo_credor_cbs ?? 0)}
          />
        </div>
      )}

      {/* SEÇÃO 3A.3 — Alertas de enquadramento */}
      {r.alertas && r.alertas.length > 0 && (
        <div data-export-title="Alertas de enquadramento e premissas">
          <AlertasEnquadramento alertas={r.alertas} />
        </div>
      )}



      {/* SEÇÃO 3A.5 — Impacto financeiro contextualizado */}
      <div data-export-title="Impacto financeiro em perspectiva">
        <ImpactoFinanceiro cenarios={elegiveis} recomendado={recomendado.regime} receita={receita} />
      </div>

      {/* SEÇÃO 3B — Gráfico de barras 2026 vs 2027 */}
      <div data-export-title="Carga tributária 2026 vs 2027">
        <GraficoComparativo cenarios={elegiveis} cargaAtual={recomendado.carga_total} />
      </div>

      {/* SEÇÃO 3C — Pizza composição do recomendado */}
      <div data-export-title="Composição da carga no regime recomendado">
        <ComposicaoDonut cenario={recomendado} />
      </div>

      {/* SEÇÃO 4 — Cards detalhados por regime */}
      <div className="grid md:grid-cols-2 gap-4" data-export-title="Detalhamento por regime">
        {[...elegiveis, ...inelegiveis].map((c) => (
          <RegimeCard
            key={c.regime}
            cenario={c}
            recomendado={c.regime === recomendado.regime}
            cliente={cliente}
            receita={receita}
          />
        ))}
      </div>

      {/* SEÇÃO 5 — Análise financeira */}
      <div data-export-title="DRE consolidada do período">
        <DREResumo dre={dre} />
      </div>
      {fornecedores.length > 0 && (
        <div data-export-title="Fornecedores e créditos de IBS/CBS">
          <FornecedoresResumo fornecedores={fornecedores} />
        </div>
      )}
      {folha.length > 0 && (
        <div data-export-title="Folha de pagamento e encargos">
          <FolhaResumo competencias={folha} />
        </div>
      )}

      {/* SEÇÃO 6 — Projeção */}
      <div data-export-title="Projeção plurianual da carga">
        <Projecao cenarios={elegiveis} />
      </div>

      {/* SEÇÃO 6.5 — Linha do tempo da Reforma */}
      <div data-export-title="Linha do tempo da Reforma Tributária (2026-2033)">
        <LinhaTempoReforma recomendado={recomendado.regime} cliente={cliente} />
      </div>

      {/* SEÇÃO 7 — Plano de ação */}
      <div data-export-title="Plano de ação recomendado">
        <PlanoAcao recomendado={r.recomendado} cliente={cliente} />
      </div>

      {/* SEÇÃO 8 — Aviso legal */}
      <Card className="p-5 bg-muted/40 text-xs text-muted-foreground" data-export-title="Aviso legal">
        <p>{r.parametros_reforma ? rodapeAliquota(r.parametros_reforma) : RODAPE_CBS}</p>
        <p className="mt-2">
          <strong>Aviso Legal:</strong> Os valores são estimativas baseadas nas alíquotas de referência da
          LC 214/2025 (IBS: 17,7%) e nas tabelas do Simples Nacional vigentes. Alíquotas
          definitivas do IBS serão fixadas pelo Comitê Gestor após deliberação do Senado e podem variar.
          Este relatório tem caráter informativo e não substitui o assessoramento contábil individualizado
          da Record Assessoria Contábil Ltda. CRC PR-013833 · José A. Custódio. Emitido em {formatDate(analise.created_at)}
          {r.versao_engine ? ` · motor ${r.versao_engine}` : ""}.
        </p>
      </Card>
    </div>
  );
}

// ─────────────────────────── Subcomponentes ───────────────────────────

function ComposicaoCBS({
  linhas,
  aliquotaBase,
  aliquotaMedia,
  saldoCredor = 0,
}: {
  linhas: LinhaCBSView[];
  aliquotaBase: number;
  aliquotaMedia: number;
  saldoCredor?: number;
}) {
  const totalBase = linhas.reduce((a, l) => a + l.base, 0);
  const totalCBS = linhas.reduce((a, l) => a + l.cbs, 0);
  const economia = totalBase * aliquotaBase - totalCBS;

  return (
    <Card className="p-6">
      <h3 className="font-display text-xl text-navy">Composição da CBS por linha de receita</h3>
      <p className="text-xs text-muted-foreground mt-1">
        A alíquota da CBS decorre do tipo de receita, não do regime tributário. Alíquota base de{" "}
        {formatPct(aliquotaBase)} · alíquota média efetiva desta empresa{" "}
        <strong className="text-navy">{formatPct(aliquotaMedia)}</strong>.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-navy/5 text-navy">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Linha de receita</th>
              <th className="text-right px-3 py-2 font-medium">Base anual</th>
              <th className="text-right px-3 py-2 font-medium">Redução</th>
              <th className="text-right px-3 py-2 font-medium">Alíquota efetiva</th>
              <th className="text-right px-3 py-2 font-medium">CBS</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, idx) => (
              <motion.tr
                key={`${l.tipo_receita}-${idx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                className="border-t border-navy/5"
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-navy">{l.descricao}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {l.descricao_livre ? `${l.descricao_livre} · ` : ""}
                    {l.artigo}
                    {!l.gera_credito_adquirente && !l.monofasico ? " · sem crédito ao adquirente" : ""}
                  </div>
                </td>
                <td className="px-3 py-2 text-right num-display">{formatBRL(l.base)}</td>
                <td className="px-3 py-2 text-right">
                  {l.monofasico ? "Monofásico" : formatPct(l.reducao)}
                  {l.reducao_negada_societaria ? " (negada)" : ""}
                </td>
                <td className="px-3 py-2 text-right">{formatPct(l.aliquota_efetiva)}</td>
                <td className="px-3 py-2 text-right num-display font-medium text-navy">{formatBRL(l.cbs)}</td>
              </motion.tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-navy/15 bg-navy/[0.03] font-semibold text-navy">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right num-display">{formatBRL(totalBase)}</td>
              <td />
              <td className="px-3 py-2 text-right">{formatPct(aliquotaMedia)}</td>
              <td className="px-3 py-2 text-right num-display">{formatBRL(totalCBS)}</td>
            </tr>
            {saldoCredor > 0 && (
              <tr className="border-t border-navy/10 bg-amber-50 text-amber-900">
                <td className="px-3 py-2" colSpan={4}>
                  <span className="font-medium">Saldo credor de CBS acumulado</span>
                  <span className="block text-[11px]">
                    O crédito das entradas supera o débito reduzido das saídas. O saldo não é zerado: fica
                    acumulado para compensação futura e impacta o fluxo de caixa.
                  </span>
                </td>
                <td className="px-3 py-2 text-right num-display font-semibold">{formatBRL(saldoCredor)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {economia > 1 && (
        <p className="mt-3 text-xs rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-2">
          Os regimes específicos e diferenciados da LC 214/2025 reduzem a CBS em{" "}
          <strong>{formatBRL(economia)}</strong> por ano em relação à aplicação da alíquota cheia sobre
          toda a receita.
        </p>
      )}
    </Card>
  );
}

function AlertasEnquadramento({ alertas }: { alertas: string[] }) {
  return (
    <Card className="p-6">
      <h3 className="font-display text-xl text-navy flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600" /> Alertas de enquadramento e premissas
      </h3>
      <ul className="mt-3 space-y-2">
        {alertas.map((a, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
          >
            {a}
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}


function PrazoBanner({ status }: { status: string }) {
  const dias = diasAteOpcao();
  return (
    <div className="space-y-2">
      <div className="bg-navy text-white p-3 rounded-md flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-gold" />
          <span>Janela de <strong>cancelamento das opções</strong> (regime regular de IBS/CBS): 03/11 a 20/12/2026 — irretratável para jan a jun/2027</span>
        </div>
        <span className="text-gold font-display text-lg">{dias} dias restantes</span>
      </div>
      {status === "CONCLUIDO" && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-2.5 rounded-md text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Análise concluída
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`p-3 rounded-md ${accent ? "bg-gold/15 border border-gold/40" : "bg-white/5"}`}
    >
      <p className="text-[10px] uppercase tracking-widest text-white/60">{label}</p>
      <p className={`num-display text-xl mt-1 ${accent ? "text-gold" : "text-white"}`}>{value}</p>
    </motion.div>
  );
}

function RegimesInelegiveis({ cenarios }: { cenarios: Cenario[] }) {
  return (
    <Card className="p-6 border-2 border-rose-300 bg-rose-50">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-rose-700" />
        <h3 className="font-display text-lg text-rose-900">Regimes legalmente inaplicáveis a esta empresa</h3>
      </div>
      <ul className="mt-3 space-y-3 text-sm text-rose-900/90">
        {cenarios.map((c) => (
          <li key={c.regime}>
            <p className="font-semibold">{label(c.regime)} — NÃO APLICÁVEL</p>
            <p className="text-xs mt-0.5">{c.motivo_inelegibilidade ?? "Requisitos legais não atendidos."}</p>
            {c.base_legal_inelegibilidade && (
              <p className="text-[10px] mt-0.5 opacity-70">Base legal: {c.base_legal_inelegibilidade}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-rose-900/70 mt-4">
        Estes regimes foram excluídos da comparação e da recomendação — nenhuma simulação de carga foi considerada para eles.
      </p>
    </Card>
  );
}

function isLR(r: RegimeKey) {
  return r === "LR" || r === "LR_2026" || r === "LR_2027";
}
function isLP(r: RegimeKey) {
  return r === "LP" || r === "LP_2026" || r === "LP_2027";
}

function Veredito({
  recomendado,
  pior,
  cliente,
  economia,
  receita,
}: {
  recomendado: Cenario;
  pior: Cenario;
  cliente: Cliente;
  economia: number;
  receita: number;
}) {
  const argumentos = gerarArgumentosFallback(recomendado, pior, cliente, receita);
  return (
    <Card className="p-8 bg-navy text-white border-2 border-gold shadow-[var(--shadow-elevated)]">
      <p className="text-[10px] uppercase tracking-widest text-gold">Veredito Final</p>
      <h2 className="font-display text-4xl text-gold mt-2">{label(recomendado.regime)}</h2>
      <p className="text-sm text-white/80 mt-1">é a melhor escolha para {cliente.razao_social}</p>

      <div className="mt-6 grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase text-white/60 mb-2">Por que este regime</p>
          <ul className="space-y-2 text-sm">
            {argumentos.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gold">→</span>
                <span className="text-white/90">{a}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white/5 rounded-md p-4">
          <p className="text-xs uppercase text-white/60">Economia anual vs. pior cenário elegível</p>
          <p className="num-display text-3xl text-gold mt-1">{formatBRL(economia)}</p>
          <p className="text-xs text-white/60 mt-1">
            {pior.carga_total > 0 ? formatPct(economia / pior.carga_total) : "—"} menos tributos que {label(pior.regime)}
          </p>
          <hr className="border-white/10 my-3" />
          <p className="text-xs uppercase text-white/60">Prazo de ação</p>
          <p className="text-sm text-white mt-1">
            {recomendado.regime === "HIBRIDO"
              ? "Manter a opção pelo regime regular — cancelamento possível só até 20/12/2026"
              : cliente.regime_atual?.toUpperCase().includes(isLR(recomendado.regime) ? "REAL" : "PRESUMIDO")
                ? "Mantém regime atual — foco em créditos e compliance da CBS"
                : "Migração de regime: formalizar no início do ano-calendário"}
          </p>
        </div>
      </div>
    </Card>
  );
}

function gerarArgumentosFallback(rec: Cenario, pior: Cenario, cli: Cliente, receita: number): string[] {
  const arg: string[] = [];
  arg.push(`Carga tributária de ${formatBRL(rec.carga_total)} (${formatPct(rec.carga_pct)} da receita anualizada de ${formatBRL(receita)}) — a menor entre os regimes legalmente aplicáveis.`);
  if (pior.regime !== rec.regime) {
    arg.push(`${formatBRL(pior.carga_total - rec.carga_total)} de economia anual em comparação ao ${label(pior.regime)}.`);
  }
  if (rec.regime === "SIMPLES") {
    arg.push("CPP embutido no DAS — sem custo patronal adicional sobre folha (exceto Anexo IV).");
    arg.push("Menor complexidade fiscal: guia única (DAS) com vencimento mensal.");
  } else if (rec.regime === "HIBRIDO") {
    arg.push(`Cliente PJ do regime regular passa a se creditar da alíquota cheia de IBS/CBS (${cli.pct_b2b ?? 0}% da receita em B2B).`);
    arg.push("DAS reduzido (sem CBS e IBS) + IBS/CBS apurados no regime regular, com crédito sobre compras (LC 214/2025, art. 41, §3º).");
  } else if (isLR(rec.regime)) {
    const lair = rec.detalhamento.lair ?? 0;
    arg.push(
      lair <= 0
        ? `LAIR de ${formatBRL(lair)} zera IRPJ e CSLL e gera prejuízo fiscal compensável nos próximos exercícios.`
        : "IRPJ/CSLL calculados sobre o lucro efetivo — vantajoso em margens enxutas.",
    );
    arg.push(
      rec.regime === "LR_2027"
        ? "Crédito amplo de CBS sobre compras a partir de 2027 reduz o tributo líquido sobre consumo."
        : "Crédito amplo de PIS/Cofins (9,25%) sobre compras reduz o tributo líquido sobre consumo.",
    );
  } else if (isLP(rec.regime)) {
    arg.push("Base presumida fixa garante previsibilidade fiscal mês a mês.");
    arg.push("Compliance mais leve que o Lucro Real, sem apuração de lucro contábil ajustado.");
  }
  const encargos = rec.encargos_folha ?? rec.fgts_anual;
  arg.push(`Encargos sobre folha de ${formatBRL(encargos)}/ano (CPP + FGTS) considerados à parte da carga tributária.`);
  return arg.slice(0, 5);
}


function TabelaComparativa({
  cenarios,
  recomendado,
  pior,
  receita,
}: {
  cenarios: Cenario[];
  recomendado: string;
  pior: string;
  receita: number;
}) {
  const linhas: Array<{ label: string; pegar: (c: Cenario) => number | string }> = [
    { label: "Tributos federais (IRPJ + CSLL)", pegar: (c) => (c.detalhamento.irpj ?? 0) + (c.detalhamento.csll ?? 0) },
    { label: "PIS / Cofins", pegar: (c) => c.detalhamento.pis_cofins_liquido ?? c.detalhamento.pis_cofins_cumulativo ?? (c.detalhamento.pis ?? 0) + (c.detalhamento.cofins ?? 0) },
    { label: "CBS / IBS", pegar: (c) => (c.detalhamento.cbs_liquido ?? 0) + (c.detalhamento.ibs_liquido ?? 0) },
    { label: "DAS (Simples)", pegar: (c) => c.detalhamento.das_anual ?? c.detalhamento.das_reduzido ?? 0 },
    { label: "ISS", pegar: (c) => c.detalhamento.iss ?? 0 },
    { label: "TOTAL TRIBUTOS", pegar: (c) => c.carga_total },
    { label: "% sobre receita", pegar: (c) => formatPct(c.carga_pct) },
    { label: "CPP patronal (encargo)", pegar: (c) => c.cpp_anual ?? c.detalhamento.cpp ?? 0 },
    { label: "FGTS (encargo)", pegar: (c) => c.fgts_anual },
    { label: "TOTAL com encargos de folha", pegar: (c) => c.carga_total_com_folha ?? c.carga_total + (c.encargos_folha ?? 0) },
    { label: "Lucro líquido estimado", pegar: (c) => c.lucro_liquido },
    { label: "% lucro / receita", pegar: (c) => (receita > 0 ? formatPct(c.lucro_liquido / receita) : "—") },
  ];

  return (
    <Card className="p-0 overflow-hidden shadow-[var(--shadow-elegant)]">
      <div className="px-6 py-4 border-b">
        <h3 className="font-display text-xl text-navy">Comparativo dos regimes aplicáveis ({cenarios.length})</h3>
        <p className="text-xs text-muted-foreground mt-1">Valores anualizados. Coluna verde = recomendado · vermelha = pior cenário. CPP e FGTS somados separadamente.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-off-white text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Tributo</th>
              {cenarios.map((c) => (
                <th
                  key={c.regime}
                  className={`px-4 py-2.5 text-right font-medium ${c.regime === recomendado ? "bg-emerald-100 text-emerald-900" : c.regime === pior ? "bg-rose-100 text-rose-900" : ""}`}
                >
                  {label(c.regime)}
                  {c.regime === recomendado && <span className="block text-[9px] mt-0.5">✓ Recomendado</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const total = l.label.startsWith("TOTAL");
              return (
                <tr key={i} className={`border-t ${total ? "bg-navy/5 font-semibold" : ""}`}>
                  <td className="px-4 py-2.5">{l.label}</td>
                  {cenarios.map((c) => {
                    const v = l.pegar(c);
                    const fmt = typeof v === "number" ? (v > 0 ? formatBRL(v) : "—") : v;
                    return (
                      <td
                        key={c.regime}
                        className={`px-4 py-2.5 text-right tabular-nums ${c.regime === recomendado ? "bg-emerald-50" : c.regime === pior ? "bg-rose-50" : ""}`}
                      >
                        {fmt}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 text-[10px] text-muted-foreground border-t bg-off-white/50 space-y-0.5">
        <p>¹ PIS e Cofins são extintos pela LC 214/2025 a partir de jan/2027 — substituídos pela CBS ({formatPct(CBS_2027_PADRAO)} em 2027).</p>
        <p>² No Simples Nacional (exceto Anexo IV), CPP e ISS estão embutidos no DAS.</p>
        <p>³ IBS permanece em fase de teste (0,1%) em 2027 e não foi somado à carga.</p>
      </div>
    </Card>
  );
}

function GraficoComparativo({ cenarios, cargaAtual }: { cenarios: Cenario[]; cargaAtual: number }) {
  const data = cenarios.map((c) => ({
    regime: label(c.regime).replace(" ", "\n"),
    Tributos: c.carga_total,
    "Encargos de folha": c.encargos_folha ?? c.fgts_anual,
    fill: REGIME_COLOR[c.regime] ?? "#6B7280",
  }));
  return (
    <Card className="p-6 shadow-[var(--shadow-elegant)]">
      <h3 className="font-display text-xl text-navy mb-1">Carga por regime e ano-base</h3>
      <p className="text-xs text-muted-foreground mb-4">Tributos + encargos de folha por cenário. Linha tracejada = carga do regime recomendado.</p>

      <div className="h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="regime" tick={{ fontSize: 11 }} interval={0} />
            <YAxis tickFormatter={(v) => formatBRL(v)} tick={{ fontSize: 10 }} width={90} />
            <Tooltip formatter={(v: number) => formatBRL(v)} />
            <Legend />
            <ReferenceLine y={cargaAtual} stroke="#BA7517" strokeDasharray="5 5" label={{ value: "Recomendado", fill: "#BA7517", fontSize: 10, position: "right" }} />
            <Bar dataKey="Tributos" isAnimationActive>
              {data.map((d, i) => (<Cell key={i} fill={d.fill} />))}
            </Bar>
            <Bar dataKey="Encargos de folha" fillOpacity={0.45} isAnimationActive>
              {data.map((d, i) => (<Cell key={i} fill={d.fill} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function ComposicaoDonut({ cenario }: { cenario: Cenario }) {
  const COLORS = ["#0B2545", "#185FA5", "#1E6E4A", "#BA7517", "#993C1D", "#6B7280"];
  const IGNORAR = [
    "rate", "aliquota", "split", "base", "bruto", "creditos", "lair", "compras",
    "adicional", "cumulativo",
    // Saldo credor é crédito a compensar, não parcela da carga paga.
    "saldo_credor", "saldo",
    // Bloco 15A: referências e totais que não são parcelas da carga.
    "faixa", "rbt12", "p_cbs", "p_ibs", "credito_transferido", "iss_ou_ipi",
    "das_anual", "das_a_recolher", "das_cheio", "das_reduzido_a_recolher", "iss_retido", "iva_a_pagar",
  ];
  const fatias = Object.entries(cenario.detalhamento)
    .filter(([k, v]) => typeof v === "number" && v > 0 && !IGNORAR.some((t) => k.includes(t)))
    .map(([k, v]) => ({ name: k.toUpperCase().replace(/_/g, " "), value: v as number }));

  // Percentuais sempre sobre o total das fatias exibidas (soma = 100%).
  const totalFatias = fatias.reduce((a, f) => a + f.value, 0);

  return (
    <Card className="p-6 shadow-[var(--shadow-elegant)]">
      <h3 className="font-display text-xl text-navy mb-4">Composição do {label(cenario.regime)}</h3>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={fatias} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} label={(e) => `${e.name}: ${formatPct((e.value as number) / Math.max(1, totalFatias))}`}>

              {fatias.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
            </Pie>
            <Tooltip formatter={(v: number) => formatBRL(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Composição: <strong className="text-navy num-display">{formatBRL(totalFatias)}</strong> · carga total {formatBRL(cenario.carga_total)} ({formatPct(cenario.carga_pct)} da receita)
      </p>
      <p className="text-center text-[11px] text-muted-foreground mt-1">
        Percentuais calculados sobre o total das parcelas da carga. Saldo credor de CBS não integra a composição — é crédito a compensar.
      </p>

    </Card>
  );
}

function RegimeCard({
  cenario,
  recomendado,
  cliente,
  receita,
}: {
  cenario: Cenario;
  recomendado: boolean;
  cliente: Cliente;
  receita: number;
}) {
  const inapto = cenario.elegivel === false;
  const tone = inapto
    ? "bg-slate-100 border-slate-300 opacity-90"
    : recomendado
      ? "bg-emerald-50 border-emerald-300"
      : isLP(cenario.regime)
        ? "bg-rose-50 border-rose-200"
        : cenario.regime === "HIBRIDO"
          ? "bg-amber-50 border-amber-200"
          : "bg-white border-border";
  return (
    <Card className={`p-5 border-2 ${tone}`}>
      <div className="flex items-baseline justify-between">
        <h4 className="font-display text-lg text-navy">{label(cenario.regime)}</h4>
        {inapto ? (
          <span className="text-[10px] uppercase tracking-wider bg-slate-600 text-white px-2 py-0.5 rounded">Não aplicável</span>
        ) : (
          recomendado && <span className="text-[10px] uppercase tracking-wider bg-emerald-700 text-white px-2 py-0.5 rounded">Recomendado</span>
        )}
      </div>
      {inapto ? (
        <div className="mt-3 text-xs text-slate-700 space-y-1">
          <p>{cenario.motivo_inelegibilidade ?? "Requisitos legais não atendidos."}</p>
          {cenario.base_legal_inelegibilidade && <p className="opacity-70">Base legal: {cenario.base_legal_inelegibilidade}</p>}
          <p className="opacity-70">Nenhum valor é simulado para regimes inaplicáveis.</p>
        </div>
      ) : (
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Carga tributária</p>
          <p className="num-display text-lg text-navy">{formatBRL(cenario.carga_total)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">% da receita</p>
          <p className="num-display text-lg text-navy">{formatPct(cenario.carga_pct)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Lucro líquido</p>
          <p className="num-display text-base text-navy">{formatBRL(cenario.lucro_liquido)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">% lucro/receita</p>
          <p className="num-display text-base text-navy">{receita > 0 ? formatPct(cenario.lucro_liquido / receita) : "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">CPP patronal</p>
          <p className="num-display text-base text-navy">{formatBRL(cenario.cpp_anual ?? cenario.detalhamento.cpp ?? 0)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">FGTS</p>
          <p className="num-display text-base text-navy">{formatBRL(cenario.fgts_anual)}</p>
        </div>
      </div>
      )}

      {cenario.observacoes && cenario.observacoes.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
          {cenario.observacoes.map((o, i) => (
            <li key={i} className="flex gap-1.5">
              {recomendado ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />}
              <span>{o}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 pt-3 border-t text-[10px] text-muted-foreground">
        Setor {cliente.setor} · {cliente.pct_b2b ?? 0}% B2B
      </div>
    </Card>
  );
}

function DREResumo({ dre }: { dre: Record<string, number | null> }) {
  const itens: Array<[string, number | null | undefined]> = [
    ["Receita Bruta", dre.receita_bruta_total],
    ["Receita de Serviços", dre.receita_servicos],
    ["Receita de Mercadorias", dre.receita_mercadorias],
    ["(-) CMV / CSP", -((dre.cmv ?? 0) + (dre.csp ?? 0))],
    ["(-) Despesas com Pessoal", -(dre.despesas_pessoal ?? 0)],
    ["(-) Despesas Administrativas", -(dre.despesas_administrativas ?? 0)],
    ["(-) Despesas Financeiras", -(dre.despesas_financeiras ?? 0)],
    ["= Lucro Líquido", dre.lucro_liquido],
  ];
  return (
    <Card className="p-6 shadow-[var(--shadow-elegant)]">
      <h3 className="font-display text-xl text-navy mb-1">DRE — Demonstração do Resultado (valores do período)</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Valores conforme o período da DRE, sem anualização. A anualização é aplicada apenas no cálculo dos cenários.
      </p>
      <table className="w-full text-sm">
        <tbody>
          {itens.map(([label, valor], i) => {
            const total = String(label).startsWith("=");
            return (
              <tr key={i} className={`border-b ${total ? "bg-navy/5 font-semibold" : ""}`}>
                <td className="py-2 px-3">{label}</td>
                <td className="py-2 px-3 text-right tabular-nums">{formatBRL(Number(valor ?? 0))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function FornecedoresResumo({ fornecedores }: { fornecedores: Array<Record<string, number | string | null>> }) {
  const top = [...fornecedores]
    .sort((a, b) => Number(b.valor_contabil_total ?? 0) - Number(a.valor_contabil_total ?? 0))
    .slice(0, 10);
  const total = fornecedores.reduce((s, f) => s + Number(f.valor_contabil_total ?? 0), 0);
  return (
    <Card className="p-6 shadow-[var(--shadow-elegant)]">
      <h3 className="font-display text-xl text-navy mb-1">Fornecedores</h3>
      <p className="text-xs text-muted-foreground mb-4">{fornecedores.length} fornecedores · total {formatBRL(total)}</p>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="text-left py-2">Fornecedor</th><th className="text-right py-2">Valor anual</th></tr>
        </thead>
        <tbody>
          {top.map((f, i) => (
            <tr key={i} className="border-t">
              <td className="py-2 truncate max-w-[400px]">{String(f.nome_fornecedor ?? "—")}</td>
              <td className="py-2 text-right tabular-nums">{formatBRL(Number(f.valor_contabil_total ?? 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Ordena competências cronologicamente aceitando MM/AAAA, AAAA-MM e AAAA/MM. */
function ordemCompetencia(raw: string): number {
  const nums = raw.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length < 2) return 0;
  const [a, b] = nums;
  const ano = a > 12 ? a : b;
  const mes = a > 12 ? b : a;
  return ano * 12 + mes;
}

function FolhaResumo({ competencias }: { competencias: Array<Record<string, number | string | null>> }) {
  // Os PDFs do Domínio vêm em layouts distintos; resumirFolha achata tudo em
  // competências canônicas (os campos brutos ficam aninhados e liam zero aqui).
  const resumo = resumirFolha({ competencias });
  const canonicas = resumo.competencias;
  const data = canonicas
    .map((c) => ({
      mes: String(c.competencia ?? ""),
      Proventos: c.total_proventos,
      FGTS: c.valor_fgts || c.base_fgts * 0.08,
    }))
    .sort((a, b) => ordemCompetencia(a.mes) - ordemCompetencia(b.mes));
  return (
    <Card className="p-6 shadow-[var(--shadow-elegant)]">
      <h3 className="font-display text-xl text-navy mb-4">Folha de pagamento — {data.length} competências</h3>
      {resumo.alertas.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {resumo.alertas.map((alerta) => (
            <p key={alerta}>{alerta}</p>
          ))}
        </div>
      )}

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => formatBRL(v)} tick={{ fontSize: 10 }} width={90} />
            <Tooltip formatter={(v: number) => formatBRL(v)} />
            <Legend />
            <Line type="monotone" dataKey="Proventos" stroke="#0B2545" strokeWidth={2} />
            <Line type="monotone" dataKey="FGTS" stroke="#BA7517" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Projecao({ cenarios }: { cenarios: Cenario[] }) {
  const anos = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033];
  const data = anos.map((ano) => {
    const row: Record<string, number | string> = { ano };
    for (const c of cenarios) {
      const inicio = c.ano ?? (c.regime === "HIBRIDO" ? 2027 : 2026);
      if (ano < inicio) continue;
      row[label(c.regime)] = c.carga_total;
    }
    return row;
  });
  return (
    <Card className="p-6 shadow-[var(--shadow-elegant)]">
      <h3 className="font-display text-xl text-navy mb-1">Projeção 2026–2033</h3>
      <p className="text-xs text-muted-foreground mb-4">Trajetória da carga tributária por regime considerando a transição da Reforma. Cada cenário inicia no ano em que passa a vigorar.</p>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="ano" />
            <YAxis tickFormatter={(v) => formatBRL(v)} tick={{ fontSize: 10 }} width={90} />
            <Tooltip formatter={(v: number) => formatBRL(v)} />
            <Legend />
            {cenarios.map((c) => (
              <Line key={c.regime} type="monotone" dataKey={label(c.regime)} stroke={REGIME_COLOR[c.regime] ?? "#6B7280"} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function PlanoAcao({ recomendado, cliente }: { recomendado: RegimeKey; cliente: Cliente }) {
  const acoes: Array<{ acao: string; prazo: string; resp: string; prio: "URGENTE" | "ALTA" | "MÉDIA" }> = [];
  if (recomendado === "HIBRIDO") {
    acoes.push({ acao: "Manter a opção pelo regime regular de IBS/CBS e renegociar preços com clientes PJ", prazo: "20/12/2026", resp: "Record + Cliente", prio: "URGENTE" });
  } else if (isLR(recomendado)) {
    acoes.push({ acao: "Confirmar apuração pelo Lucro Real e estruturar controle de créditos sobre compras e insumos", prazo: "Jan/2027", resp: "Record", prio: "ALTA" });
    acoes.push({ acao: "Formalizar aproveitamento e controle de prejuízo fiscal acumulado (compensação futura)", prazo: "Contínuo", resp: "Record", prio: "ALTA" });
  } else {
    acoes.push({ acao: `Manter regime ${label(recomendado)} e acompanhar carga 2027`, prazo: "Contínuo", resp: "Record", prio: "MÉDIA" });
  }
  acoes.push({ acao: "Adequar emissão de NF para destacar CBS conforme calendário da reforma", prazo: "Ago/2026", resp: "TI + Record", prio: "ALTA" });
  acoes.push({ acao: `Mapear fornecedores ${cliente.setor.toLowerCase()} elegíveis a crédito de IBS/CBS`, prazo: "Dez/2026", resp: "Record", prio: "ALTA" });
  acoes.push({ acao: "Revisar precificação para repassar/absorver impacto IVA dual em 2027", prazo: "1° tri/2027", resp: "Cliente", prio: "MÉDIA" });
  acoes.push({ acao: "Monitorar publicação das alíquotas definitivas pelo Comitê Gestor IBS", prazo: "2026–2028", resp: "Record", prio: "MÉDIA" });


  const corPrio = { URGENTE: "bg-rose-100 text-rose-900", ALTA: "bg-amber-100 text-amber-900", MÉDIA: "bg-slate-100 text-slate-700" };

  return (
    <Card className="p-6 shadow-[var(--shadow-elegant)]">
      <h3 className="font-display text-xl text-navy mb-4">Plano de ação</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-off-white text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Ação</th>
              <th className="px-3 py-2 text-left">Prazo</th>
              <th className="px-3 py-2 text-left">Responsável</th>
              <th className="px-3 py-2 text-left">Prioridade</th>
            </tr>
          </thead>
          <tbody>
            {acoes.map((a, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2">{a.acao}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.prazo}</td>
                <td className="px-3 py-2 text-muted-foreground">{a.resp}</td>
                <td className="px-3 py-2"><span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${corPrio[a.prio]}`}>{a.prio}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─────────────────────────── Novas seções (Entrega 4) ───────────────────────────

const SALARIO_MINIMO_2026 = 1518;

function ResumoExecutivo({
  recomendado,
  pior,
  cliente,
  economia,
  receita,
  inelegiveis,
}: {
  recomendado: Cenario;
  pior: Cenario;
  cliente: Cliente;
  economia: number;
  receita: number;
  inelegiveis: Cenario[];
}) {
  const pctEcon = receita > 0 ? economia / receita : 0;
  const salarios = Math.round(economia / SALARIO_MINIMO_2026);
  const acaoImediata =
    recomendado.regime === "HIBRIDO"
      ? "Confirmar a opção pelo regime regular de IBS/CBS e não cancelá-la até 20/12/2026; a próxima janela de opção é março/2027, para o 2º semestre."
      : isLR(recomendado.regime)
        ? "Estruturar o controle de créditos sobre compras e insumos (PIS/Cofins até 2026, CBS a partir de 2027), que é o principal vetor de redução da carga no Lucro Real."
        : `Manter o ${label(recomendado.regime)} e adequar a emissão fiscal até dezembro/2026 para destacar CBS/IBS conforme calendário oficial da reforma.`;
  const restricao = inelegiveis.length
    ? `${inelegiveis.map((c) => label(c.regime)).join(", ")} ${inelegiveis.length > 1 ? "estão" : "está"} legalmente fora de alcance para esta empresa e ${inelegiveis.length > 1 ? "foram" : "foi"} excluíd${inelegiveis.length > 1 ? "os" : "o"} da comparação.`
    : "";

  return (
    <Card className="p-7 shadow-[var(--shadow-elegant)] border-l-4 border-l-gold">
      <p className="text-[10px] uppercase tracking-widest text-gold mb-2">Resumo Executivo</p>
      <h3 className="font-display text-2xl text-navy mb-5">Em três parágrafos: o que muda, por que vence e o que fazer agora</h3>
      <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
        <p>
          <strong className="text-navy">O que muda. </strong>
          A LC 214/2025 substitui PIS, Cofins, ICMS e ISS por <strong>CBS</strong> e <strong>IBS</strong> entre 2026 e 2033 (em 2027: CBS de {formatPct(CBS_2027_PADRAO)} e IBS de {formatPct(IBS_2027_PADRAO)}), alterando profundamente a carga de tributos indiretos da {cliente.razao_social}. Com receita bruta anualizada de <strong className="num-display">{formatBRL(receita)}</strong>, {cliente.pct_b2b ?? 0}% da receita em B2B e setor {cliente.setor}, o perfil da empresa exige reposicionamento fiscal. {restricao}
        </p>
        <p>
          <strong className="text-navy">Por que {label(recomendado.regime)} vence. </strong>
          Entre os regimes legalmente aplicáveis, simulados com dados reais de DRE, folha e fornecedores, o {label(recomendado.regime)} entrega carga tributária de <strong className="num-display">{formatBRL(recomendado.carga_total)}</strong> ({formatPct(recomendado.carga_pct)} da receita) e lucro líquido de <strong className="num-display">{formatBRL(recomendado.lucro_liquido)}</strong>, além de encargos de folha de {formatBRL(recomendado.encargos_folha ?? recomendado.fgts_anual)}. A diferença de <strong className="num-display text-emerald-700">{formatBRL(economia)}</strong> ({formatPct(pctEcon)} da receita) frente ao {label(pior.regime)} equivale a aproximadamente <strong>{salarios.toLocaleString("pt-BR")} salários mínimos por ano</strong>.
        </p>
        <p>
          <strong className="text-navy">O que fazer agora. </strong>
          {acaoImediata} Em paralelo, mapear fornecedores elegíveis a crédito de IBS/CBS, revisar precificação para absorver/repassar o IVA dual em 2027 e monitorar a publicação das alíquotas definitivas pelo Comitê Gestor do IBS. O plano de ação detalhado com prazos está na seção final deste relatório.
        </p>
      </div>
    </Card>
  );
}


function ImpactoFinanceiro({
  cenarios,
  recomendado,
  receita,
}: {
  cenarios: Cenario[];
  recomendado: string;
  receita: number;
}) {
  const rec = cenarios.find((c) => c.regime === recomendado) ?? cenarios[0];
  const linhas = cenarios.map((c) => {
    const dif = c.lucro_liquido - rec.lucro_liquido;
    const salarios = Math.round(Math.abs(dif) / SALARIO_MINIMO_2026);
    return {
      regime: c.regime,
      cargaTotal: c.carga_total,
      lucroLiquido: c.lucro_liquido,
      margemLiq: receita > 0 ? c.lucro_liquido / receita : 0,
      diferenca: dif,
      salarios,
      contexto:
        c.regime === recomendado
          ? "Cenário recomendado — base de comparação"
          : dif >= 0
            ? `Geraria ${formatBRL(dif)} a mais que o recomendado (≈ ${salarios.toLocaleString("pt-BR")} sal. mín./ano)`
            : `Custaria ${formatBRL(-dif)} a menos de lucro (≈ ${salarios.toLocaleString("pt-BR")} sal. mín./ano perdidos)`,
    };
  });

  return (
    <Card className="p-0 overflow-hidden shadow-[var(--shadow-elegant)]">
      <div className="px-6 py-4 border-b bg-navy text-white">
        <h3 className="font-display text-xl">Impacto financeiro contextualizado</h3>
        <p className="text-xs text-white/70 mt-1">Diferença de lucro líquido vs. regime recomendado, traduzida em salários mínimos/ano ({formatBRL(SALARIO_MINIMO_2026)}/mês).</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-off-white text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 text-left">Regime</th>
              <th className="px-4 py-2.5 text-right">Carga total</th>
              <th className="px-4 py-2.5 text-right">Lucro líquido</th>
              <th className="px-4 py-2.5 text-right">Margem</th>
              <th className="px-4 py-2.5 text-left">Contextualização prática</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const isRec = l.regime === recomendado;
              return (
                <tr key={l.regime} className={`border-t ${isRec ? "bg-emerald-50/60" : ""}`}>
                  <td className="px-4 py-3 font-medium text-navy">
                    {label(l.regime)}
                    {isRec && <span className="ml-2 text-[9px] uppercase tracking-wider bg-emerald-700 text-white px-1.5 py-0.5 rounded">✓</span>}
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums">{formatBRL(l.cargaTotal)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatBRL(l.lucroLiquido)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPct(l.margemLiq)}</td>
                  <td className={`px-4 py-3 text-xs ${isRec ? "text-emerald-800" : l.diferenca >= 0 ? "text-amber-800" : "text-rose-800"}`}>
                    {l.contexto}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 text-[10px] text-muted-foreground border-t bg-off-white/50">
        Equivalência calculada com salário mínimo de referência de {formatBRL(SALARIO_MINIMO_2026)}/mês (proj. 2026).
      </div>
    </Card>
  );
}

type Marco = {
  data: string;
  ano: number;
  titulo: string;
  descricao: string;
  acao?: string;
  prio: "URGENTE" | "ALTA" | "MÉDIA" | "INFO";
};

function LinhaTempoReforma({ recomendado, cliente }: { recomendado: string; cliente: Cliente }) {
  const marcos: Marco[] = [
    {
      data: "Mai/2026",
      ano: 2026,
      titulo: "Início do período de teste CBS/IBS",
      descricao: "Notas fiscais já devem destacar CBS (0,9%) e IBS (0,1%) em caráter informativo, sem impacto financeiro.",
      acao: "Atualizar emissor de NF e validar layout com TI/contabilidade.",
      prio: "ALTA",
    },
    {
      data: "Nov–Dez/2026",
      ano: 2026,
      titulo: "Janela de cancelamento das opções (03/11 a 20/12/2026)",
      descricao:
        recomendado === "HIBRIDO"
          ? "A opção pelo regime regular de IBS/CBS vale para jan a jun/2027; o cancelamento é irretratável."
          : "Quem optou pelo regime regular pode cancelar até 20/12/2026 — irretratável para jan a jun/2027.",
      acao: recomendado === "HIBRIDO" ? "Não cancelar a opção; confirmar repasse de preço com clientes PJ." : "Se houve opção pelo regime regular, avaliar o cancelamento até 20/12/2026.",
      prio: "URGENTE",
    },
    {
      data: "Dez/2026",
      ano: 2026,
      titulo: "Mapeamento de créditos de fornecedores",
      descricao: `Levantamento dos fornecedores ${cliente.setor.toLowerCase()} elegíveis a crédito de IBS/CBS em 2027.`,
      acao: "Classificar fornecedores por CNAE e regime tributário; renegociar contratos críticos.",
      prio: "ALTA",
    },
    {
      data: "Jan/2027",
      ano: 2027,
      titulo: `Extinção de PIS e Cofins · CBS de ${(CBS_2027_PADRAO * 100).toFixed(1).replace(".", ",")}%`,
      descricao: "CBS substitui PIS/Cofins (referência menos 0,1 p.p. em 2027–2028). IBS de 0,1% (0,05% estadual + 0,05% municipal).",
      acao: "Repassar/absorver impacto na precificação; revisar contratos B2B/B2C.",
      prio: "URGENTE",
    },
    {
      data: "2028",
      ano: 2028,
      titulo: "Alíquotas definitivas do IBS",
      descricao: "Comitê Gestor do IBS publica alíquotas estaduais e municipais definitivas a partir desta fase.",
      acao: "Refazer simulação com alíquotas reais e atualizar projeção de fluxo de caixa.",
      prio: "ALTA",
    },
    {
      data: "2029–2032",
      ano: 2029,
      titulo: "Transição gradual ICMS/ISS → IBS",
      descricao: "Redução escalonada de ICMS e ISS (90% → 80% → 70% → 60%) com elevação proporcional do IBS.",
      acao: "Monitorar carga efetiva trimestralmente e ajustar precificação anualmente.",
      prio: "MÉDIA",
    },
    {
      data: "Jan/2033",
      ano: 2033,
      titulo: "Reforma 100% implementada",
      descricao: "ICMS e ISS extintos. Apenas CBS e IBS vigentes no consumo. Modelo IVA dual brasileiro consolidado.",
      acao: "Auditoria final de compliance e revisão estratégica do regime tributário.",
      prio: "INFO",
    },
  ];

  const corPrio: Record<Marco["prio"], string> = {
    URGENTE: "bg-rose-100 text-rose-900 border-rose-300",
    ALTA: "bg-amber-100 text-amber-900 border-amber-300",
    MÉDIA: "bg-sky-100 text-sky-900 border-sky-300",
    INFO: "bg-slate-100 text-slate-700 border-slate-300",
  };
  const corPonto: Record<Marco["prio"], string> = {
    URGENTE: "bg-rose-600",
    ALTA: "bg-amber-500",
    MÉDIA: "bg-sky-500",
    INFO: "bg-slate-400",
  };

  return (
    <Card className="p-6 shadow-[var(--shadow-elegant)]">
      <h3 className="font-display text-xl text-navy mb-1">Linha do tempo da Reforma — marcos para {cliente.razao_social}</h3>
      <p className="text-xs text-muted-foreground mb-6">Mai/2026 a Jan/2033 · marcos oficiais + ações específicas para esta empresa.</p>
      <div className="relative">
        <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gradient-to-b from-gold via-navy/30 to-slate-300" />
        <ol className="space-y-5">
          {marcos.map((m, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="relative pl-12"
            >
              <span className={`absolute left-2.5 top-2 h-3.5 w-3.5 rounded-full ring-4 ring-white ${corPonto[m.prio]}`} />
              <div className={`rounded-md border p-4 ${corPrio[m.prio]}`}>
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-sm text-navy">{m.data}</span>
                    <span className="font-semibold">{m.titulo}</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/60">{m.prio}</span>
                </div>
                <p className="text-xs mt-2 opacity-90">{m.descricao}</p>
                {m.acao && (
                  <p className="text-xs mt-2 pt-2 border-t border-current/20">
                    <strong>Ação para esta empresa: </strong>{m.acao}
                  </p>
                )}
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

