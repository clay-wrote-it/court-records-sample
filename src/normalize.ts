import { createHash } from "node:crypto";
import {
  DocketParseError,
  type DocketEntry,
  type Party,
  type PartyRole,
  type RawDocketEntry,
} from "./model.js";

const SUFFIXES = new Set(["JR", "SR", "II", "III", "IV"]);
const ROLES: Record<string, PartyRole> = {
  plaintiff: "plaintiff",
  plf: "plaintiff",
  defendant: "defendant",
  def: "defendant",
  dft: "defendant",
  petitioner: "petitioner",
  respondent: "respondent",
};

/**
 * Canonicalize a fake-format case number.
 * Accepts "sample 2024 cr 101", "SAMPLE-2024-CR-0101", "Sample-24-cr-101".
 * Returns "SAMPLE-2024-CR-000101".
 */
export function normalizeCaseNumber(input: string): string {
  const parts = input.trim().toUpperCase().split(/[\s\-_/]+/).filter(Boolean);
  if (parts.length !== 4 || parts[0] !== "SAMPLE") {
    throw new DocketParseError(`Unrecognized case number: "${input}"`, "caseNumber");
  }
  const [, yearRaw, type, seqRaw] = parts as [string, string, string, string];
  if (!/^\d{2}(\d{2})?$/.test(yearRaw) || !/^[A-Z]{2}$/.test(type) || !/^\d{1,6}$/.test(seqRaw)) {
    throw new DocketParseError(`Malformed case number: "${input}"`, "caseNumber");
  }
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  return `SAMPLE-${year}-${type}-${seqRaw.padStart(6, "0")}`;
}

/**
 * Parse "MM/DD/YYYY", "M/D/YYYY" or "YYYY-MM-DD" into "YYYY-MM-DD".
 * Rejects impossible dates (e.g. 02/30) instead of letting Date roll them over.
 */
export function normalizeFilingDate(input: string): string {
  const s = input.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (match) {
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    throw new DocketParseError(`Unrecognized date: "${input}"`, "filingDate");
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new DocketParseError(`Impossible date: "${input}"`, "filingDate");
  }
  return dt.toISOString().slice(0, 10);
}

/**
 * Normalize a person's name so that the same party written different ways
 * produces the same key:
 *   "PLACEHOLDER, JANE Q."  -> "JANE Q PLACEHOLDER"
 *   "jane q. placeholder"   -> "JANE Q PLACEHOLDER"
 *   "Example, John, Jr."    -> "JOHN EXAMPLE JR"
 */
export function normalizePartyName(input: string): string {
  let s = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  s = s.replace(/[^A-Z,'\- ]/g, " ").replace(/\s+/g, " ").trim();

  let suffix: string | undefined;
  let tokens: string[];

  if (s.includes(",")) {
    // "LAST, FIRST MIDDLE[, SUFFIX]"
    const segs = s.split(",").map((t) => t.trim()).filter(Boolean);
    const last = segs.shift() ?? "";
    const rest = segs.flatMap((t) => t.split(" "));
    if (rest.length && SUFFIXES.has(rest[rest.length - 1]!)) suffix = rest.pop();
    tokens = [...rest, ...last.split(" ")];
  } else {
    tokens = s.split(" ");
  }
  if (tokens.length && SUFFIXES.has(tokens[tokens.length - 1]!)) suffix = tokens.pop();

  const name = tokens.filter(Boolean).join(" ");
  if (!name) throw new DocketParseError(`Empty party name: "${input}"`, "parties");
  return suffix ? `${name} ${suffix}` : name;
}

function normalizeRole(role: string | undefined): PartyRole {
  return ROLES[(role ?? "").trim().toLowerCase().replace(/\.$/, "")] ?? "other";
}

function normalizeDescription(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

/**
 * The dedupe key deliberately ignores party *display* formatting and
 * description whitespace/case, so the same filing re-delivered with cosmetic
 * differences collapses to one record.
 */
export function buildDedupeKey(e: Omit<DocketEntry, "dedupeKey">): string {
  const parties = e.parties
    .map((p) => `${p.role}:${p.normalizedName}`)
    .sort()
    .join("|");
  const material = [e.caseNumber, e.filingDate, e.description.toUpperCase(), parties].join("\n");
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

export function parseDocketEntry(raw: RawDocketEntry): DocketEntry {
  const parties: Party[] = (raw.parties ?? []).map((p) => ({
    displayName: p.name.trim(),
    normalizedName: normalizePartyName(p.name),
    role: normalizeRole(p.role),
  }));
  const base = {
    caseNumber: normalizeCaseNumber(raw.caseNumber),
    court: raw.court.replace(/\s+/g, " ").trim(),
    filingDate: normalizeFilingDate(raw.filingDate),
    parties,
    description: normalizeDescription(raw.description),
  };
  return { ...base, dedupeKey: buildDedupeKey(base) };
}

export interface NormalizeResult {
  entries: DocketEntry[];
  duplicatesDropped: number;
  errors: Array<{ index: number; field: string; message: string }>;
}

/** Parse a batch, keep the first occurrence of each filing, and collect (not throw) per-row errors. */
export function normalizeBatch(raws: RawDocketEntry[]): NormalizeResult {
  const seen = new Set<string>();
  const entries: DocketEntry[] = [];
  const errors: NormalizeResult["errors"] = [];
  let duplicatesDropped = 0;

  raws.forEach((raw, index) => {
    try {
      const entry = parseDocketEntry(raw);
      if (seen.has(entry.dedupeKey)) {
        duplicatesDropped++;
        return;
      }
      seen.add(entry.dedupeKey);
      entries.push(entry);
    } catch (err) {
      if (err instanceof DocketParseError) {
        errors.push({ index, field: err.field, message: err.message });
      } else {
        throw err;
      }
    }
  });

  return { entries, duplicatesDropped, errors };
}
