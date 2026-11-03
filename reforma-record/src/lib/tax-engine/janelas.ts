// Bloco 15A — Prazos de opção e cancelamento (Res. CGSN 186/2026 e 194/2026).
// Espelha o seed da tabela `janelas_opcao`; usado como padrão quando a tabela não puder ser lida.

export interface JanelaOpcao {
  descricao: string;
  data_inicio: string; // yyyy-mm-dd
  data_fim: string; // yyyy-mm-dd
  periodo_efeito: string;
  irretratavel: boolean;
  fonte: string;
}

export const JANELAS_PADRAO: JanelaOpcao[] = [
  { descricao: "Opção pelo Simples Nacional para 2027", data_inicio: "2026-09-01", data_fim: "2026-10-15", periodo_efeito: "ano-calendário 2027", irretratavel: false, fonte: "Res. CGSN 194/2026" },
  { descricao: "Opção pelo regime regular de IBS e CBS", data_inicio: "2026-09-01", data_fim: "2026-10-30", periodo_efeito: "jan a jun/2027", irretratavel: false, fonte: "Res. CGSN 194/2026" },
  { descricao: "Cancelamento das opções", data_inicio: "2026-11-03", data_fim: "2026-12-20", periodo_efeito: "jan a jun/2027", irretratavel: true, fonte: "Res. CGSN 194/2026" },
  { descricao: "Resolução do Senado com a alíquota da CBS", data_inicio: "2026-12-01", data_fim: "2026-12-15", periodo_efeito: "2027", irretratavel: false, fonte: "LC 214/2025, art. 14" },
  { descricao: "Opção pelo regime regular — 2º semestre", data_inicio: "2027-03-01", data_fim: "2027-03-31", periodo_efeito: "jul a dez/2027", irretratavel: false, fonte: "Res. CGSN 186/2026" },
];

/** Data local em yyyy-mm-dd (fuso de Brasília). */
export function hojeISO(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export function janelaAberta(j: JanelaOpcao, hoje: string = hojeISO()): boolean {
  return hoje >= j.data_inicio && hoje <= j.data_fim;
}

export function janelaCancelamento(janelas: JanelaOpcao[] = JANELAS_PADRAO): JanelaOpcao | undefined {
  return janelas.find((j) => j.descricao.toLowerCase().startsWith("cancelamento"));
}

export function fmtDataBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
