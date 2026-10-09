/**
 * Data model for a single docket-style entry.
 *
 * `RawDocketEntry` is what arrives from an upstream source: loosely typed,
 * inconsistent casing, mixed date formats. `DocketEntry` is the normalized
 * shape the rest of an application can rely on.
 */

export type PartyRole = "plaintiff" | "defendant" | "petitioner" | "respondent" | "other";

export interface RawDocketEntry {
  caseNumber: string;
  court: string;
  filingDate: string;
  parties: Array<{ name: string; role?: string }>;
  description: string;
}

export interface Party {
  /** Name as it appeared in the source, trimmed. Kept for display / audit. */
  displayName: string;
  /** Canonical "first middle last suffix" form, upper-cased, used for matching. */
  normalizedName: string;
  role: PartyRole;
}

export interface DocketEntry {
  /** Canonical case number, e.g. SAMPLE-2024-CR-000101. */
  caseNumber: string;
  court: string;
  /** ISO 8601 calendar date (YYYY-MM-DD). */
  filingDate: string;
  parties: Party[];
  description: string;
  /** Stable key used to detect the same filing arriving more than once. */
  dedupeKey: string;
}

export class DocketParseError extends Error {
  constructor(message: string, readonly field: keyof RawDocketEntry) {
    super(message);
    this.name = "DocketParseError";
  }
}
