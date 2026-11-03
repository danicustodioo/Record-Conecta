export type PeriodoDre = {
  inicio: string;
  fim: string;
  meses: number;
  fator: number;
  fonte: "periodos" | "raiz" | "manual";
};

type DreLike = Record<string, unknown> | null | undefined;

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function mesesEntreDatas(inicio: unknown, fim: unknown): number | null {
  const a = parseDateOnly(inicio);
  const b = parseDateOnly(fim);
  if (!a || !b || b.getTime() < a.getTime()) return null;
  const meses =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth()) +
    1;
  return meses > 0 && meses <= 12 ? meses : null;
}

function periodoFromDates(inicio: Date, fim: Date, fonte: PeriodoDre["fonte"]): PeriodoDre | null {
  const meses = mesesEntreDatas(iso(inicio), iso(fim));
  if (!meses) return null;
  return { inicio: iso(inicio), fim: iso(fim), meses, fator: 12 / meses, fonte };
}

export function identificarPeriodoDre(dre: DreLike): PeriodoDre | null {
  if (!dre || typeof dre !== "object") return null;

  const periodosRaw = Array.isArray(dre.periodos) ? dre.periodos : [];
  const periodos = periodosRaw
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const item = p as Record<string, unknown>;
      const inicio = parseDateOnly(item.periodo_inicio);
      const fim = parseDateOnly(item.periodo_fim);
      return inicio && fim ? { inicio, fim } : null;
    })
    .filter((p): p is { inicio: Date; fim: Date } => Boolean(p))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  if (periodos.length) {
    const inicio = periodos[0]?.inicio;
    const fim = periodos.reduce((max, p) => (p.fim.getTime() > max.getTime() ? p.fim : max), periodos[0].fim);
    if (inicio) return periodoFromDates(inicio, fim, "periodos");
  }

  const raizInicio = parseDateOnly(dre.periodo_inicio);
  const raizFim = parseDateOnly(dre.periodo_fim);
  if (raizInicio && raizFim) return periodoFromDates(raizInicio, raizFim, "raiz");

  return null;
}

export function mesesManualValido(value: string): number | null {
  const n = Number(value.replace(",", "."));
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return n;
}

export function formatarFatorAnualizacao(fator: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 4,
  }).format(fator);
}