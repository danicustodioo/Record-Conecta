export const formatBRL = (v: number | null | undefined) => {
  if (v == null || isNaN(v as number)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
};
export const formatBRLCents = (v: number | null | undefined) => {
  if (v == null || isNaN(v as number)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
};
export const formatPct = (v: number | null | undefined, decimals = 2) => {
  if (v == null || isNaN(v as number)) return "—";
  return `${(v * 100).toFixed(decimals).replace(".", ",")}%`;
};
export const formatDate = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleDateString("pt-BR");
};
export const formatCNPJ = (cnpj: string) => {
  const d = (cnpj || "").replace(/\D/g, "").padStart(14, "0").slice(-14);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
};
