// Bloco 15A — Decisão do Simples para 2027: cancelar ou manter o regime regular de IBS/CBS.
// Componente de ADIÇÃO ao diagnóstico: lê só o resultado salvo pela engine v15.

import { Card } from "@/components/ui/card";
import { formatBRL, formatPct } from "@/lib/format";
import { CheckCircle2, XCircle, HelpCircle, AlertTriangle } from "lucide-react";

type Condicao = { id: number; titulo: string; ok: boolean | null; detalhe: string };

export type DecisaoSimplesView = {
  aliquota_efetiva_das: number;
  p_cbs: number;
  p_ibs: number;
  credito_transferido_unificado_pct: number;
  credito_transferido_unificado_rs: number;
  credito_transferido_regular_pct: number;
  credito_transferido_regular_rs: number;
  reajuste_equilibrio: number;
  pct_receita_pj_regular: number | null;
  carga_unificado: number;
  carga_regular: number;
  delta_carga_pct: number;
  receita_liquida_unificado: number;
  receita_liquida_regular_sem_reajuste: number;
  receita_liquida_regular_com_reajuste: number;
  ganho_regular_sem_reajuste: number;
  ganho_regular_com_reajuste: number;
  vigencia_regime_regular?: string;
  ganho_1o_semestre_sem_reajuste?: number;
  ganho_1o_semestre_com_reajuste?: number;
  carga_2027_ano_civil?: number;
  base_creditavel_atual_pct: number;
  base_creditavel_minima_pct: number;
  condicoes: Condicao[];
  recomenda_regime_regular: boolean;
  recomendacao: string;
  optou_regime_regular: boolean | null;
  alerta_cancelamento: boolean;
};

export type FatorRView = {
  fator_r: number;
  anexo: string;
  folha_12m: number;
  rbt12: number;
  distancia_limite: number;
  folha_faltante_12m: number;
  folha_faltante_mensal: number;
  zona_risco: boolean;
};

const anexoLabel = (a: string) => a.replace("ANEXO_", "Anexo ");

function Linha({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`num-display text-sm ${destaque ? "text-navy font-semibold" : "text-foreground"}`}
      >
        {valor}
      </span>
    </div>
  );
}

function Icone({ ok }: { ok: boolean | null }) {
  if (ok === true) return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />;
  if (ok === false) return <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />;
  return <HelpCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />;
}

const sinal = (v: number) => `${v >= 0 ? "+" : "−"}${formatBRL(Math.abs(v))}`;

export function FatorRCard({
  fator,
  anexoCadastro,
}: {
  fator: FatorRView;
  anexoCadastro?: string;
}) {
  return (
    <Card className="p-6">
      <p className="label-uppercase">Fator R · LC 123/2006, art. 18, §§ 5º-J e 5º-M</p>
      <div className="grid md:grid-cols-3 gap-4 mt-3">
        <div>
          <p className="num-display text-3xl text-navy">{formatPct(fator.fator_r)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Folha 12 meses {formatBRL(fator.folha_12m)} ÷ RBT12 {formatBRL(fator.rbt12)}
          </p>
        </div>
        <div>
          <p className="text-sm">
            Anexo resultante: <strong className="text-navy">{anexoLabel(fator.anexo)}</strong>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Distância do limite de 28%: {fator.distancia_limite >= 0 ? "+" : ""}
            {formatPct(fator.distancia_limite)}
          </p>
          {anexoCadastro && anexoCadastro !== fator.anexo && (
            <p className="text-xs text-amber-700 mt-1">
              Cadastro indica {anexoLabel(anexoCadastro)} — o cálculo usou o Fator R.
            </p>
          )}
        </div>
        <div className="text-xs">
          {fator.anexo === "ANEXO_V" ? (
            <p>
              Faltam <strong>{formatBRL(fator.folha_faltante_mensal)}/mês</strong> de folha ou
              pró-labore ({formatBRL(fator.folha_faltante_12m)} em 12 meses) para migrar do Anexo V
              ao III.
            </p>
          ) : fator.zona_risco ? (
            <p className="text-amber-800 flex gap-1.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Zona de risco (28% a 32%): crescimento de receita sem aumento de folha derruba a
              empresa para o Anexo V.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Folha acima da zona de risco — Anexo III estável.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function DecisaoSimplesCard({ d }: { d: DecisaoSimplesView }) {
  const pj = d.pct_receita_pj_regular;
  return (
    <Card className="p-6 space-y-5">
      <div>
        <p className="label-uppercase">
          Simples Nacional em 2027 · manter unificado ou regime regular de IBS/CBS
        </p>
        <div
          className={`mt-3 rounded-md p-3 text-sm flex gap-2 ${
            d.alerta_cancelamento
              ? "bg-red-50 border border-red-300 text-red-900"
              : d.recomenda_regime_regular
                ? "bg-emerald-50 border border-emerald-200 text-emerald-900"
                : "bg-navy/5 border border-navy/20 text-navy"
          }`}
        >
          {d.alerta_cancelamento ? (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>
            <strong>{d.recomendacao}</strong>
            {d.optou_regime_regular === true &&
              " A empresa já optou pelo regime regular para jan a jun/2027."}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold text-navy uppercase tracking-wide mb-1">
            Crédito transferido ao cliente PJ
          </p>
          <Linha
            label={`Hoje — Simples unificado (${formatPct(d.aliquota_efetiva_das)} × ${formatPct(d.p_cbs + d.p_ibs)})`}
            valor={`${formatPct(d.credito_transferido_unificado_pct)} · ${formatBRL(d.credito_transferido_unificado_rs)}`}
          />
          <Linha
            label="Regime regular (alíquota cheia do item)"
            valor={`${formatPct(d.credito_transferido_regular_pct)} · ${formatBRL(d.credito_transferido_regular_rs)}`}
          />
          <Linha
            label="Reajuste de preço de equilíbrio"
            valor={`+${formatPct(d.reajuste_equilibrio)}`}
            destaque
          />
          <Linha
            label="Receita de clientes que aproveitam crédito (PJ regime regular)"
            valor={pj == null ? "não informado" : formatPct(pj)}
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-navy uppercase tracking-wide mb-1">
            Receita líquida de tributos
          </p>
          <Linha label="Simples unificado 2027" valor={formatBRL(d.receita_liquida_unificado)} />
          <Linha
            label="Regime regular, sem reajuste"
            valor={formatBRL(d.receita_liquida_regular_sem_reajuste)}
          />
          <Linha
            label="Regime regular, com reajuste de equilíbrio"
            valor={formatBRL(d.receita_liquida_regular_com_reajuste)}
          />
          <Linha
            label="Ganho/perda no regime regular, sem reajuste"
            valor={sinal(d.ganho_regular_sem_reajuste)}
            destaque
          />
          <Linha
            label="Ganho/perda no regime regular, com reajuste"
            valor={sinal(d.ganho_regular_com_reajuste)}
            destaque
          />
          {d.ganho_1o_semestre_sem_reajuste != null && (
            <>
              <Linha
                label="Efeito real da opção (só jan–jun/2027), sem reajuste"
                valor={sinal(d.ganho_1o_semestre_sem_reajuste)}
              />
              <Linha
                label="Efeito real da opção (só jan–jun/2027), com reajuste"
                valor={sinal(d.ganho_1o_semestre_com_reajuste ?? 0)}
              />
            </>
          )}
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        A opção pelo regime regular vale só para{" "}
        <strong>{d.vigencia_regime_regular ?? "jan a jun/2027"}</strong>. No 2º semestre a empresa
        volta automaticamente ao DAS unificado, salvo nova opção em março/2027 (Res. CGSN 194/2026).
        {d.carga_2027_ano_civil != null && (
          <>
            {" "}
            Carga de 2027 com a opção: {formatBRL(d.carga_2027_ano_civil)} (1º semestre no regime
            regular + 2º no Simples).
          </>
        )}
      </div>

      <div className="rounded-md bg-muted/40 p-3 text-xs">
        <strong>Ponto de equilíbrio da base creditável:</strong> compras creditáveis de{" "}
        {formatPct(d.base_creditavel_atual_pct)} da receita contra mínimo de{" "}
        {formatPct(d.base_creditavel_minima_pct)} — distância de{" "}
        {formatPct(d.base_creditavel_atual_pct - d.base_creditavel_minima_pct)}.
      </div>

      <div>
        <p className="text-xs font-semibold text-navy uppercase tracking-wide mb-2">
          Regime regular só é recomendado se as quatro condições forem atendidas
        </p>
        <ul className="space-y-2">
          {d.condicoes.map((c) => (
            <li key={c.id} className="flex gap-2 text-sm">
              <Icone ok={c.ok} />
              <span>
                <strong>
                  {c.id}. {c.titulo}.
                </strong>{" "}
                <span className="text-muted-foreground">{c.detalhe}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
