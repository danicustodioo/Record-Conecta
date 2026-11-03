# Plano: 4 melhorias na análise

Vou entregar uma melhoria por vez. A cada entrega você revisa, e eu sigo para a próxima.

---

## Entrega 1 — Gestão de arquivos e cenários

**Onde:** wizard de upload em `src/routes/_authenticated/analises/$id.tsx` e listagem em `src/routes/_authenticated/analises.tsx`.

- Botão `×` em cada arquivo da lista de uploads → remove apenas aquele arquivo (chama `documentos` delete + storage).
- Botão "Substituir todos" no card de cada tipo (DRE, Balanço, etc.) → limpa o tipo inteiro e reabre o seletor.
- Menu "Novo cenário" no topo da página da análise, com dropdown:
  - **Duplicar este cenário**: cria nova `analises` clonando `dados_*`, `cliente_id`, status `RASCUNHO`.
  - **Começar do zero**: cria nova `analises` em branco vinculada ao mesmo `cliente_id`.
- Listagem de análises passa a agrupar por cliente, mostrando todos os cenários como "Cenário 1, Cenário 2…" para facilitar comparação.

---

## Entrega 2 — Upload de ZIP/RAR com identificação automática

**Onde:** novo componente de dropzone + nova lib `src/lib/archive-extract.browser.ts`.

- Aceita `.pdf`, `.zip`, `.rar` no input.
- ZIP: usa `jszip` (já compatível browser).
- RAR: usa `node-unrar-js` com WASM (suporta browser).
- Após extrair, para cada PDF chama `extractPdfText` (já existe) e classifica o tipo procurando strings-chave no texto:
  - "DEMONSTRAÇÃO DO RESULTADO" → DRE
  - "BALANÇO PATRIMONIAL" → BALANCO
  - "Acompanhamento de Entradas" / "Fornecedor:" → FORNECEDORES
  - "EXTRATO MENSAL" / "FOLHA DE PAGAMENTO" → FOLHA
  - "Saídas" + ICMS/ISS → SAIDAS
- UI mostra lista classificada com dropdown para corrigir manualmente se errou.
- Confirma → roda extração via `extrairDocumento` em paralelo.

---

## Entrega 3 — Diagnóstico IA enriquecido

**Onde:** novo `src/lib/diagnostico-ia.functions.ts` + integração no `AnalysisDashboard`.

- Server function `gerarDiagnosticoIA` usando `google/gemini-2.5-pro` via Lovable AI Gateway.
- Recebe `analise_id`, monta prompt com TODOS os números reais (DRE, balanço, folha, fornecedores, resultados de cálculo por regime).
- Retorna JSON estruturado via tool calling:
  ```ts
  {
    pontos_positivos: [{ titulo, descricao, valor_referencia }],  // 4-5
    pontos_alerta:    [{ titulo, descricao, prazo, impacto_rs }], // 3-4
    solucoes:         [{ titulo, descricao, data_acao, ganho_estimado_rs }] // 3-4
  }
  ```
- Salva em `analises.diagnostico_ia` (nova coluna jsonb) para não re-gerar a cada visita.
- Botão "Regenerar diagnóstico" para forçar nova chamada.
- Exibido em 3 cards (verde / âmbar / azul) acima das recomendações.

**Migração necessária:** adicionar coluna `diagnostico_ia jsonb` em `analises`.

---

## Entrega 4 — Relatório completo

**Onde:** estende `AnalysisDashboard` e `diagnostico-pdf.ts` + `r.$token.tsx`.

Novas seções no relatório (PDF e link público):

1. **Resumo executivo** (3 parágrafos): gerado pela IA junto com o diagnóstico — "o que muda", "por que o regime recomendado vence", "o que fazer agora".
2. **Tabela de impacto financeiro**: comparativo lado-a-lado dos 3 regimes (Simples / LP / LR) com resultado líquido anual + contextualização ("equivale a X salários mínimos/ano", "X% da receita bruta").
3. **Linha do tempo até 2033**: timeline visual com marcos da reforma (mai/2026 início, jan/2027 obrigatório, 2029-2032 transição, 2033 fim Simples atual) intercalada com ações específicas para a empresa (data + ação + responsável).

Tudo já vem com animações Framer Motion e entra automaticamente no PDF (via `html-to-image`) e no link público (já compartilha o mesmo componente).

---

## Detalhes técnicos

- **Banco**: 1 migração nova (`analises.diagnostico_ia jsonb`).
- **Dependências novas**: `jszip`, `node-unrar-js`.
- **IA**: Gemini 2.5 Pro via `LOVABLE_API_KEY` (já configurado).
- **Sem mudanças** em auth, RLS, ou estrutura do app.

Entrega 1 começa assim que aprovar.
