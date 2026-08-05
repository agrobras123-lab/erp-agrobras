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

test("lança várias despesas no mesmo dia sem reabrir o modal", async ({ page }) => {
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

  // Abre o modal de novo lançamento (padrão: despesa)
  await page.getByRole("button", { name: "Novo registro" }).click();
  await page.locator('input[placeholder="0,00"]').fill("50");
  await page.locator('input[placeholder="Ex: Conta de luz"]').fill("Despesa A");
  await page.locator(".modal-sheet select").first().selectOption("Outros");

  // "Salvar e lançar outra" mantém o modal aberto e a data
  await page.getByRole("button", { name: /Salvar e lançar outra/ }).click();
  await expect(page.getByText(/1 lançamento adicionado/)).toBeVisible();

  // O segundo lançamento reaproveita data/categoria; só o valor/descrição são novos
  await page.locator('input[placeholder="0,00"]').fill("70");
  await page.locator('input[placeholder="Ex: Conta de luz"]').fill("Despesa B");
  await page.getByRole("button", { name: "Salvar e fechar" }).click();

  // Ambas aparecem nos Registros
  await page.getByRole("button", { name: "Registros" }).click();
  await expect(page.getByText("Despesa A")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Despesa B")).toBeVisible();
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

const mesCur = today.slice(0, 7);
const folhaBase = {
  vendas: [],
  compras: [],
  despesas: [
    {
      id: "vale1",
      data: today,
      descricao: "Vale — João",
      categoria: "Funcionários",
      tipo: "Fixo",
      valor: 300,
      status: "Pago",
      _adiantId: "a1"
    }
  ],
  funcionarios: [{ id: "f1", nome: "João", salarioBase: 1000, ativo: true }],
  adiantamentos: [
    { id: "a1", funcId: "f1", data: today, mesRef: mesCur, valor: 300, descricao: "Vale" }
  ],
  catsDespesa: ["Funcionários", "Outros"],
  catsCompra: ["Outros"]
};

async function authGoto(page, payload) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("erp_agb_s4", JSON.stringify({ nome: "Murilo", role: "admin" }));
      sessionStorage.setItem("agb-intro", "1");
    } catch (e) {}
    window.print = () => {};
  });
  await stub(page, payload);
  await page.goto("/index.html");
}

test("salário: paga na data real e vira despesa só-leitura em Registros", async ({ page }) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await authGoto(page, folhaBase);

  await page.getByRole("button", { name: "Mais" }).click();
  await page.getByText("👥 Salários").first().click();
  await page.getByRole("button", { name: "Expandir funcionário" }).click();
  // Salário = base 1000 − vales 300 = 700
  await page.getByRole("button", { name: /Pagar — / }).click();
  await expect(page.getByText(/Salário pago:/)).toBeVisible({ timeout: 10000 });

  // Em Registros, vale e salário ficam só-leitura (badge de folha, sem editar)
  await page.getByRole("button", { name: "Registros" }).click();
  await expect(page.getByText("Salário ref.", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("🔒 Salários").first()).toBeVisible();

  expect(errs, "erros de JS não capturados: " + errs.join("; ")).toEqual([]);
});

test("salário: estorno remove a despesa de salário", async ({ page }) => {
  await authGoto(page, folhaBase);
  await page.getByRole("button", { name: "Mais" }).click();
  await page.getByText("👥 Salários").first().click();
  await page.getByRole("button", { name: "Expandir funcionário" }).click();
  await page.getByRole("button", { name: /Pagar — / }).click();
  await expect(page.getByText(/Salário pago:/)).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "↩ Estornar salário" }).click();
  await page.getByRole("button", { name: "Confirmar estorno" }).click();
  // Volta a oferecer o pagamento
  await expect(page.getByRole("button", { name: /Pagar — / })).toBeVisible({ timeout: 10000 });
});

test("duplicar lançamento abre o modal como novo", async ({ page }) => {
  await authGoto(page, sample);
  await page.getByRole("button", { name: "Registros" }).click();
  await page.getByRole("button", { name: "Duplicar registro" }).first().click();
  await expect(page.getByText("Novo Lançamento")).toBeVisible();
  await expect(page.locator('input[placeholder="Ex: Conta de luz"]')).toHaveValue("Energia");
});

test("excluir mostra toast com Desfazer e restaura o registro", async ({ page }) => {
  await authGoto(page, sample);
  await page.getByRole("button", { name: "Registros" }).click();
  await expect(page.getByText("Energia")).toBeVisible();
  await page.getByRole("button", { name: "Excluir registro" }).first().click();
  await page.getByRole("button", { name: "OK" }).click();
  await expect(page.getByText("Despesa excluída")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("Energia")).toBeVisible();
});

test("fechamento mostra comparativo mensal e salários exporta folha", async ({ page }) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await authGoto(page, folhaBase);
  await page.getByRole("button", { name: "Mais" }).click();
  await page.getByText("📊 Fechamento").first().click();
  await expect(page.getByText("Comparativo mensal", { exact: false })).toBeVisible({
    timeout: 10000
  });

  // Folha em PDF preenche o container de impressão
  await page.getByText("👥 Salários").first().click();
  await page.getByRole("button", { name: "Gerar folha em PDF" }).click();
  await expect.poll(() => page.locator("#agb-print").innerHTML()).toContain("Folha de Pagamento");
  expect(errs, "erros de JS não capturados: " + errs.join("; ")).toEqual([]);
});

test("fechamento: calendário abre o dia e permite ver/editar/adicionar", async ({ page }) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await authGoto(page, sample); // 1 venda + 1 despesa ("Energia") em `today`
  await page.getByRole("button", { name: "Mais" }).click();
  await page.getByText("📊 Fechamento").first().click();

  // O calendário aparece no Fechamento
  await expect(page.getByText("Calendário de lançamentos")).toBeVisible({ timeout: 10000 });

  // O dia de hoje está destacado com 2 lançamentos; abre o detalhe do dia
  const dayNum = Number(today.slice(8, 10));
  await page.getByRole("button", { name: `Dia ${dayNum}, 2 lançamentos`, exact: true }).click();
  await expect(page.getByText("Venda do dia")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Energia")).toBeVisible();

  // "＋ Despesa" abre o modal Novo já com a data do dia
  await page.getByRole("button", { name: "＋ Despesa" }).click();
  await expect(page.getByText("Novo Lançamento")).toBeVisible();
  await expect(page.locator('.modal-sheet input[type="date"]').first()).toHaveValue(today);
  await page.getByRole("button", { name: "Fechar" }).click();

  // Reabre o dia e REMOVE a venda pelo calendário (com confirmação e "Desfazer")
  await page.getByRole("button", { name: `Dia ${dayNum}, 2 lançamentos`, exact: true }).click();
  await page.getByRole("button", { name: "Excluir" }).first().click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Venda excluída")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Venda do dia")).toHaveCount(0);

  // O lançamento restante ainda edita normalmente (mesmo caminho do modal do App)
  await page.getByRole("button", { name: /Energia/ }).click();
  await expect(page.getByText("Editar Lançamento")).toBeVisible();
  await expect(page.locator('input[placeholder="Ex: Conta de luz"]')).toHaveValue("Energia");
  await page.getByRole("button", { name: "Fechar" }).click();

  // A remoção reflete no contador do dia (agora 1) e some do Registros
  await expect(
    page.getByRole("button", { name: `Dia ${dayNum}, 1 lançamento`, exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Registros" }).click();
  await page.getByRole("button", { name: /Vendas/ }).click();
  await expect(page.getByText("Venda do dia")).toHaveCount(0);
  await expect(page.getByText("Nenhum registro")).toBeVisible();

  expect(errs, "erros de JS não capturados: " + errs.join("; ")).toEqual([]);
});
