#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { helpText, parseCli } from "./index.js";

const parsed = parseCli(process.argv.slice(2));

if (parsed.command === "help") {
  console.log(helpText());
  process.exit(0);
}

if (parsed.command === "check") {
  const root = process.cwd();
  const required = ["package.json"];
  const missing = required.filter((file) => !existsSync(resolve(root, file)));
  if (missing.length) {
    console.error(`OneStack check failed: missing ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("OneStack check: project structure looks valid.");
  process.exit(0);
}

console.log(`OneStack ${parsed.command}: command registered; runtime integration is the next implementation step.`);
