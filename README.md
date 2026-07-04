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
