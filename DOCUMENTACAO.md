# Record Conecta — Painel Interno

Painel interno do escritório com **login por colaborador**, dados **compartilhados ao vivo**
entre todos (nada se perde) e **acesso por setor**. Feito em um único arquivo
(`index.html` — a página principal do site) com backend real no **Supabase**
(banco de dados + autenticação na nuvem).

---

## 1. O que o painel tem

**Para todos os colaboradores (painel geral):**
- **Início** — visão geral: próximos compromissos, treinamentos, exigências em aberto e progresso do plano estratégico.
- **Calendário** — agenda visual mensal com reuniões, treinamentos e compromissos de todos os setores.
- **Reuniões** — reuniões programadas (com clientes e internas), com filtro por setor.
- **Treinamentos** — capacitações agendadas para a equipe.
- **Resultados de Reunião** — registro de resumo, decisões e próximos passos das reuniões (com clientes e internas).

**Pessoal (cada colaborador vê apenas o dele):**
- **Meu Setor** — relatórios de performance, exigências (com atualização de status) e feedbacks específicos do colaborador.

**Gerência (acesso a tudo):**
- **Plano Estratégico** — os 6 projetos do *Record Hub* por prazo (curto/médio/longo), tarefas com checkbox e responsável (Dani / Marcus V. / Ambos), barras de progresso e métricas.
- **Performance & Feedback** — cria e gerencia relatórios de performance, exigências e feedbacks de qualquer colaborador/setor.
- **Colaboradores** — cadastra novos acessos, edita setor/cargo, promove à gerência, redefine senha e remove.

---

## 2. Acessos de login (criados)

**Senha padrão de todos: `record2026`** — troque no primeiro acesso (Gerência → Colaboradores → 🔑).

| E-mail | Nome | Setor | Acesso |
|---|---|---|---|
| `dani@recordconecta.com.br` | Daniela Custódio | Gerência | **Gerência (tudo)** |
| `marcus@recordconecta.com.br` | Marcus Vinícius | Gerência | **Gerência (tudo)** |
| `contabil@recordconecta.com.br` | Ana — Contábil | Contábil | Colaborador |
| `fiscal@recordconecta.com.br` | Bruno — Fiscal | Fiscal | Colaborador |
| `pessoal@recordconecta.com.br` | Carla — Pessoal | Pessoal | Colaborador |
| `paralegal@recordconecta.com.br` | Diego — Paralegal | Paralegal | Colaborador |

> Os nomes/e-mails dos setores são exemplos. A gerência pode editar, renomear e criar
> os acessos reais dos colaboradores direto no painel (aba **Colaboradores**).

---

## 3. Como o acesso funciona (segurança)

Regras aplicadas no banco (Row Level Security — testadas e confirmadas):

- **Painel geral** (calendário, reuniões, treinamentos, resultados, plano estratégico):
  **todos os colaboradores autenticados visualizam**. Qualquer colaborador pode *adicionar*
  itens; editar/excluir apenas o autor ou a gerência.
- **Dados sensíveis** (performance, exigências, feedbacks): o colaborador vê **somente os dele**
  (ou os do seu setor). **Só a gerência** cria/edita esses itens.
- **Plano estratégico**: todos visualizam; **só a gerência** edita.
- **Gerência**: acesso total a tudo.

Nada é apagado ao trocar de aba — os dados ficam salvos no banco e aparecem para todos,
em qualquer dispositivo, atualizando ao vivo.

---

## 4. Como publicar (deixar no ar)

O painel é o arquivo **`index.html`** (a página principal) — um único arquivo, funciona em
qualquer hospedagem estática.

**Opção A — GitHub Pages (grátis):**
1. No GitHub: *Settings → Pages*.
2. Em *Source*, selecione a branch e a pasta raiz.
3. O painel abrirá direto no endereço principal: `https://<seu-usuario>.github.io/Record-Conecta/`.

**Opção B — qualquer host estático** (Vercel, Netlify, hospedagem do escritório):
basta subir o `index.html`.

> A página antiga foi preservada em `site-antigo.html` (continua acessível, mas não abre mais
> automaticamente na frente).

---

## 5. Backend (Supabase)

- **Projeto:** `record-conecta-dashboard` (novo, separado — o projeto "record dashboard" **não foi tocado**).
- **Região:** São Paulo (sa-east-1).
- **URL da API:** `https://cwrafyrozbbtbzwolhwy.supabase.co`
- A chave pública (*publishable key*) já está embutida no `index.html`. Ela é feita para
  ficar no navegador — a proteção real dos dados é o RLS descrito acima, não a chave.

**Tabelas:** `profiles`, `eventos`, `resultados_reuniao`, `relatorios_performance`,
`exigencias`, `feedbacks`, `plano_estrategico`, `plano_tarefas`.

**Edge Function `gerenciar-colaborador`:** cria/edita/remove logins de colaboradores com
segurança (só a gerência aciona; a senha nunca fica exposta no navegador).

### Recomendações opcionais de segurança
- No painel do Supabase (*Authentication → Policies/Passwords*), ative a **proteção contra
  senhas vazadas** (HaveIBeenPwned) para reforçar as senhas.
- Peça para cada colaborador trocar a senha padrão no primeiro acesso.

---

## 6. Observações
- Requer conexão com a internet (usa o Supabase na nuvem).
- Funciona em celular e computador (layout responsivo).
- Os arquivos antigos (`site-antigo.html`, `celular*.html`) são a versão anterior e continuam intactos.
