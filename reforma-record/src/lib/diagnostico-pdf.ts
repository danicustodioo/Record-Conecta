// Gera diagnóstico completo em PDF: capa, sumário executivo, pontos fortes/fracos/atenção,
// auditoria do cálculo de CBS 2027 e todas as seções do dashboard renderizadas como imagem.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toCanvas } from "html-to-image";
import { formatBRL, formatCNPJ, formatDate, formatPct } from "@/lib/format";
import { RODAPE_CBS } from "@/lib/enquadramento";
import { montarAuditoriaCBS, notasAuditoriaCBS, type AuditoriaCBS } from "@/lib/auditoria-cbs";



type RegimeKey = "SIMPLES" | "HIBRIDO" | "LP" | "LR" | "LP_2026" | "LP_2027" | "LR_2026" | "LR_2027";
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
  detalhamento: Record<string, number>;
};
type Resultados = {
  recomendado: RegimeKey;
  economia_anual: number;
  cenarios: Cenario[];
  ranking: Cenario[];
  inelegiveis?: Cenario[];
  receita_anual?: number;
  meses_dre?: number;
};
type Cliente = {
  razao_social: string;
  cnpj: string;
  setor: string;
  subsetor: string | null;
  regime_atual: string;
  rbt12: number;
  pct_b2b: number | null;
  num_funcionarios: number | null;
};
type Analise = {
  created_at: string;
  resultados_calculo: Resultados | null;
  dados_dre: Record<string, number | null> | null;
  dados_fornecedores: { fornecedores?: Array<Record<string, number | string | null>> } | null;
};

const REGIME_LABEL: Record<RegimeKey, string> = {
  SIMPLES: "Simples Nacional",
  HIBRIDO: "Simples Híbrido",
  LP: "Lucro Presumido",
  LR: "Lucro Real",
  LP_2026: "Lucro Presumido 2026",
  LP_2027: "Lucro Presumido 2027",
  LR_2026: "Lucro Real 2026",
  LR_2027: "Lucro Real 2027",
};
const label = (r: RegimeKey) => REGIME_LABEL[r] ?? String(r);
const isLR = (r: RegimeKey) => r === "LR" || r === "LR_2026" || r === "LR_2027";
const isLP = (r: RegimeKey) => r === "LP" || r === "LP_2026" || r === "LP_2027";


const NAVY: [number, number, number] = [11, 37, 69];
const GOLD: [number, number, number] = [186, 117, 23];
const INK: [number, number, number] = [40, 40, 40];
const MUTED: [number, number, number] = [110, 110, 110];

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 40;
const CONTENT_W = A4_W - MARGIN * 2;

type Diagnostico = {
  fortes: string[];
  atencao: string[];
  fracos: string[];
  sugestoes: string[];
};

function gerarDiagnostico(cliente: Cliente, analise: Analise, r: Resultados): Diagnostico {
  const elegiveis = r.cenarios.filter((c) => c.elegivel !== false && c.carga_total > 0);
  const ordenados = [...elegiveis].sort((a, b) => a.carga_total - b.carga_total);
  const rec = elegiveis.find((c) => c.regime === r.recomendado) ?? ordenados[0] ?? r.cenarios[0];
  const pior = ordenados[ordenados.length - 1] ?? rec;
  const economia = Math.max(0, pior.carga_total - rec.carga_total);
  const inelegiveis = r.cenarios.filter((c) => c.elegivel === false);
  const dre = (analise.dados_dre ?? {}) as Record<string, number | null>;
  const fator = r.meses_dre && r.meses_dre > 0 ? 12 / r.meses_dre : 1;
  const receita = Number(r.receita_anual ?? 0) || Number(dre.receita_bruta_total ?? 0) * fator || Number(cliente.rbt12 ?? 0);
  const lucro = Number(dre.lucro_liquido ?? 0) * fator;
  const custos = (Number(dre.cmv ?? 0) + Number(dre.csp ?? 0)) * fator;
  const margemBruta = receita > 0 ? (receita - custos) / receita : 0;
  const margemLiquida = receita > 0 ? lucro / receita : 0;
  const pctB2B = Number(cliente.pct_b2b ?? 0);
  const fornecedores = analise.dados_fornecedores?.fornecedores ?? [];

  const fortes: string[] = [];
  const atencao: string[] = [];
  const fracos: string[] = [];
  const sugestoes: string[] = [];

  // Fortes
  if (pior.regime !== rec.regime) {
    fortes.push(
      `Regime recomendado (${label(rec.regime)}) reduz a carga em ${formatBRL(economia)}/ano frente ao pior cenário aplicável (${label(pior.regime)}).`,
    );
  }
  fortes.push(`Carga tributária do regime ótimo: ${formatBRL(rec.carga_total)} (${formatPct(rec.carga_pct)} da receita anualizada de ${formatBRL(receita)}).`);
  if (rec.regime === "SIMPLES") fortes.push("Simplicidade operacional: DAS único com CPP e ISS embutidos (exceto Anexo IV).");
  if (rec.regime === "HIBRIDO" && pctB2B >= 40) fortes.push(`Perfil B2B forte (${pctB2B}%) maximiza o aproveitamento de créditos de IBS/CBS no Simples Híbrido.`);
  if (isLR(rec.regime)) {
    const creditos = rec.detalhamento.pis_cofins_creditos ?? rec.detalhamento.cbs_creditos ?? 0;
    if (creditos > 0) fortes.push(`Créditos sobre compras de ${formatBRL(creditos)}/ano reduzem diretamente o tributo sobre consumo no Lucro Real.`);
    if ((rec.detalhamento.lair ?? 0) <= 0) fortes.push("LAIR negativo zera IRPJ e CSLL e gera prejuízo fiscal compensável em exercícios futuros.");
  }
  if (margemBruta > 0.3) fortes.push(`Margem bruta de ${formatPct(margemBruta)} — saudável para o setor ${cliente.setor}.`);
  if (lucro > 0) fortes.push(`Resultado positivo no período anualizado: ${formatBRL(lucro)} de lucro líquido.`);

  // Atenção
  for (const c of inelegiveis) {
    atencao.push(`${label(c.regime)}: NÃO APLICÁVEL. ${c.motivo_inelegibilidade ?? ""}${c.base_legal_inelegibilidade ? ` (${c.base_legal_inelegibilidade})` : ""}`);
  }
  if (cliente.regime_atual && !label(rec.regime).toUpperCase().includes(cliente.regime_atual.toUpperCase().slice(0, 6))) {
    atencao.push(`Regime atual (${cliente.regime_atual}) difere da recomendação — avaliar transição no início do próximo ano-calendário.`);
  }
  if (rec.regime === "HIBRIDO") {
    atencao.push("Janela única de opção pelo Simples Híbrido: 01 a 30/setembro/2026. Perder o prazo trava o regime por 12 meses.");
  }
  if (pctB2B < 30 && (isLR(rec.regime) || isLP(rec.regime))) {
    atencao.push(`Baixo percentual B2B (${pctB2B}%) limita o repasse do IVA dual — monitorar mix de receita.`);
  }
  if ((rec.encargos_folha ?? 0) === 0 && (rec.cpp_anual ?? 0) === 0 && rec.fgts_anual === 0) {
    atencao.push("Folha de pagamento não computada: CPP e FGTS considerados zero — a carga total real será maior que a projetada.");
  }
  if (fornecedores.length > 0) {
    const top1 = [...fornecedores].sort((a, b) => Number(b.valor_contabil_total ?? 0) - Number(a.valor_contabil_total ?? 0))[0];
    const totalForn = fornecedores.reduce((s, f) => s + Number(f.valor_contabil_total ?? 0), 0);
    const concentr = totalForn > 0 ? Number(top1?.valor_contabil_total ?? 0) / totalForn : 0;
    if (concentr > 0.5) atencao.push(`Concentração de fornecedores: ${formatPct(concentr)} em ${String(top1?.nome_fornecedor ?? "1 fornecedor")} — risco de dependência.`);
  }

  // Fracos
  if (lucro < 0) fracos.push(`Prejuízo anualizado de ${formatBRL(Math.abs(lucro))} — reforça a escolha pelo Lucro Real (compensação de prejuízos fiscais).`);
  if (margemLiquida < 0.05 && margemLiquida >= 0) fracos.push(`Margem líquida apertada (${formatPct(margemLiquida)}) — pouco espaço para absorver aumento de carga em 2027.`);
  if (margemBruta < 0.2 && receita > 0) fracos.push(`Margem bruta baixa (${formatPct(margemBruta)}) — custos diretos (CMV + CSP) elevados em relação à receita.`);
  if (rec.carga_pct > 0.2) fracos.push(`Carga tributária acima de 20% da receita (${formatPct(rec.carga_pct)}) — comprometendo competitividade.`);

  // Sugestões
  if (rec.regime === "HIBRIDO") sugestoes.push("Formalizar a opção pelo Simples Híbrido entre 01 e 30/09/2026 junto à Receita Federal.");
  else if (isLR(rec.regime)) sugestoes.push("Estruturar controle de créditos sobre compras e insumos (PIS/Cofins até 2026, CBS a partir de 2027) — principal vetor de redução da carga no Lucro Real.");
  else sugestoes.push(`Manter o regime ${label(rec.regime)} e revisar a carga após a publicação das alíquotas definitivas do Comitê Gestor IBS.`);
  sugestoes.push("Adequar o ERP/emissor de NF para destaque correto de CBS/IBS a partir de 2026 (alíquota teste) e 2027 (vigência plena).");
  sugestoes.push("Mapear fornecedores elegíveis a crédito integral de IBS/CBS — priorizar parceiros do regime normal ou Simples Híbrido.");
  sugestoes.push("Revisar política de preços para repassar/absorver o impacto do IVA dual sem perda de margem.");
  if (pctB2B < 50) sugestoes.push("Avaliar expansão de receita B2B para ampliar aproveitamento de créditos no novo modelo.");
  sugestoes.push("Monitorar trimestralmente publicações do Comitê Gestor IBS e da RFB para ajustes finos no planejamento.");

  return { fortes, atencao, fracos, sugestoes };
}


// ── helpers de desenho ────────────────────────────────────────────────
function setColor(doc: jsPDF, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]); }
function setFill(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]); }

function drawHeader(doc: jsPDF, subtitulo: string) {
  setFill(doc, NAVY); doc.rect(0, 0, A4_W, 56, "F");
  // Logo "Record • RECORD HUB"
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("Record", MARGIN, 34);
  setFill(doc, GOLD); doc.circle(MARGIN + 56, 28, 2.4, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  setColor(doc, GOLD);
  doc.text("RECORD HUB", MARGIN + 64, 32);
  // subtítulo direita
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  doc.setTextColor(220, 220, 220);
  doc.text(subtitulo, A4_W - MARGIN, 34, { align: "right" });
}

function drawFooter(doc: jsPDF, n: number, total: number) {
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  setColor(doc, MUTED);
  doc.text(
    "Record Assessoria Contábil · CRC PR-013833 · Diagnóstico da Reforma Tributária",
    MARGIN, A4_H - 20,
  );
  doc.text(`${n} / ${total}`, A4_W - MARGIN, A4_H - 20, { align: "right" });
}

function addSectionTitle(doc: jsPDF, y: number, kicker: string, titulo: string): number {
  setColor(doc, GOLD);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(kicker.toUpperCase(), MARGIN, y);
  setColor(doc, NAVY);
  doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  doc.text(titulo, MARGIN, y + 22);
  setFill(doc, GOLD); doc.rect(MARGIN, y + 30, 40, 2, "F");
  return y + 50;
}

function writeBullets(doc: jsPDF, y: number, itens: string[], cor: [number, number, number]): number {
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  for (const it of itens) {
    if (y > A4_H - 60) { doc.addPage(); drawHeader(doc, "Diagnóstico"); y = 80; }
    setFill(doc, cor); doc.circle(MARGIN + 4, y - 3, 2.2, "F");
    setColor(doc, INK);
    const linhas = doc.splitTextToSize(it, CONTENT_W - 16);
    doc.text(linhas, MARGIN + 14, y);
    y += linhas.length * 13 + 6;
  }
  return y + 4;
}

// ── captura de uma seção do DOM como imagem e coloca em página(s) ────
async function captureToPdf(doc: jsPDF, el: HTMLElement, opts: { title?: string }) {
  const canvas = await toCanvas(el, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
    skipFonts: false,
  });
  const imgW = CONTENT_W;
  const ratio = canvas.height / canvas.width;
  const imgH = imgW * ratio;
  // Espaço disponível em cada página (após cabeçalho e título)
  const startY = 80 + (opts.title ? 28 : 0);
  const usableH = A4_H - startY - 40;

  if (imgH <= usableH) {
    doc.addPage();
    drawHeader(doc, "Diagnóstico");
    if (opts.title) {
      setColor(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text(opts.title, MARGIN, 78);
    }
    doc.addImage(canvas.toDataURL("image/png"), "PNG", MARGIN, startY, imgW, imgH, undefined, "FAST");
    return;
  }

  // imagem maior que uma página: fatiar verticalmente
  const pxPerPt = canvas.width / imgW;
  const sliceHPx = Math.floor(usableH * pxPerPt);
  let offsetPx = 0;
  let first = true;
  while (offsetPx < canvas.height) {
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = Math.min(sliceHPx, canvas.height - offsetPx);
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(canvas, 0, -offsetPx);
    doc.addPage();
    drawHeader(doc, "Diagnóstico");
    if (first && opts.title) {
      setColor(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text(opts.title, MARGIN, 78);
    }
    const sliceH = sliceCanvas.height / pxPerPt;
    doc.addImage(sliceCanvas.toDataURL("image/png"), "PNG", MARGIN, first && opts.title ? startY : 80, imgW, sliceH, undefined, "FAST");
    offsetPx += sliceHPx;
    first = false;
  }
}

// ── auditoria do cálculo de CBS 2027 (números intermediários) ─────────
function drawAuditoriaCBS(doc: jsPDF, razaoSocial: string, a: AuditoriaCBS) {
  doc.addPage();
  drawHeader(doc, razaoSocial);
  let y = addSectionTitle(doc, 80, "06 · Auditoria técnica", "Cálculo da CBS 2027");

  setColor(doc, INK); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const intro = doc.splitTextToSize(
    "Memória de cálculo rastreável da Contribuição sobre Bens e Serviços: base anualizada, redução setorial aplicada linha a linha, débito bruto, créditos de fornecedores e saldo credor quando os créditos superam o débito.",
    CONTENT_W,
  );
  doc.text(intro, MARGIN, y);
  y += intro.length * 13 + 10;

  // 1) Anualização
  autoTable(doc, {
    startY: y,
    head: [["1 · Anualização da base", "Valor"]],
    body: [
      ["Meses cobertos pela DRE", a.meses_dre ? `${a.meses_dre}` : "Não identificado"],
      ["Fator de anualização (12 / meses)", a.fator_anualizacao.toFixed(4)],
      ["Receita bruta do período", a.receita_periodo != null ? formatBRL(a.receita_periodo) : "—"],
      ["Receita bruta anualizada (base da CBS)", formatBRL(a.receita_anualizada)],
      ["Alíquota base de CBS", `${(a.aliquota_base * 100).toFixed(3)}%`],
      [
        "Requisito societário (art. 127, §1º, II)",
        a.socios_habilitados === true ? "Confirmado" : a.socios_habilitados === false ? "Não atendido" : "Não informado",
      ],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: INK },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;

  // 2) Redução setorial + débito por linha de receita
  const cenarioLinhas = a.cenarios.find((c) => c.linhas.length) ?? a.cenarios[0];
  if (cenarioLinhas?.linhas.length) {
    if (y > A4_H - 200) { doc.addPage(); drawHeader(doc, razaoSocial); y = 80; }
    setColor(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("2 · Redução setorial e débito por linha de receita", MARGIN, y);
    y += 12;
    autoTable(doc, {
      startY: y,
      head: [["Tipo de receita", "Base anualizada", "Redução", "Alíq. efetiva", "CBS devida", "Fundamento"]],
      body: cenarioLinhas.linhas.map((l) => [
        l.descricao + (l.monofasico ? " (monofásico)" : l.reducao_negada_societaria ? " (redução negada)" : ""),
        formatBRL(l.base),
        formatPct(l.reducao),
        `${(l.aliquota_efetiva * 100).toFixed(3)}%`,
        formatBRL(l.cbs),
        l.artigo,
      ]),
      foot: [[
        "Débito bruto de CBS",
        formatBRL(cenarioLinhas.linhas.reduce((s, l) => s + l.base, 0)),
        "",
        "",
        formatBRL(cenarioLinhas.debito_bruto),
        "",
      ]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: INK },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [240, 236, 226], textColor: NAVY, fontStyle: "bold" },
      columnStyles: {
        1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
        5: { fontSize: 7, textColor: MUTED },
      },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }

  // 3) Débito × crédito × saldo credor por cenário
  if (y > A4_H - 200) { doc.addPage(); drawHeader(doc, razaoSocial); y = 80; }
  setColor(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("3 · Débito, crédito e saldo credor por cenário", MARGIN, y);
  y += 12;
  autoTable(doc, {
    startY: y,
    head: [["Cenário", "Base creditável", "Débito bruto", "Créditos", "CBS a pagar", "Saldo credor"]],
    body: a.cenarios.map((c) => [
      c.rotulo,
      c.base_creditavel > 0 ? formatBRL(c.base_creditavel) : "—",
      formatBRL(c.debito_bruto),
      formatBRL(c.creditos),
      formatBRL(c.cbs_liquido),
      c.saldo_credor > 0 ? formatBRL(c.saldo_credor) : "—",
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: INK },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  // 4) Notas técnicas
  if (y > A4_H - 160) { doc.addPage(); drawHeader(doc, razaoSocial); y = 80; }
  setColor(doc, NAVY); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("4 · Notas técnicas do cálculo", MARGIN, y);
  y += 18;
  writeBullets(doc, y, notasAuditoriaCBS(a), GOLD);
}


// ── função principal ─────────────────────────────────────────────────
export async function gerarDiagnosticoPDF(params: {
  cliente: Cliente;
  analise: Analise;
  dashboardElementId: string;
}) {
  const { cliente, analise, dashboardElementId } = params;
  const r = analise.resultados_calculo;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  // ─── PÁGINA 1 — CAPA ───
  setFill(doc, NAVY); doc.rect(0, 0, A4_W, A4_H, "F");
  // Logo grande
  doc.setFont("helvetica", "bold"); doc.setFontSize(36);
  doc.setTextColor(255, 255, 255);
  doc.text("Record", MARGIN, 110);
  setFill(doc, GOLD); doc.circle(MARGIN + 110, 100, 5, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  setColor(doc, GOLD);
  doc.text("RECORD HUB", MARGIN + 124, 106);

  // Linha decorativa
  setFill(doc, GOLD); doc.rect(MARGIN, 150, 60, 3, "F");

  // Título
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  setColor(doc, GOLD);
  doc.text("DIAGNÓSTICO TRIBUTÁRIO COMPLETO", MARGIN, 180);
  doc.setFont("helvetica", "bold"); doc.setFontSize(34);
  doc.setTextColor(255, 255, 255);
  const tituloLinhas = doc.splitTextToSize("Estudo da Reforma Tributária", CONTENT_W);
  doc.text(tituloLinhas, MARGIN, 220);

  // Cliente
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  setColor(doc, GOLD);
  doc.text("PREPARADO PARA", MARGIN, A4_H / 2 + 20);
  doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  const nomeLinhas = doc.splitTextToSize(cliente.razao_social, CONTENT_W);
  doc.text(nomeLinhas, MARGIN, A4_H / 2 + 46);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  doc.text(
    `CNPJ ${formatCNPJ(cliente.cnpj)} · ${cliente.setor}${cliente.subsetor ? " · " + cliente.subsetor : ""}`,
    MARGIN, A4_H / 2 + 46 + nomeLinhas.length * 24,
  );
  doc.text(`Regime atual: ${cliente.regime_atual}`, MARGIN, A4_H / 2 + 64 + nomeLinhas.length * 24);
  const receitaCapa = Number(r?.receita_anual ?? 0) || Number(cliente.rbt12 ?? 0);
  doc.text(`Receita bruta anualizada: ${formatBRL(receitaCapa)}`, MARGIN, A4_H / 2 + 78 + nomeLinhas.length * 24);

  // Rodapé capa
  setFill(doc, GOLD); doc.rect(MARGIN, A4_H - 100, 30, 2, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  setColor(doc, GOLD);
  doc.text("EMISSÃO", MARGIN, A4_H - 80);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(formatDate(new Date().toISOString()), MARGIN, A4_H - 64);
  doc.setFontSize(9);
  doc.setTextColor(180, 180, 180);
  doc.text("Record Assessoria Contábil Ltda · CRC PR-013833 · José A. Custódio", MARGIN, A4_H - 44);

  // Bloco 14B — cabeçalho técnico do cálculo na capa
  const anyAn = analise as unknown as {
    aliquota_cbs_utilizada?: number | null;
    data_base_calculo?: string | null;
    versao_engine?: string | null;
    conferido_por?: string | null;
  };
  // Alíquota BASE parametrizada (não a efetiva média por linha de receita).
  const aliqUsada = Number((r as unknown as { cbs_aliquota_base?: number })?.cbs_aliquota_base ?? 0.088);
  doc.setFontSize(8);
  setColor(doc, GOLD);
  doc.text(
    [
      `Data-base do cálculo: ${formatDate(anyAn.data_base_calculo ?? new Date().toISOString())}`,
      `Alíquota base de CBS: ${(aliqUsada * 100).toFixed(3)}%  ·  Versão da engine: ${anyAn.versao_engine ?? (r as unknown as { versao_engine?: string })?.versao_engine ?? "v14"}`,
      `Documentos conferidos por: ${anyAn.conferido_por ?? "não registrado"}`,
    ].join("\n"),
    A4_W - MARGIN,
    A4_H - 80,
    { align: "right" },
  );

  // ─── PÁGINA 2 — SUMÁRIO EXECUTIVO ───
  if (r) {
    const elegiveis = r.cenarios.filter((c) => c.elegivel !== false && c.carga_total > 0);
    const ordenados = [...elegiveis].sort((a, b) => a.carga_total - b.carga_total);
    const rec = elegiveis.find((c) => c.regime === r.recomendado) ?? ordenados[0] ?? r.cenarios[0];
    const pior = ordenados[ordenados.length - 1] ?? rec;
    const economia = Math.max(0, pior.carga_total - rec.carga_total);
    const inelegiveis = r.cenarios.filter((c) => c.elegivel === false);
    const diag = gerarDiagnostico(cliente, analise, r);

    doc.addPage();
    drawHeader(doc, `${cliente.razao_social}`);
    let y = addSectionTitle(doc, 80, "01 · Sumário executivo", "Recomendação");

    // Box recomendação destacado
    setFill(doc, NAVY); doc.rect(MARGIN, y, CONTENT_W, 96, "F");
    setFill(doc, GOLD); doc.rect(MARGIN, y, 4, 96, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    setColor(doc, GOLD);
    doc.text("REGIME RECOMENDADO", MARGIN + 18, y + 22);
    doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(label(rec.regime), MARGIN + 18, y + 50);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.setTextColor(220, 220, 220);
    doc.text(
      `Carga: ${formatBRL(rec.carga_total)}  ·  ${formatPct(rec.carga_pct)} da receita  ·  Lucro estimado ${formatBRL(rec.lucro_liquido)}`,
      MARGIN + 18, y + 70,
    );
    // Economia
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    setColor(doc, GOLD);
    doc.text("ECONOMIA ANUAL", A4_W - MARGIN - 18, y + 22, { align: "right" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text(formatBRL(economia), A4_W - MARGIN - 18, y + 50, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.setTextColor(220, 220, 220);
    doc.text(`vs. ${label(pior.regime)}`, A4_W - MARGIN - 18, y + 66, { align: "right" });
    y += 116;

    // Resumo narrativo
    setColor(doc, INK); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const excluidos = inelegiveis.length
      ? ` ${inelegiveis.map((c) => label(c.regime)).join(" e ")} ${inelegiveis.length > 1 ? "foram excluídos" : "foi excluído"} da comparação por impedimento legal.`
      : "";
    const intro = `Após análise dos demonstrativos financeiros, perfil de receita e estrutura de custos da ${cliente.razao_social}, comparamos os ${elegiveis.length} cenários tributários legalmente aplicáveis, antes e depois da Reforma Tributária (LC 214/2025). O regime ${label(rec.regime)} apresenta a menor carga projetada sobre a receita bruta anualizada de ${formatBRL(receitaCapa)}.${excluidos}`;
    const introLin = doc.splitTextToSize(intro, CONTENT_W);
    doc.text(introLin, MARGIN, y);
    y += introLin.length * 13 + 18;


    // PONTOS FORTES
    y = addSectionTitle(doc, y, "02", "Pontos fortes");
    y = writeBullets(doc, y, diag.fortes, [30, 130, 76]);

    // PONTOS DE ATENÇÃO
    if (y > A4_H - 160) { doc.addPage(); drawHeader(doc, cliente.razao_social); y = 80; }
    y = addSectionTitle(doc, y, "03", "Pontos de atenção");
    y = writeBullets(doc, y, diag.atencao.length ? diag.atencao : ["Nenhum ponto crítico identificado nesta análise."], GOLD);

    // PONTOS FRACOS
    if (y > A4_H - 160) { doc.addPage(); drawHeader(doc, cliente.razao_social); y = 80; }
    y = addSectionTitle(doc, y, "04", "Pontos fracos");
    y = writeBullets(doc, y, diag.fracos.length ? diag.fracos : ["Nenhum ponto fraco material identificado."], [180, 50, 50]);

    // SUGESTÕES
    if (y > A4_H - 160) { doc.addPage(); drawHeader(doc, cliente.razao_social); y = 80; }
    y = addSectionTitle(doc, y, "05", "Sugestões e plano de ação");
    y = writeBullets(doc, y, diag.sugestoes, NAVY);

    // ─── AUDITORIA DO CÁLCULO DE CBS 2027 ───
    const auditoria = montarAuditoriaCBS({
      resultados: r as never,
      analise: analise as never,
      cliente: cliente as never,
    });
    if (auditoria) drawAuditoriaCBS(doc, cliente.razao_social, auditoria);
  }


  // ─── CAPTURA O DASHBOARD ───
  const dashboard = document.getElementById(dashboardElementId);
  if (dashboard) {
    // Esperar as animações dos gráficos terminarem antes de capturar
    await new Promise((res) => setTimeout(res, 1200));
    const cards = Array.from(dashboard.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
    let counter = 6;
    for (const card of cards) {
      // Pular o banner de prazo (já mencionado no sumário)
      if (card.dataset.exportSkip === "true") continue;
      // Pular seções vazias ou ainda em carregamento (evita páginas em branco)
      if (card.offsetHeight < 60 || card.innerText.trim().length < 12) continue;
      const titulo = card.dataset.exportTitle ?? `Seção ${String(counter).padStart(2, "0")}`;
      await captureToPdf(doc, card, { title: titulo });
      counter++;
    }

  }

  // ─── DISCLAIMER FINAL ───
  doc.addPage();
  drawHeader(doc, cliente.razao_social);
  let yF = addSectionTitle(doc, 80, "Anexo", "Premissas e aviso legal");
  setColor(doc, INK); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const disclaimer = [
    RODAPE_CBS,
    "Este diagnóstico é baseado nos documentos fornecidos pela empresa (DRE, Balanço, Folha, Fornecedores e Saídas) e nas alíquotas de referência da Lei Complementar 214/2025, resolvidas por linha de receita conforme o enquadramento setorial de cada atividade.",
    "As alíquotas definitivas do IBS serão fixadas pelo Comitê Gestor IBS após deliberação do Senado Federal e podem sofrer ajustes. As tabelas do Simples Nacional consideradas são as vigentes na data de emissão.",
    "A janela de opção pelo Simples Híbrido ocorre exclusivamente entre 01 e 30 de setembro de 2026. Empresas que não optarem permanecerão no regime atual por 12 meses.",
    "Os valores apresentados são estimativas técnicas e não substituem o assessoramento contábil personalizado. Recomenda-se revisão trimestral à medida que novas normas forem publicadas.",
    "Documento confidencial — uso exclusivo do destinatário identificado na capa.",
  ];

  for (const p of disclaimer) {
    const lin = doc.splitTextToSize(p, CONTENT_W);
    doc.text(lin, MARGIN, yF);
    yF += lin.length * 13 + 10;
  }

  // ── numerar e rodapé em todas as páginas (menos capa) ──
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    drawFooter(doc, i, total);
  }

  doc.save(`diagnostico-reforma-${slug(cliente.razao_social)}.pdf`);
}

function slug(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
