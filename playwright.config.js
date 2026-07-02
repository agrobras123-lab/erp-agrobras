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
    launchOptions
  },
  webServer: {
    command: "python3 -m http.server 8199",
    port: 8199,
    reuseExistingServer: !process.env.CI
  }
});
