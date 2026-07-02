#!/usr/bin/env bash
# Prepara o ambiente para rodar lint e testes (usado pelo hook SessionStart
# do Claude Code na web e localmente). Tolerante a falhas de rede: nunca
# bloqueia a sessão.
set -u

if [ -f package-lock.json ]; then
  npm ci >/dev/null 2>&1 || npm install >/dev/null 2>&1 || true
else
  npm install >/dev/null 2>&1 || true
fi

echo "setup: dependências prontas (rode 'npm run verify' para check + lint + smoke)."
