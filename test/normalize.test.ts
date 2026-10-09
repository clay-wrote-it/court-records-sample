import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeBatch,
  normalizeCaseNumber,
  normalizeFilingDate,
  normalizePartyName,
  parseDocketEntry,
} from "../src/normalize.js";
import { DocketParseError, type RawDocketEntry } from "../src/model.js";

const fixtures = JSON.parse(
  readFileSync(new URL("../../fixtures/docket-entries.json", import.meta.url), "utf8"),
) as RawDocketEntry[];

test("party names written different ways normalize to the same key", () => {
  const variants = ["PLACEHOLDER, JANE Q.", "Jane Q. Placeholder", "  jane   q placeholder "];
  const normalized = new Set(variants.map(normalizePartyName));
  assert.deepEqual([...normalized], ["JANE Q PLACEHOLDER"]);

  assert.equal(normalizePartyName("Example, John, Jr."), "JOHN EXAMPLE JR");
  assert.equal(normalizePartyName("John Example Jr"), "JOHN EXAMPLE JR");
});

test("case numbers and dates are canonicalized; bad input is rejected", () => {
  assert.equal(normalizeCaseNumber("sample 24 cv 77"), "SAMPLE-2024-CV-000077");
  assert.equal(normalizeFilingDate("7/2/2024"), "2024-07-02");
  assert.equal(normalizeFilingDate("2024-03-14"), "2024-03-14");
  assert.throws(() => normalizeFilingDate("02/30/2024"), DocketParseError);
  assert.throws(() => normalizeCaseNumber("NOT-A-CASE"), DocketParseError);
});

test("parseDocketEntry produces the documented model", () => {
  const entry = parseDocketEntry(fixtures[0]!);
  assert.equal(entry.caseNumber, "SAMPLE-2024-CR-000101");
  assert.equal(entry.filingDate, "2024-03-14");
  assert.deepEqual(
    entry.parties.map((p) => [p.role, p.normalizedName]),
    [
      ["plaintiff", "STATE OF EXAMPLE"],
      ["defendant", "JANE Q PLACEHOLDER"],
    ],
  );
  assert.match(entry.dedupeKey, /^[0-9a-f]{16}$/);
});

test("batch: cosmetic re-deliveries collapse, distinct filings survive, bad rows are reported", () => {
  const result = normalizeBatch(fixtures);
  assert.equal(result.entries.length, 3);
  assert.equal(result.duplicatesDropped, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]!.index, 4);

  // Same case, different filing date and description -> two separate entries.
  const civil = result.entries.filter((e) => e.caseNumber === "SAMPLE-2024-CV-000077");
  assert.equal(civil.length, 2);
});
