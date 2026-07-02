#!/usr/bin/env node
"use strict";
/* Verifica a sintaxe de todos os <script> inline do index.html sem executá-los.
   Compila com vm.Script (só parseia) — pega erros como o `fontSize:T.xxs.5`
   introduzido acidentalmente numa migração automática, antes de ir pro ar. */
const fs = require("fs");
const vm = require("vm");

const files = ["index.html"];
let failed = false;

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  blocks.forEach((m, i) => {
    try {
      new vm.Script(m[1], { filename: `${file}#inline-script-${i + 1}` });
    } catch (e) {
      failed = true;
      console.error(`✗ Erro de sintaxe em ${file} (script inline #${i + 1}): ${e.message}`);
    }
  });
}

if (failed) {
  process.exit(1);
}
console.log("✓ Sintaxe dos scripts inline OK");
