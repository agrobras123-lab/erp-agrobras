"use strict";
/* Teste de fumaça hermético: sobe o app real (index.html) num Chromium headless,
   com React servido de tests/vendor e o Firestore/fontes interceptados — nenhuma
   rede necessária. Garante que o app parseia e renderiza; um erro de sintaxe deixa
   o #root vazio e o teste falha. */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const V = path.join(__dirname, "vendor");
const reactJs = fs.readFileSync(path.join(V, "react.js"));
const reactDomJs = fs.readFileSync(path.join(V, "react-dom.js"));

const today = new Date().toISOString().slice(0, 10);
const sample = {
  vendas: [{ id: "v1", data: today, pix: 1000, dinheiro: 0, fiado: 0, cartao: 0, boleto: 0 }],
  compras: [],
  despesas: [
    {
      id: "e1",
      data: today,
      descricao: "Energia",
      categoria: "Outros",
      tipo: "Fixo",
      valor: 200,
      status: "A Pagar",
      vencimento: today
    }
  ],
  funcionarios: [],
  adiantamentos: [],
  catsDespesa: ["Outros"],
  catsCompra: ["Outros"]
};

async function stub(page, payload) {
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (u.includes("firestore.googleapis.com")) {
      if (route.request().method() === "GET") {
        const body = payload
          ? JSON.stringify({ fields: { payload: { stringValue: JSON.stringify(payload) } } })
          : "{}";
        return route.fulfill({ status: 200, contentType: "application/json", body });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    if (u.includes("unpkg.com")) {
      return route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: u.includes("react-dom") ? reactDomJs : reactJs
      });
    }
    if (u.includes("fonts.googleapis.com")) {
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    }
    if (u.includes("fonts.gstatic.com")) {
      return route.fulfill({ status: 200, body: "" });
    }
    return route.continue();
  });
}

test("tela de login renderiza sem sessão", async ({ page }) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await stub(page, null);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("agb-intro", "1");
    } catch (e) {}
  });
  await page.goto("/index.html");
  await expect(page.getByText("Bem-vindo de volta")).toBeVisible({ timeout: 15000 });
  expect(errs, "erros de JS não capturados: " + errs.join("; ")).toEqual([]);
});

test("dashboard autenticado renderiza com dados", async ({ page }) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await stub(page, sample);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("erp_agb_s4", JSON.stringify({ nome: "Murilo", role: "admin" }));
      sessionStorage.setItem("agb-intro", "1");
    } catch (e) {}
  });
  await page.goto("/index.html");
  await expect(page.getByText("Painel Financeiro")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "Registros" })).toBeVisible();
  expect(errs, "erros de JS não capturados: " + errs.join("; ")).toEqual([]);
});

test("backup local: exporta e importa JSON", async ({ page }) => {
  await stub(page, sample);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("erp_agb_s4", JSON.stringify({ nome: "Murilo", role: "admin" }));
      sessionStorage.setItem("agb-intro", "1");
    } catch (e) {}
  });
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Mais" }).click();
  await page.getByText("⚙️ Config").first().click();

  // Exportar dispara o download de um arquivo agrobras_backup_*.json
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar backup em JSON" }).click()
  ]);
  expect(download.suggestedFilename()).toContain("agrobras_backup_");

  // Importar um backup com uma despesa nova pede confirmação e aplica os dados
  const imported = {
    ...sample,
    despesas: [
      {
        id: "imp1",
        data: today,
        descricao: "REGISTRO IMPORTADO",
        categoria: "Outros",
        tipo: "Fixo",
        valor: 999,
        status: "A Pagar"
      }
    ]
  };
  await page.setInputFiles('input[type="file"]', {
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported))
  });
  await expect(page.getByText(/Importar substituirá/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar importação" }).click();

  await page.getByRole("button", { name: "Registros" }).click();
  await expect(page.getByText("REGISTRO IMPORTADO")).toBeVisible({ timeout: 10000 });
});

test("fechamento contabiliza a folha de funcionários (vales + salários)", async ({ page }) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const folha = {
    vendas: [],
    compras: [],
    despesas: [
      {
        id: "va1",
        data: today,
        descricao: "Vale — João",
        categoria: "Funcionários",
        tipo: "Fixo",
        valor: 300,
        status: "Pago",
        _adiantId: "a1"
      },
      {
        id: "sa1",
        data: today,
        descricao: "Salário — João",
        categoria: "Funcionários",
        tipo: "Fixo",
        valor: 700,
        status: "Pago",
        _salFuncId: "f1",
        _salMes: today.slice(0, 7)
      }
    ],
    funcionarios: [{ id: "f1", nome: "João", salarioBase: 1000, ativo: true }],
    adiantamentos: [
      {
        id: "a1",
        funcId: "f1",
        data: today,
        mesRef: today.slice(0, 7),
        valor: 300,
        descricao: "Vale"
      }
    ],
    catsDespesa: ["Funcionários", "Outros"],
    catsCompra: ["Outros"]
  };
  await stub(page, folha);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("erp_agb_s4", JSON.stringify({ nome: "Murilo", role: "admin" }));
      sessionStorage.setItem("agb-intro", "1");
    } catch (e) {}
    window.print = () => {};
  });
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Mais" }).click();
  await page.getByText("📊 Fechamento").first().click();

  // A seção dedicada da folha aparece com o total (vale 300 + salário 700 = 1000)
  await expect(page.getByText("Funcionários (Folha)")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Total despesa funcionários")).toBeVisible();
  await expect(page.getByText("R$ 1.000,00").first()).toBeVisible();

  // O PDF também discrimina a folha de pagamento
  await page.getByRole("button", { name: "Gerar relatório em PDF" }).click();
  await expect
    .poll(() => page.locator("#agb-print").innerHTML())
    .toContain("Funcionários (folha de pagamento)");
  expect(errs, "erros de JS não capturados: " + errs.join("; ")).toEqual([]);
});

test("fechamento gera relatório PDF e config tem lembretes", async ({ page }) => {
  await stub(page, sample);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("erp_agb_s4", JSON.stringify({ nome: "Murilo", role: "admin" }));
      sessionStorage.setItem("agb-intro", "1");
    } catch (e) {}
    window.print = () => {}; // evita abrir o diálogo de impressão no headless
  });
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Mais" }).click();

  // Fechamento -> Gerar PDF preenche o container de impressão com o relatório
  await page.getByText("📊 Fechamento").first().click();
  await page.getByRole("button", { name: "Gerar relatório em PDF" }).click();
  await expect
    .poll(() => page.locator("#agb-print").innerHTML())
    .toContain("Relatório de Fechamento");

  // Config expõe o controle de lembretes de vencimento
  await page.getByText("⚙️ Config").first().click();
  await expect(page.getByText("Lembretes de vencimento")).toBeVisible({ timeout: 10000 });
});
