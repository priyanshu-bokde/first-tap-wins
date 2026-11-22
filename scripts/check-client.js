const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("index.html", "utf8");
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
let checked = 0;

for (let i = 0; i < scripts.length; i++) {
  const attributes = scripts[i][1] || "";
  const source = scripts[i][2] || "";
  if (/\bsrc\s*=/.test(attributes) || !source.trim()) continue;
  new vm.Script(source, { filename: `index.html:inline-script-${i + 1}` });
  checked++;
}

console.log(`Client JavaScript syntax OK (${checked} inline scripts checked).`);
