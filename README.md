# ERP Financeiro Agro Bras

PWA de gestão financeira agrícola (vendas, compras, despesas, vencimentos,
salários e fechamento), com funcionamento offline e sincronização em nuvem.

## Arquitetura

Aplicativo **estático, sem etapa de build**: todo o app vive em `index.html`
(React 18 via CDN, sem JSX — usa `React.createElement` através do helper `ce`).
Os dados são persistidos no **Firestore** (via REST) e há fallback offline em
`localStorage`. É um **PWA** (`manifest.json` + `sw.js`), instalável no celular.

| Arquivo           | Papel                                                        |
| ----------------- | ------------------------------------------------------------ |
| `index.html`      | O app inteiro (UI, estado, lógica financeira, tokens, auth). |
| `sw.js`           | Service worker (cache offline). Bump o `CACHE` ao publicar.  |
| `manifest.json`   | Metadados do PWA.                                            |
| `logo-intro.html` | Tela de marca/intro (usa a fonte Cinzel).                    |
| `preview.html`    | Preview isolado de componentes de design.                    |

### Design tokens

Definidos no topo do script em `index.html`:

- `T` — escala tipográfica (`xxs:10 … xxxl:28`).
- `FONT` — famílias: `ui` (Inter) e `brand` (Cinzel).
- `W` — pesos de fonte (`med:600`, `bold:700`, `heavy:800`).
- `LH` — line-heights. `C` — cores. `RAD` — raios. `SH` — sombras.

Ao adicionar UI, **use os tokens** em vez de valores fixos em pixel.

## Desenvolvimento

Não é necessário build para rodar: abra `index.html` por um servidor estático
(o `crypto.subtle` do login exige contexto seguro, então use `localhost`, não
`file://`):

```bash
python3 -m http.server 8199   # depois acesse http://127.0.0.1:8199/index.html
```

### Qualidade (lint, sintaxe e testes)

```bash
npm install          # dependências de desenvolvimento
npm run check        # valida a sintaxe dos scripts inline do index.html
npm run lint         # ESLint (index.html + sw.js)
npm run format:check # Prettier (arquivos de tooling; o app é ignorado de propósito)
npm test             # teste de fumaça headless (sobe o app e confere que renderiza)
npm run verify       # tudo acima
```

O teste de fumaça (`tests/smoke.spec.js`) é **hermético** — React vem de
`tests/vendor/` e Firestore/fontes são interceptados, sem depender de rede. Ele
existe para pegar quebras (ex.: um erro de sintaxe que deixaria o app em branco)
antes de ir pro ar. O mesmo conjunto roda no **CI** (`.github/workflows/ci.yml`).

> ⚠️ **Nunca remova `serviceWorkers: "block"` do `playwright.config.js`.** O
> `sw.js` intercepta as chamadas do Firestore e as refaz de dentro do service
> worker, e requisições de service worker **não passam** pelo `page.route` do
> Playwright. Sem esse bloqueio os testes conversam com o Firestore **real** e
> gravam a fixture por cima dos dados de produção — foi exatamente o que
> aconteceu em 17/09/2026. O stub também aborta qualquer host externo não
> previsto e o teste falha se algo escapar.

## Proteção de dados

Três camadas garantem que um lançamento não suma:

1. **Backup antes de sobrescrever** — cada alteração grava o estado anterior em
   `/backups/backup_<data>_<hora>` e só depois atualiza o documento principal
   (`safePatch` em `index.html`). Nenhuma gravação chega à nuvem sem ponto de
   retorno.
2. **Trava anti-apagamento** — uma gravação que zeraria a base (nenhum registro
   em vendas, compras, despesas, funcionários e adiantamentos) é bloqueada
   quando o último estado conhecido tinha registros; a nuvem fica intacta e a
   barra de status avisa.
3. **Espelho no aparelho** — o último estado íntegro fica em
   `localStorage['erp_agb_lastgood']`. Se a nuvem voltar vazia, o app carrega
   esse espelho em vez de começar do zero e devolve os dados na gravação
   seguinte.

Para restaurar manualmente um ponto no tempo: **Mais → Config → Backups**, que
lista os pontos salvos na nuvem, além de exportar/importar JSON.

## Folha de pagamento

- **Desligar funcionário** (`ativo: false` + `dataSaida`) tira o funcionário da
  lista de ativos sem apagar nada: vales, salários e o fechamento dos meses
  passados continuam como estavam. Ele fica em **Desligados**, com histórico
  acessível, e pode ser religado.
- **Excluir** só funciona para cadastro sem histórico. Com vales ou salários
  lançados, a exclusão é recusada (na interface e em `delFunc`) — quem sai da
  empresa é desligado, nunca excluído.
- **Salário variável** (`salarioVariavel: true`) é para quem não tem base fixa:
  o card mostra o total retirado no mês em vez de saldo a pagar, e o botão
  **Fechar mês** encerra o mês com o que foi retirado, sem valor-alvo e sem
  gerar despesa (os vales do mês já são o custo). Os meses encerrados ficam em
  `mesesFechados` no cadastro e podem ser reabertos. Funcionário com base fixa
  segue com o fluxo de sempre.

## Publicação

Como é estático, publicar = servir os arquivos do repositório (ex.: GitHub
Pages no escopo `/erp-agrobras/`). Lembre de **incrementar `CACHE` em `sw.js`**
a cada release. O service worker busca o **HTML pela rede primeiro** (para que
atualizações apareçam na hora, caindo no cache só quando offline) e mantém os
demais assets em cache-first.

## Roadmap de melhorias

- [x] **Fase 0 — Tipografia e design tokens.** Unificação Inter/Cinzel, adoção
      da escala `T`, redução de pesos, line-height.
- [x] **Fase 3 — Fundação de engenharia.** ESLint, Prettier, teste de fumaça e
      CI. _(Rewrite para Vite/módulos fica como passo opt-in — mudaria o modelo
      de deploy e o fluxo de edição.)_
- [x] **Fase 4 — Polimento de UX.** Export/import de backup local em JSON;
      acessibilidade. _(Confirmação de exclusão e backup/restore em nuvem já
      existiam.)_
- [ ] **Fase 1 — Segurança.** Auditar/travar as Security Rules do Firestore e
      migrar para Firebase Authentication (hoje a auth é só no cliente e a chave
      fica exposta). **Prioridade real, adiada a pedido.**
- [ ] **Fase 2 — Modelo de dados.** Sair do documento único do Firestore (limite
      de 1 MB) para subcoleções; backups rotativos; proteção de concorrência.
