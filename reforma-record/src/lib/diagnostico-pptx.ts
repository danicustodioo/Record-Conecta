// Gera a apresentação (.pptx) do diagnóstico: capa, sumário executivo, comparativo de
// regimes, gráficos capturados do dashboard e a auditoria do cálculo de CBS 2027.
import pptxgen from "pptxgenjs";
import { CBS_2027_PADRAO } from "@/lib/tax-engine/parametros";
import { toPng } from "html-to-image";
import { formatBRL, formatCNPJ, formatDate, formatPct } from "@/lib/format";
import { RODAPE_CBS } from "@/lib/enquadramento";
import { montarAuditoriaCBS, notasAuditoriaCBS, type AuditoriaCBS } from "@/lib/auditoria-cbs";

const NAVY = "0B2545";
const GOLD = "BA7517";
const INK = "282828";
const MUTED = "6E6E6E";
const LIGHT = "F2EEE6";
const WHITE = "FFFFFF";

const W = 13.333;
const H = 7.5;

type RegimeKey = string;
type Cenario = {
  regime: RegimeKey;
  elegivel?: boolean;
  motivo_inelegibilidade?: string;
  base_legal_inelegibilidade?: string;
  carga_total: number;
  carga_pct: number;
  lucro_liquido: number;
  encargos_folha?: number;
  detalhamento: Record<string, number>;
};
type Resultados = {
  recomendado: RegimeKey;
  cenarios: Cenario[];
  receita_anual?: number;
  meses_dre?: number;
  cbs_aliquota_base?: number;
};
type Cliente = {
  razao_social: string;
  cnpj: string;
  setor: string;
  subsetor: string | null;
  regime_atual: string;
  rbt12: number;
  socios_habilitados?: boolean | null;
};
type Analise = {
  created_at: string;
  resultados_calculo: Resultados | null;
  dados_dre?: Record<string, number | null> | null;
  aliquota_cbs_utilizada?: number | null;
  data_base_calculo?: string | null;
  versao_engine?: string | null;
  conferido_por?: string | null;
};

const REGIME_LABEL: Record<string, string> = {
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
const label = (r: string) => REGIME_LABEL[r] ?? r;

function slug(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Slide = ReturnType<pptxgen["addSlide"]>;

function chrome(slide: Slide, kicker: string, titulo: string) {
  slide.background = { color: WHITE };
  slide.addShape("rect", { x: 0, y: 0, w: W, h: 0.12, fill: { color: GOLD } });
  slide.addText(kicker.toUpperCase(), {
    x: 0.7, y: 0.42, w: W - 1.4, h: 0.3, fontSize: 12, color: GOLD, bold: true, charSpacing: 2,
  });
  slide.addText(titulo, {
    x: 0.7, y: 0.75, w: W - 1.4, h: 0.8, fontSize: 30, color: NAVY, bold: true, fontFace: "Georgia",
  });
  slide.addText("RECORD HUB", {
    x: 0.7, y: H - 0.55, w: 5, h: 0.3, fontSize: 10, color: MUTED,
  });
}

function tabela(slide: Slide, rows: string[][], opts: { y: number; colW: number[]; fontSize?: number; h?: number }) {
  const fs = opts.fontSize ?? 12;
  const body = rows.map((r, i) =>
    r.map((cell) => ({
      text: cell,
      options: {
        fontSize: fs,
        color: i === 0 ? WHITE : INK,
        bold: i === 0,
        fill: { color: i === 0 ? NAVY : i % 2 === 0 ? LIGHT : WHITE },
        align: (i > 0 && /^(R\$|—|\d|[-+]?\d)/.test(cell.trim()) ? "right" : "left") as "right" | "left",
        valign: "middle" as const,
      },
    })),
  );
  slide.addTable(body, {
    x: 0.7,
    y: opts.y,
    w: opts.colW.reduce((a, b) => a + b, 0),
    colW: opts.colW,
    border: { type: "solid", color: "DDD8CE", pt: 0.5 },
    margin: 6,
    rowH: opts.h ?? 0.32,
  });
}

async function capturar(el: HTMLElement): Promise<string | null> {
  try {
    return await toPng(el, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
  } catch {
    return null;
  }
}

function slidesAuditoria(pptx: pptxgen, a: AuditoriaCBS) {
  // 1 · Anualização e parâmetros
  const s1 = pptx.addSlide();
  chrome(s1, "Auditoria técnica", "Cálculo da CBS 2027 — anualização e parâmetros");
  s1.addText(
    "Memória de cálculo rastreável: como a base foi anualizada e qual alíquota entrou em cada linha de receita.",
    { x: 0.7, y: 1.55, w: W - 1.4, h: 0.4, fontSize: 13, color: MUTED },
  );
  tabela(
    s1,
    [
      ["Parâmetro", "Valor"],
      ["Meses cobertos pela DRE", a.meses_dre ? String(a.meses_dre) : "Não identificado"],
      ["Fator de anualização (12 / meses)", a.fator_anualizacao.toFixed(4)],
      ["Receita bruta do período", a.receita_periodo != null ? formatBRL(a.receita_periodo) : "—"],
      ["Receita bruta anualizada (base da CBS)", formatBRL(a.receita_anualizada)],
      ["Alíquota base de CBS", `${(a.aliquota_base * 100).toFixed(3)}%`],
      [
        "Requisito societário (art. 127, §1º, II)",
        a.socios_habilitados === true ? "Confirmado" : a.socios_habilitados === false ? "Não atendido" : "Não informado",
      ],
      ["Versão da engine de cálculo", a.versao_engine],
    ],
    { y: 2.1, colW: [7.0, 4.9], h: 0.42 },
  );

  // 2 · Redução setorial linha a linha
  const cen = a.cenarios.find((c) => c.linhas.length) ?? a.cenarios[0];
  if (cen?.linhas.length) {
    const chunks: typeof cen.linhas[] = [];
    for (let i = 0; i < cen.linhas.length; i += 8) chunks.push(cen.linhas.slice(i, i + 8));
    chunks.forEach((chunk, idx) => {
      const s = pptx.addSlide();
      chrome(
        s,
        "Auditoria técnica",
        `Redução setorial e débito por linha de receita${chunks.length > 1 ? ` (${idx + 1}/${chunks.length})` : ""}`,
      );
      const rows: string[][] = [
        ["Tipo de receita", "Base anualizada", "Redução", "Alíq. efetiva", "CBS devida"],
        ...chunk.map((l) => [
          l.descricao + (l.monofasico ? " (monofásico)" : l.reducao_negada_societaria ? " (redução negada)" : ""),
          formatBRL(l.base),
          formatPct(l.reducao),
          `${(l.aliquota_efetiva * 100).toFixed(3)}%`,
          formatBRL(l.cbs),
        ]),
      ];
      if (idx === chunks.length - 1) {
        rows.push(["Débito bruto de CBS", formatBRL(cen.linhas.reduce((s2, l) => s2 + l.base, 0)), "", "", formatBRL(cen.debito_bruto)]);
      }
      tabela(s, rows, { y: 1.75, colW: [4.4, 2.1, 1.4, 1.7, 2.3], fontSize: 11, h: 0.4 });
      s.addText(chunk.map((l) => `${l.descricao}: ${l.artigo}`).join("   ·   "), {
        x: 0.7, y: H - 1.05, w: W - 1.4, h: 0.45, fontSize: 8, color: MUTED,
      });
    });
  }

  // 3 · Débito × crédito × saldo credor
  const s3 = pptx.addSlide();
  chrome(s3, "Auditoria técnica", "Débito, crédito e saldo credor por cenário");
  tabela(
    s3,
    [
      ["Cenário", "Base creditável", "Débito bruto", "Créditos", "CBS a pagar", "Saldo credor"],
      ...a.cenarios.map((c) => [
        c.rotulo,
        c.base_creditavel > 0 ? formatBRL(c.base_creditavel) : "—",
        formatBRL(c.debito_bruto),
        formatBRL(c.creditos),
        formatBRL(c.cbs_liquido),
        c.saldo_credor > 0 ? formatBRL(c.saldo_credor) : "—",
      ]),
    ],
    { y: 1.9, colW: [3.0, 1.9, 1.9, 1.8, 1.8, 1.5], fontSize: 11, h: 0.45 },
  );
  const comSaldo = a.cenarios.filter((c) => c.saldo_credor > 0);
  s3.addText(
    comSaldo.length
      ? `Saldo credor de ${comSaldo.map((c) => `${formatBRL(c.saldo_credor)} (${c.rotulo})`).join(" e ")}: crédito maior que débito não é perdido — acumula para compensação futura (art. 47 da LC 214/2025).`
      : "Em nenhum cenário os créditos superaram o débito de CBS — não há saldo credor a acumular.",
    { x: 0.7, y: H - 1.6, w: W - 1.4, h: 0.7, fontSize: 12, color: NAVY, italic: true },
  );

  // 4 · Notas técnicas
  const s4 = pptx.addSlide();
  chrome(s4, "Auditoria técnica", "Notas técnicas do cálculo");
  s4.addText(
    notasAuditoriaCBS(a).map((n) => ({ text: n, options: { bullet: { code: "2022" }, breakLine: true } })),
    { x: 0.8, y: 1.8, w: W - 1.7, h: H - 2.6, fontSize: 12, color: INK, lineSpacingMultiple: 1.15 },
  );
}

export async function gerarDiagnosticoPPTX(params: {
  cliente: Cliente;
  analise: Analise;
  dashboardElementId: string;
}) {
  const { cliente, analise, dashboardElementId } = params;
  const r = analise.resultados_calculo;
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "REC16x9", width: W, height: H });
  pptx.layout = "REC16x9";
  pptx.author = "Record Assessoria Contábil";
  pptx.company = "RECORD HUB";
  pptx.title = `Diagnóstico da Reforma Tributária — ${cliente.razao_social}`;

  const receita = Number(r?.receita_anual ?? 0) || Number(cliente.rbt12 ?? 0);

  // ── Capa ──
  const capa = pptx.addSlide();
  capa.background = { color: NAVY };
  capa.addShape("rect", { x: 0, y: 0, w: 0.18, h: H, fill: { color: GOLD } });
  capa.addText("Record", { x: 0.9, y: 0.7, w: 6, h: 0.8, fontSize: 40, bold: true, color: WHITE, fontFace: "Georgia" });
  capa.addText("RECORD HUB", { x: 0.9, y: 1.5, w: 6, h: 0.3, fontSize: 12, color: GOLD, charSpacing: 3 });
  capa.addText("DIAGNÓSTICO TRIBUTÁRIO COMPLETO", { x: 0.9, y: 2.5, w: 10, h: 0.3, fontSize: 13, color: GOLD, charSpacing: 2 });
  capa.addText("Estudo da Reforma Tributária", {
    x: 0.9, y: 2.85, w: 11, h: 1.0, fontSize: 36, bold: true, color: WHITE, fontFace: "Georgia",
  });
  capa.addText(cliente.razao_social, { x: 0.9, y: 4.2, w: 11, h: 0.6, fontSize: 22, bold: true, color: WHITE });
  capa.addText(
    [
      `CNPJ ${formatCNPJ(cliente.cnpj)} · ${cliente.setor}${cliente.subsetor ? " · " + cliente.subsetor : ""}`,
      `Regime atual: ${cliente.regime_atual}  ·  Receita bruta anualizada: ${formatBRL(receita)}`,
      `Emissão: ${formatDate(new Date().toISOString())}  ·  Engine ${analise.versao_engine ?? "v15"}  ·  Alíquota base CBS ${(Number(r?.cbs_aliquota_base ?? CBS_2027_PADRAO) * 100).toFixed(3)}%`,
    ].join("\n"),
    { x: 0.9, y: 4.9, w: 11, h: 1.2, fontSize: 12, color: "C8C8C8", lineSpacingMultiple: 1.3 },
  );
  capa.addText("Record Assessoria Contábil Ltda · CRC PR-013833 · José A. Custódio", {
    x: 0.9, y: H - 0.6, w: 11, h: 0.3, fontSize: 10, color: GOLD,
  });

  if (r) {
    const elegiveis = r.cenarios.filter((c) => c.elegivel !== false && c.carga_total > 0);
    const ordenados = [...elegiveis].sort((a, b) => a.carga_total - b.carga_total);
    const rec = elegiveis.find((c) => c.regime === r.recomendado) ?? ordenados[0] ?? r.cenarios[0];
    const pior = ordenados[ordenados.length - 1] ?? rec;
    const economia = Math.max(0, pior.carga_total - rec.carga_total);
    const inelegiveis = r.cenarios.filter((c) => c.elegivel === false);

    // ── Sumário executivo ──
    const s = pptx.addSlide();
    chrome(s, "01 · Sumário executivo", "Recomendação");
    s.addShape("rect", { x: 0.7, y: 1.75, w: 6.2, h: 1.9, fill: { color: NAVY } });
    s.addText("REGIME RECOMENDADO", { x: 1.0, y: 1.95, w: 5.6, h: 0.3, fontSize: 11, color: GOLD, charSpacing: 2 });
    s.addText(label(rec.regime), { x: 1.0, y: 2.3, w: 5.6, h: 0.6, fontSize: 26, bold: true, color: WHITE });
    s.addText(
      `Carga ${formatBRL(rec.carga_total)} · ${formatPct(rec.carga_pct)} da receita\nLucro estimado ${formatBRL(rec.lucro_liquido)}`,
      { x: 1.0, y: 2.95, w: 5.6, h: 0.6, fontSize: 12, color: "DCDCDC" },
    );
    s.addShape("rect", { x: 7.1, y: 1.75, w: 5.5, h: 1.9, fill: { color: LIGHT } });
    s.addText("ECONOMIA ANUAL", { x: 7.4, y: 1.95, w: 4.9, h: 0.3, fontSize: 11, color: GOLD, charSpacing: 2 });
    s.addText(formatBRL(economia), { x: 7.4, y: 2.3, w: 4.9, h: 0.6, fontSize: 26, bold: true, color: NAVY });
    s.addText(`vs. ${label(pior.regime)}`, { x: 7.4, y: 2.95, w: 4.9, h: 0.4, fontSize: 12, color: MUTED });
    s.addText(
      `Comparamos os ${elegiveis.length} cenários legalmente aplicáveis, antes e depois da Reforma Tributária (LC 214/2025), sobre a receita bruta anualizada de ${formatBRL(receita)}.` +
        (inelegiveis.length
          ? ` ${inelegiveis.map((c) => label(c.regime)).join(" e ")} ${inelegiveis.length > 1 ? "foram excluídos" : "foi excluído"} por impedimento legal.`
          : ""),
      { x: 0.7, y: 3.9, w: W - 1.4, h: 1.0, fontSize: 13, color: INK },
    );

    // ── Comparativo de regimes ──
    const comp = pptx.addSlide();
    chrome(comp, "02 · Comparativo", "Carga tributária por cenário");
    tabela(
      comp,
      [
        ["Cenário", "Carga total", "% da receita", "Encargos de folha", "Lucro líquido"],
        ...ordenados.map((c) => [
          label(c.regime) + (c.regime === rec.regime ? "  ★" : ""),
          formatBRL(c.carga_total),
          formatPct(c.carga_pct),
          formatBRL(c.encargos_folha ?? 0),
          formatBRL(c.lucro_liquido),
        ]),
      ],
      { y: 1.9, colW: [3.9, 2.2, 1.8, 2.2, 1.8], fontSize: 11, h: 0.45 },
    );
    if (inelegiveis.length) {
      comp.addText(
        inelegiveis
          .map((c) => `${label(c.regime)}: não aplicável — ${c.motivo_inelegibilidade ?? "impedimento legal"}${c.base_legal_inelegibilidade ? ` (${c.base_legal_inelegibilidade})` : ""}`)
          .join("\n"),
        { x: 0.7, y: H - 1.7, w: W - 1.4, h: 0.9, fontSize: 10, color: MUTED },
      );
    }

    // ── Auditoria da CBS 2027 ──
    const auditoria = montarAuditoriaCBS({
      resultados: r as never,
      analise: analise as never,
      cliente: cliente as never,
    });
    if (auditoria) slidesAuditoria(pptx, auditoria);
  }

  // ── Gráficos e tabelas do dashboard ──
  const dashboard = document.getElementById(dashboardElementId);
  if (dashboard) {
    await new Promise((res) => setTimeout(res, 1200));
    const cards = Array.from(dashboard.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
    for (const card of cards) {
      if (card.dataset.exportSkip === "true") continue;
      if (card.offsetHeight < 60 || card.innerText.trim().length < 12) continue;
      const png = await capturar(card);
      if (!png) continue;
      const slide = pptx.addSlide();
      chrome(slide, "Estudo detalhado", card.dataset.exportTitle ?? "Análise");
      const ratio = card.offsetHeight / card.offsetWidth;
      const maxW = W - 1.4;
      const maxH = H - 2.4;
      let w = maxW;
      let h = w * ratio;
      if (h > maxH) { h = maxH; w = h / ratio; }
      slide.addImage({ data: png, x: (W - w) / 2, y: 1.7, w, h });
    }
  }

  // ── Premissas e aviso legal ──
  const fim = pptx.addSlide();
  chrome(fim, "Anexo", "Premissas e aviso legal");
  fim.addText(
    [
      RODAPE_CBS,
      "Diagnóstico baseado nos documentos fornecidos (DRE, Balanço, Folha, Fornecedores e Saídas) e nas alíquotas de referência da LC 214/2025, resolvidas por linha de receita conforme o enquadramento setorial.",
      "As alíquotas definitivas do IBS serão fixadas pelo Comitê Gestor após deliberação do Senado Federal.",
      "Valores são estimativas técnicas e não substituem assessoramento contábil personalizado.",
      "Documento confidencial — uso exclusivo do destinatário identificado na capa.",
    ].map((t) => ({ text: t, options: { bullet: { code: "2022" }, breakLine: true } })),
    { x: 0.8, y: 1.75, w: W - 1.7, h: H - 2.5, fontSize: 11, color: INK, lineSpacingMultiple: 1.15 },
  );

  await pptx.writeFile({ fileName: `diagnostico-reforma-${slug(cliente.razao_social)}.pptx` });
}
