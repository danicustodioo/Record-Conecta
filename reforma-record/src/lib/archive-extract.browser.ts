// Extrai PDFs de arquivos .zip ou .rar no browser e os classifica por tipo
// usando primeiro o nome do arquivo, depois o conteúdo textual.

import { extractPdfText } from "./pdf-extract.browser";

export type TipoDoc = "DRE" | "BALANCO" | "FORNECEDORES" | "FOLHA" | "SAIDAS";

export type ExtractedPdf = {
  file: File;
  tipo: TipoDoc | null;
  origem: "nome" | "conteudo" | "desconhecido";
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

export function classifyByName(name: string): TipoDoc | null {
  const n = normalize(name).replace(/[^A-Z0-9]/g, "");
  if (n.includes("DRE") || n.includes("DEMONSTRA")) return "DRE";
  if (n.includes("BALANC")) return "BALANCO";
  if (n.includes("FORNECEDOR") || n.includes("ENTRADA") || n.includes("COMPRA")) return "FORNECEDORES";
  if (n.includes("FOLHA") || n.includes("PROVENTO") || n.includes("SALARIO")) return "FOLHA";
  if (n.includes("SAIDA") || n.includes("VENDAS")) return "SAIDAS";
  return null;
}

export function classifyByContent(textoPdf: string): TipoDoc | null {
  const t = normalize(textoPdf);
  // DRE
  if (t.includes("DEMONSTRACAO DO RESULTADO") || t.includes("DEMONSTRACAO DE RESULTADO") || /\bDRE\b/.test(t)) return "DRE";
  // Balanço
  if (t.includes("BALANCO PATRIMONIAL") || t.includes("BALANCETE")) return "BALANCO";
  // Folha
  if (t.includes("FOLHA DE PAGAMENTO") || t.includes("RESUMO DA FOLHA") || t.includes("EXTRATO MENSAL") || t.includes("PROVENTOS")) return "FOLHA";
  // Fornecedores (entradas)
  if (
    t.includes("ACOMPANHAMENTO DE ENTRADAS") ||
    t.includes("APURACAO DE ENTRADAS") ||
    (t.includes("FORNECEDOR") && (t.includes("CNPJ") || t.includes("NOTA FISCAL")))
  ) return "FORNECEDORES";
  // Saídas
  if (t.includes("APURACAO DE SAIDAS") || (t.includes("SAIDAS") && (t.includes("ICMS") || t.includes("ISS")))) return "SAIDAS";
  return null;
}

async function classifyOne(file: File): Promise<ExtractedPdf> {
  const byName = classifyByName(file.name);
  if (byName) return { file, tipo: byName, origem: "nome" };
  try {
    const texto = (await extractPdfText(file)).slice(0, 20_000);
    const byContent = classifyByContent(texto);
    if (byContent) return { file, tipo: byContent, origem: "conteudo" };
  } catch {
    // segue como desconhecido
  }
  return { file, tipo: null, origem: "desconhecido" };
}

async function extractZip(file: File): Promise<File[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const pdfs: File[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !entry.name.toLowerCase().endsWith(".pdf")) continue;
    const base = entry.name.split("/").pop() ?? entry.name;
    const blob = await entry.async("blob");
    pdfs.push(new File([blob], base, { type: "application/pdf" }));
  }
  return pdfs;
}

async function extractRar(file: File): Promise<File[]> {
  const { createExtractorFromData } = await import("node-unrar-js");
  const wasmBinary = await fetch("/wasm/unrar.wasm").then((r) => {
    if (!r.ok) throw new Error("Não foi possível carregar suporte a RAR (wasm)");
    return r.arrayBuffer();
  });
  const data = await file.arrayBuffer();
  const extractor = await createExtractorFromData({ data, wasmBinary });
  const extracted = extractor.extract({
    files: (h) => h.name.toLowerCase().endsWith(".pdf"),
  });
  const pdfs: File[] = [];
  for (const f of extracted.files) {
    if (!f.fileHeader.name.toLowerCase().endsWith(".pdf") || !f.extraction) continue;
    const base = f.fileHeader.name.split(/[\\/]/).pop() ?? f.fileHeader.name;
    const buf = f.extraction.buffer.slice(f.extraction.byteOffset, f.extraction.byteOffset + f.extraction.byteLength) as ArrayBuffer;
    pdfs.push(new File([buf], base, { type: "application/pdf" }));
  }
  return pdfs;
}

/**
 * Recebe um arquivo .pdf, .zip ou .rar. Retorna a lista de PDFs já classificados.
 */
export async function extractAndClassify(input: File): Promise<ExtractedPdf[]> {
  const lower = input.name.toLowerCase();
  let pdfs: File[];
  if (lower.endsWith(".zip")) pdfs = await extractZip(input);
  else if (lower.endsWith(".rar")) pdfs = await extractRar(input);
  else if (lower.endsWith(".pdf")) pdfs = [input];
  else throw new Error("Formato não suportado. Use .pdf, .zip ou .rar.");

  if (!pdfs.length) return [];
  // classifica em paralelo (limitado pela quantidade)
  return Promise.all(pdfs.map(classifyOne));
}
