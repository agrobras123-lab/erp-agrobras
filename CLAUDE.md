# Preferências de trabalho (Claude)

Regras permanentes combinadas com o dono do repositório. Valem para qualquer
sessão, em qualquer tarefa deste projeto.

## Pull requests

- **Não vigiar PRs por conta própria.** Nada de assinar eventos do PR, agendar
  check-ins ou ficar acompanhando CI/reviews depois de abrir ou mesclar um PR.
- Só acompanhar um PR quando o dono pedir explicitamente ("vigia esse PR",
  "acompanha o CI", "fica de olho"). Quando pedir, acompanhar até ele ser
  mesclado ou fechado — ou até mandar parar.
- Abrir o PR, relatar o resultado e encerrar o turno é o comportamento padrão.

## Contexto do projeto

O app inteiro vive em `index.html` (React via CDN, sem build). Detalhes de
arquitetura, tokens de design e comandos de verificação estão no `README.md`;
antes de mexer, rodar `npm run verify` (sintaxe + ESLint + testes de fumaça).
