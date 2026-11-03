// Client-side PDF text extraction using pdf.js.
//
// PDFs exportados pelo sistema Domínio usam fontes CIDFont com encoding
// Identity-H. Quando o PDF traz o ToUnicode, o pdf.js consegue mapear os
// caracteres — para isso precisamos apontar os cMaps e as fontes padrão.
// Quando o ToUnicode está ausente (Print to PDF), o texto sai vazio ou
// embaralhado; nesse caso renderizamos as páginas em imagem e usamos OCR
// via IA (Gemini) como fallback automático.

import { GlobalWorkerOptions, getDocument, version } from "pdfjs-dist";

const CDN = `https://unpkg.com/pdfjs-dist@${version}`;

GlobalWorkerOptions.workerSrc = `${CDN}/build/pdf.worker.min.mjs`;

const MAX_OCR_PAGES = 12;

type PdfItem = { str: string; transform: number[]; width: number };

/** Reconstrói linhas preservando a posição horizontal (equivalente a `pdftotext -layout`). */
function itemsToLayoutText(items: PdfItem[]): string {
  const linhas = new Map<number, PdfItem[]>();
  for (const it of items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5] ?? 0);
    // agrupa linhas com até 2pt de diferença
    let chave = y;
    for (const existente of linhas.keys()) {
      if (Math.abs(existente - y) <= 2) {
        chave = existente;
        break;
      }
    }
    const bucket = linhas.get(chave) ?? [];
    bucket.push(it);
    linhas.set(chave, bucket);
  }

  return [...linhas.entries()]
    .sort((a, b) => b[0] - a[0]) // topo → base
    .map(([, bucket]) => {
      const ordenado = bucket.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0));
      let linha = "";
      let cursorX = 0;
      for (const it of ordenado) {
        const x = it.transform[4] ?? 0;
        const col = Math.round(x / 5); // ~5pt por coluna de caractere
        if (col > cursorX) linha += " ".repeat(Math.min(col - cursorX, 200));
        linha += it.str;
        cursorX = col + it.str.length;
      }
      return linha.replace(/\s+$/g, "");
    })
    .filter((l) => l.trim().length > 0)
    .join("\n");
}

/** Detecta texto ilegível (Identity-H sem ToUnicode gera lixo/vazio). */
export function textoIlegivel(texto: string): boolean {
  const limpo = texto.replace(/=== Página \d+ ===/g, "").trim();
  if (limpo.length < 150) return true;

  // Relatórios contábeis usam grandes blocos de espaços para preservar
  // colunas. Esses espaços não podem reduzir artificialmente a taxa de
  // caracteres úteis, senão PDFs com texto perfeito são enviados ao OCR.
  const semEspacos = limpo.replace(/\s/g, "");
  if (semEspacos.length < 100) return true;
  const letras = (limpo.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
  const digitos = (limpo.match(/\d/g) ?? []).length;
  const uteis = letras + digitos;

  // Cabeçalhos reconhecíveis são um sinal forte de que o mapeamento da fonte
  // funcionou, mesmo em relatórios muito espaçados.
  const marcadores = [
    /\bempresa\b/i,
    /\bper[ií]odo\b/i,
    /\btotal\b/i,
    /\bbalan[cç]o\b/i,
    /\bdemonstra[cç][aã]o\b/i,
    /\bfolha de pagamento\b/i,
    /\bcompet[eê]ncia\b/i,
    /\bcnpj\b|c\.n\.p\.j/i,
  ].filter((padrao) => padrao.test(limpo)).length;

  // Sem palavras reconhecíveis ou com muitos caracteres de controle/substituição.
  const suspeitos = (limpo.match(/[\uFFFD\u0000-\u0008\u000E-\u001F]/g) ?? []).length;
  if (suspeitos / semEspacos.length > 0.02) return true;
  if (marcadores >= 2 && letras >= 100) return false;
  return uteis / semEspacos.length < 0.65;
}

async function renderPagesAsJpeg(buf: ArrayBuffer): Promise<string[]> {
  const pdf = await getDocument({
    data: buf.slice(0),
    cMapUrl: `${CDN}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${CDN}/standard_fonts/`,
  }).promise;
  const imagens: string[] = [];
  const total = Math.min(pdf.numPages, MAX_OCR_PAGES);
  for (let p = 1; p <= total; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport } as never).promise;
    imagens.push(canvas.toDataURL("image/jpeg", 0.75));
  }
  return imagens;
}

export async function extractPdfText(
  file: File,
  onFallback?: (nome: string) => void,
  forcarOcr = false,
): Promise<string> {
  const buf = await file.arrayBuffer();

  let texto = "";
  if (!forcarOcr) {
    const pdf = await getDocument({
      data: buf.slice(0),
      cMapUrl: `${CDN}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${CDN}/standard_fonts/`,
    }).promise;

    const parts: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.filter((it) => "str" in it) as unknown as PdfItem[];
      parts.push(`=== Página ${p} ===\n${itemsToLayoutText(items)}`);
    }
    texto = parts.join("\n\n");
    if (!textoIlegivel(texto)) return texto;
  }


  // Fallback: PDF do Domínio sem mapeamento de caracteres (Microsoft Print to
  // PDF / CIDFont sem ToUnicode) → renderiza páginas e transcreve por IA.
  onFallback?.(file.name);
  const { ocrPaginasPdf } = await import("./ocr-pdf.functions");
  const imagens = await renderPagesAsJpeg(buf);
  if (imagens.length === 0) {
    throw new Error("PDF vazio ou corrompido. Exporte novamente pelo Domínio.");
  }
  const res = await ocrPaginasPdf({ data: { imagens } });

  if (!res.ok) {
    throw new Error(res.error ?? "Falha na leitura automática do PDF.");
  }
  if (textoIlegivel(res.texto)) {
    throw new Error(
      "Não foi possível ler este PDF do Domínio. Exporte o relatório novamente (ou em outro formato) e tente de novo.",
    );
  }
  return res.texto;
}
