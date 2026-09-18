"use strict";
const fs = require("fs");
const { defineConfig, devices } = require("@playwright/test");

// Em ambientes com Chromium pré-instalado (ex.: Claude Code na web), aponta o
// executável direto. Em CI, `npx playwright install chromium` provê o browser.
const preinstalled = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchOptions = fs.existsSync(preinstalled) ? { executablePath: preinstalled } : {};

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:8199",
    ...devices["Desktop Chrome"],
    // CRÍTICO: sem isto o service worker (sw.js) registra durante o teste e
    // refaz os fetches do app de dentro dele. Requisições feitas por service
    // worker NÃO passam pelo page.route do Playwright, então as chamadas ao
    // Firestore escapariam do stub e chegariam ao banco de PRODUÇÃO — os
    // testes já chegaram a sobrescrever os dados reais assim. Bloquear o SW
    // garante que todo tráfego do app passe pelas rotas interceptadas.
    serviceWorkers: "block",
    launchOptions
  },
  webServer: {
    command: "python3 -m http.server 8199",
    port: 8199,
    reuseExistingServer: !process.env.CI
  }
});
