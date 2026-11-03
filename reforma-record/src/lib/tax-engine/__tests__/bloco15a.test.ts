// Bloco 15A — critérios de aceite com o caso real J. MORAIS AZI SERVIÇOS MÉDICOS (competência 09/2026).
// Rodar: npm test
//
// Premissas do caso:
// - RBT12 de R$ 299.000 (aproximação, implícita no relatório do Domínio).
// - Folha 12 meses estimada em R$ 130.000 (pró-labore de R$ 8.475,55/mês + 1 CLT + FGTS).
//   Só é usada para o Fator R, que precisa dar > 40%.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularTodos,
  calcSimples,
  calcSimples2027,
  calcHibrido,
  creditoTransferido,
  precoEquilibrio,
  type InputCalculo,
} from "../calc";
import { aliquotas2027, PARAMETROS_PADRAO } from "../parametros";
import { encontrarFaixa, partilhaSimples, somaPartilha, TABELA_SIMPLES } from "../simples-tabelas";
import { analisarFatorR } from "../fator-r";
import { aliquotaEfetiva as aliquotaSetorial, regimePorTipo } from "@/lib/enquadramento";

const RECEITA = 35_119.1;

const jMorais: InputCalculo = {
  setor: "Saúde",
  anexo: "ANEXO_III",
  rbt12: 299_000,
  receita_anual: RECEITA, // um mês: o motor calcula sobre o período informado
  receita_servicos: RECEITA,
  receita_mercadorias: 0,
  base_fgts_anual: 0,
  folha_base_anual: 0,
  folha_12m: 130_000,
  pct_receita_iss_retido: 11_819.1 / RECEITA,
  pct_b2b: 100,
  fornecedores: [
    {
      nome: "Fornecedores (regime Normal)",
      regime: "NORMAL",
      compras_anuais: 1_822.8,
      cnpj: "00.000.000/0001-00",
    },
  ],
  linhas_receita: [{ tipo_receita: "saude_anexo_iii", valor_anualizado: RECEITA }],
  perfil_clientes: [{ categoria: "pj_regime_regular", percentual: 1 }],
  regime_atual: "SIMPLES_III",
  data_calculo: "2026-11-03",
};

const perto = (real: number, esperado: number, tol: number, msg: string) =>
  assert.ok(
    Math.abs(real - esperado) <= tol,
    `${msg}: obtido ${real}, esperado ${esperado} ± ${tol}`,
  );

test("parâmetros 2027 derivados: CBS 11,20%, IBS 0,10%", () => {
  const a = aliquotas2027(PARAMETROS_PADRAO);
  perto(a.cbs, 0.112, 1e-9, "CBS 2027");
  perto(a.ibs, 0.001, 1e-9, "IBS 2027");
  perto(a.iva, 0.113, 1e-9, "IVA 2027");
});

test("1 e 2 — alíquotas efetivas de saúde (−60%): CBS 4,48% e IBS 0,04%", () => {
  const a = aliquotas2027();
  const saude = regimePorTipo("saude_anexo_iii");
  perto(aliquotaSetorial(saude, a.cbs, null), 0.0448, 1e-9, "CBS saúde");
  perto(aliquotaSetorial(saude, a.ibs, null), 0.0004, 1e-9, "IBS saúde");
});

test("3 — partilha CBS+IBS do Anexo III, 2ª faixa, 2027–2028 = 17,10%", () => {
  const f = encontrarFaixa(299_000, "ANEXO_III");
  assert.equal(f.faixa, 2);
  const p = partilhaSimples("ANEXO_III", f, 2027, 0.08);
  perto(p.cbs + p.ibs, 0.171, 1e-9, "CBS+IBS");
});

test("tabelas: toda faixa soma 100% e confere os valores conhecidos de 2027–2028", () => {
  for (const [anexo, faixas] of Object.entries(TABELA_SIMPLES)) {
    for (const f of faixas)
      assert.equal(somaPartilha(f.partilha), 100, `${anexo} faixa ${f.faixa}`);
  }
  const conhecidos: Array<[keyof typeof TABELA_SIMPLES, number, number, number]> = [
    ["ANEXO_I", 1, 15.33, 0.17],
    ["ANEXO_I", 2, 15.33, 0.17],
    ["ANEXO_I", 3, 15.33, 0.17],
    ["ANEXO_I", 5, 15.33, 0.17],
    ["ANEXO_II", 1, 13.85, 0.15],
    ["ANEXO_III", 1, 15.43, 0.17],
    ["ANEXO_IV", 1, 21.26, 0.24],
    ["ANEXO_IV", 5, 21.76, 0.24],
    ["ANEXO_V", 1, 16.96, 0.19],
    ["ANEXO_V", 4, 18.94, 0.21],
  ];
  for (const [anexo, faixa, cbs, ibs] of conhecidos) {
    const f = TABELA_SIMPLES[anexo][faixa - 1];
    const p = partilhaSimples(anexo, f, 2027, 0.01); // alíquota baixa: sem teto de ISS
    perto(p.cbs * 100, cbs, 1e-9, `${anexo} faixa ${faixa} CBS`);
    perto(p.ibs * 100, ibs, 1e-9, `${anexo} faixa ${faixa} IBS`);
  }
});

test("teto de 5% do ISS no Anexo III, 5ª faixa, redistribui o excedente", () => {
  const f = TABELA_SIMPLES.ANEXO_III[4];
  const aliq = (3_600_000 * f.aliquota - f.parcela) / 3_600_000; // 17,51%
  const p = partilhaSimples("ANEXO_III", f, 2026, aliq);
  assert.ok(p.teto_iss_aplicado);
  perto(aliq * p.iss, 0.05, 1e-12, "ISS efetivo");
  const soma = p.irpj + p.csll + p.pis + p.cofins + p.cpp + p.iss;
  perto(soma, 1, 1e-12, "soma");
  perto(p.irpj / (1 - p.iss), 0.0602, 1e-4, "IRPJ do excedente (6,02%)");
});

test("4 — cenário A: carga atual R$ 2.528,78", () => {
  const A = calcSimples(jMorais);
  perto(A.detalhamento.das_a_recolher, 2_528.78, 0.05, "DAS a recolher");
});

test("5 — cenário B: Simples unificado 2027 ≈ cenário A (variação < 1%)", () => {
  const A = calcSimples(jMorais);
  const B = calcSimples2027(jMorais);
  const varia =
    Math.abs(B.detalhamento.das_a_recolher - A.detalhamento.das_a_recolher) /
    A.detalhamento.das_a_recolher;
  assert.ok(varia < 0.01, `variação de ${varia}`);
});

test("6 — cenário C: DAS reduzido R$ 2.044,17", () => {
  const C = calcHibrido(jMorais);
  perto(C.detalhamento.das_reduzido_a_recolher, 2_044.17, 0.05, "DAS reduzido");
});

test("7 — Fator R > 40% → Anexo III", () => {
  const f = analisarFatorR(130_000, 299_000);
  assert.ok(f.fator_r > 0.4);
  assert.equal(f.anexo, "ANEXO_III");
  const r = calcularTodos(jMorais);
  assert.equal(r.anexo_utilizado, "ANEXO_III");
});

test("8, 9 e 10 — crédito transferido e reajuste de equilíbrio", () => {
  const cB = creditoTransferido(jMorais, "unificado");
  const cC = creditoTransferido(jMorais, "regular");
  perto(cB, 0.0138, 0.0005, "crédito transferido B");
  perto(cC, 0.0452, 0.0001, "crédito transferido C");
  perto(precoEquilibrio(cB, cC), 0.033, 0.001, "reajuste de equilíbrio");
});

test("11 — recomendação: manter o Simples unificado, salvo repasse confirmado", () => {
  const r = calcularTodos(jMorais);
  assert.equal(r.recomendado, "SIMPLES");
  const d = r.simples_decisao;
  assert.ok(d);
  assert.equal(d!.recomenda_regime_regular, false);
  assert.match(d!.recomendacao, /Manter o Simples unificado/);
  assert.equal(r.versao_engine, "v15");
  assert.ok(r.janela_cancelamento_aberta, "03/11/2026 está dentro da janela de cancelamento");
});

test("optou pelo regime regular com cenário desfavorável → alerta de prioridade máxima", () => {
  const r = calcularTodos({ ...jMorais, optou_regime_regular: true });
  assert.ok(r.simples_decisao?.alerta_cancelamento);
  assert.match(r.alertas[0], /PRIORIDADE MÁXIMA/);
});

test("sem RBT12 no cadastro: usa a receita anualizada da DRE com aviso", () => {
  const r = calcularTodos({ ...jMorais, rbt12: 0, receita_anual: 300_000 });
  assert.equal(r.rbt12_fonte, "DRE_ANUALIZADA");
  assert.ok(r.alertas.some((a) => a.includes("RBT12 não informada")));
});

test("crédito de fornecedor do Simples segue art. 47, §9º, II", () => {
  const base: InputCalculo = {
    ...jMorais,
    fornecedores: [
      {
        regime: "SIMPLES_SEM_HIBRIDO",
        anexo: "ANEXO_I",
        faixa: 1,
        compras_anuais: 10_000,
        cnpj: "x",
      },
    ],
  };
  const C = calcHibrido(base);
  // 10.000 × 4% (1ª faixa do Anexo I) × 15,33% (CBS) e × 0,17% (IBS)
  perto(C.detalhamento.cbs_creditos, 10_000 * 0.04 * 0.1533, 1e-6, "crédito CBS");
  perto(C.detalhamento.ibs_creditos, 10_000 * 0.04 * 0.0017, 1e-6, "crédito IBS");
});
