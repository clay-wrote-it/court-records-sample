import { readFileSync } from "node:fs";
import { normalizeBatch } from "./normalize.js";
import type { RawDocketEntry } from "./model.js";

const path = process.argv[2];
if (!path) {
  console.error("usage: node dist/src/cli.js <fixture.json>");
  process.exit(1);
}
const raws = JSON.parse(readFileSync(path, "utf8")) as RawDocketEntry[];
const result = normalizeBatch(raws);
console.log(JSON.stringify(result, null, 2));
