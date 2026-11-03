// Server function: receives raw PDF text + tipo de documento, retorna JSON
// estruturado extraído via Lovable AI Gateway (Gemini 3 Flash).

import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider, mensagemErroIA } from "./ai-gateway";

const TipoSchema = z.enum(["DRE", "BALANCO", "FORNECEDORES", "FOLHA", "SAIDAS"]);

const SCHEMAS = {
  DRE: z.object({
    receita_bruta_total: z.number().nullable(),
    receita_servicos: z.number().nullable(),
    receita_mercadorias: z.number().nullable(),
    simples_nacional_pago: z.number().nullable(),
    cmv: z.number().nullable(),
    csp: z.number().nullable(),
    despesas_pessoal: z.number().nullable(),
    despesas_administrativas: z.number().nullable(),
    despesas_financeiras: z.number().nullable(),
    receitas_financeiras: z.number().nullable(),
    outras_receitas: z.number().nullable(),
    lucro_liquido: z.number().nullable(),
    periodo_inicio: z.string().nullable(),
    periodo_fim: z.string().nullable(),
  }),
  BALANCO: z.object({
    ativo_total: z.number().nullable(),
    ativo_circulante: z.number().nullable(),
    disponivel_caixa: z.number().nullable(),
    contas_receber: z.number().nullable(),
    estoques: z.number().nullable(),
    ativo_nao_circulante: z.number().nullable(),
    imobilizado: z.number().nullable(),
    passivo_circulante: z.number().nullable(),
    fornecedores_a_pagar: z.number().nullable(),
    obrigacoes_tributarias: z.number().nullable(),
    simples_a_recolher: z.number().nullable(),
    obrigacoes_trabalhistas: z.number().nullable(),
    patrimonio_liquido: z.number().nullable(),
    capital_social: z.number().nullable(),
    periodo: z.string().nullable(),
  }),
  FORNECEDORES: z.object({
    empresa_cliente_nome: z.string().nullable(),
    empresa_cliente_cnpj: z.string().nullable(),
    periodo_inicio: z.string().nullable(),
    periodo_fim: z.string().nullable(),
    total_geral: z.number().nullable(),
    fornecedores: z.array(
      z.object({
        nome: z.string(),
        valor_contabil_total: z.number(),
        tipo_predominante: z.enum(["ICMS", "ISS", "SEM_IMPOSTO"]).nullable().optional(),
        tem_icms: z.boolean().optional(),
        tem_iss: z.boolean().optional(),
        base_calculo: z.number().nullable().optional(),
        valor_ipi: z.number().nullable().optional(),
        linhas_nf: z.number().nullable().optional(),
      }),
    ),
  }),
  FOLHA: z.object({
    competencias: z.array(
      z.object({
        competencia: z.string(),
        total_proventos: z.number().nullable(),
        total_descontos: z.number().nullable(),
        liquido_geral: z.number().nullable(),
        base_fgts: z.number().nullable(),
        valor_fgts: z.number().nullable(),
        fgts_rescisorio: z.number().nullable(),
        fgts_rm: z.number().nullable().optional(),
        fgts_ra: z.number().nullable().optional(),
        fgts_13_salario: z.number().nullable().optional(),
        fgts_aprendiz: z.number().nullable().optional(),
        inss_empregados: z.number().nullable(),
        inss_prolabore: z.number().nullable(),
        cpp_patronal: z.number().nullable().optional(),
        terceiros: z.number().nullable().optional(),
        gps_total: z.number().nullable().optional(),
        prolabore_mensal: z.number().nullable(),
        numero_funcionarios: z.number().nullable(),
        numero_trabalhando: z.number().nullable(),
        numero_ferias: z.number().nullable(),
        numero_afastados: z.number().nullable(),
        numero_demitidos: z.number().nullable(),
        admissoes: z.number().nullable(),
        numero_contribuintes: z.number().nullable(),
      }),
    ),
  }),
  SAIDAS: z.object({
    total_saidas_icms: z.number().nullable(),
    total_saidas_iss: z.number().nullable(),
    total_servicos_prestados: z.number().nullable(),
    periodo: z.string().nullable(),
  }),
} as const;

const SYSTEM = `Você é um especialista em contabilidade brasileira.
Extraia dados de documentos contábeis exportados pelo sistema Domínio (Thomson Reuters).
Regras estritas:
- Valores monetários em REAIS como números (sem R$, sem pontos de milhar; use ponto decimal).
- Datas no formato YYYY-MM-DD.
- Campos não encontrados devem ser null.
- Não invente valores. Se o documento for ambíguo, retorne null.
- Responda somente com JSON válido. Não use markdown, comentários ou explicações.

FOLHA DE PAGAMENTO (relatórios do Domínio):
- O PDF repete o resumo "PREVIDENCIA SOCIAL - GPS" / "FUNDO DE GARANTIA - FGTS" várias vezes:
  uma vez por locação/estabelecimento (linhas "TOTAL GERAL DA LOCACAO ...") e uma vez consolidado
  ("TOTAL GERAL DA EMPRESA"). Use SOMENTE o bloco consolidado da empresa, que é o de maior valor.
  NUNCA some blocos de locações diferentes — isso duplica os valores.
- Uma competência por bloco consolidado. Mapeie:
  "TOTAL PARTE EMPRESA" -> cpp_patronal
  "TOTAL DA GPS" -> gps_total
  "(+) TERCEIROS" (total) -> terceiros
  "TOTAL BASE DO FGTS" -> base_fgts
  "TOTAL DA GFIP" -> valor_fgts (é o TOTAL do FGTS do mês, soma de TODAS as linhas de FGTS)
- ATENÇÃO ao FGTS: o bloco "FUNDO DE GARANTIA - FGTS" tem várias linhas
  ("FGTS R.M." remuneração mensal, "FGTS R.A." rescisão/aviso, "FGTS 13. SALARIO",
  "FGTS APRENDIZ"/"FGTS MENOR APRENDIZ"). Devolva cada uma em fgts_rm, fgts_ra,
  fgts_13_salario e fgts_aprendiz, e em valor_fgts o TOTAL DA GFIP (soma de todas).
  NUNCA use apenas o FGTS R.M. como valor_fgts.
  "Colaboradores" na parte de retenção -> inss_empregados
  "Contribuintes Individuais"/pró-labore -> inss_prolabore
- Se o PDF tiver mais de uma competência (ex.: 01/2026 e 04/2026), devolva uma entrada por competência.`;

function extractJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("A extração não retornou JSON válido.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function schemaHint(tipo: z.infer<typeof TipoSchema>) {
  const schema = SCHEMAS[tipo] as z.ZodTypeAny;
  const keys = Object.keys((schema as z.AnyZodObject).shape ?? {});
  return keys.map((key) => `"${key}"`).join(", ");
}

export const extrairDocumento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      tipo: TipoSchema,
      texto_pdf: z.string().min(1).max(400_000),
    }).parse,
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY ausente — habilite o AI Gateway em Lovable Cloud.");
    }
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    try {
      const extras = data.tipo === "FORNECEDORES" ? `
INSTRUÇÕES ESPECÍFICAS PARA "ACOMPANHAMENTO DE ENTRADAS" (Domínio):
- O cabeçalho do relatório identifica a EMPRESA CLIENTE (nome e CNPJ) — NÃO é fornecedor.
- Cada bloco "Fornecedor: NOME" inicia um novo fornecedor; consolide todas as linhas seguintes até o próximo "Fornecedor:" ou "Total Geral".
- Em cada linha, IGNORE o "1" inicial (contador de NFs). O primeiro número subsequente é o valor contábil.
- Coluna "Tipo": "ICMS" => mercadorias (provável regime normal); "ISS" => serviços com retenção; vazio/ausente => sem destaque (provável Simples ou isento).
- Para cada fornecedor: valor_contabil_total = SOMA de todas as linhas do bloco; tem_icms = true se aparecer "ICMS" em qualquer linha; tem_iss = true se aparecer "ISS"; tipo_predominante = ICMS|ISS|SEM_IMPOSTO conforme maioria.
- Use 'Total Geral' apenas para conferência (campo total_geral).
- Datas no formato BR (dd/mm/aaaa) devem ser convertidas para YYYY-MM-DD.
- Valores BR (1.234,56) viram 1234.56.
` : "";
      const { text } = await generateText({
        model,
        system: SYSTEM,
        prompt: `Tipo de documento: ${data.tipo}

Retorne um objeto JSON com estas chaves principais: ${schemaHint(data.tipo)}.
Use null para campo ausente. Para listas, use array vazio quando não houver linhas legíveis.
${extras}
=== DOCUMENTO ===
${data.texto_pdf.slice(0, 350_000)}`,
      });
      const parsed = extractJsonObject(text);
      const validated = (SCHEMAS[data.tipo] as z.ZodTypeAny).safeParse(parsed);
      if (validated.success) return { ok: true as const, json: JSON.stringify(validated.data) };
      return { ok: true as const, json: JSON.stringify(parsed) };
    } catch (e) {
      const msg = mensagemErroIA(e);
      console.error("[extrairDocumento] falha:", e);
      return { ok: false as const, error: msg };
    }
  });
