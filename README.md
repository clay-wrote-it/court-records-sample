# court-records-sample

A small, self-contained TypeScript sample showing how I approach one piece of
court-records work: turning messy, docket-style entries into a clean, typed
model and collapsing duplicates that differ only cosmetically.

All data in this repository is **fake**. Case numbers use an invented
`SAMPLE-YYYY-XX-NNNNNN` format, courts are "Sample County", and party names are
placeholders (Jane Placeholder, John Example, Testcase Holdings LLC).

## What it demonstrates

- **A typed data model** (`src/model.ts`): a loose `RawDocketEntry` going in, a
  strict `DocketEntry` coming out, plus a field-aware `DocketParseError`.
- **Normalization** (`src/normalize.ts`):
  - case numbers: `sample 24 cv 77` → `SAMPLE-2024-CV-000077`
  - filing dates: `7/2/2024` or `2024-07-02` → `2024-07-02`, rejecting
    impossible dates like `02/30` instead of silently rolling them over
  - party names: `PLACEHOLDER, JANE Q.` and `Jane Q. Placeholder` → `JANE Q PLACEHOLDER`;
    `Example, John, Jr.` → `JOHN EXAMPLE JR`
  - party roles: `plf`, `Def.`, `Petitioner` → a fixed enum
- **De-duplication**: each entry gets a stable `dedupeKey`, so the same filing
  delivered twice with different formatting is kept once.
- **Batch error handling**: one bad row is reported with its index and field;
  it doesn't abort the batch.
- **Unit tests** with Node's built-in test runner (`test/normalize.test.ts`).

## How to run

Requires Node.js 20+.

```bash
npm install
npm test        # compiles with tsc, then runs node --test
npm run demo    # normalizes fixtures/docket-entries.json and prints the result
```

## One technical decision: what goes into the dedupe key

Records about the same filing often show up more than once with small
differences: `LAST, FIRST` vs `First Last`, extra whitespace, a short-form case
number, a different date format. If you dedupe on the raw text, you get
duplicates. If you dedupe only on case number, you lose real events, because
one case has many filings.

So the key is a hash of the **normalized** fields that identify a filing: the
canonical case number, the ISO filing date, the whitespace-collapsed and
upper-cased description, and the sorted set of `role:normalizedName` pairs.
Sorting the parties makes the key independent of their order. Display formatting
is kept separately in `displayName` for audit and UI, but it never goes into
the key. The tests cover both sides: a cosmetic re-delivery collapses, while two
filings in the same case on different dates stay separate.

The trade-off is that a real correction to a description creates a new key.
For this sample I prefer that over merging two genuinely different filings.
In a larger system I'd pair it with a "supersedes" link and not overwrite the
old record in place.

## Left out on purpose

This is a sample, not an excerpt of a production system. It intentionally
contains **no**:

- data collection code of any kind, and no network access at all
- real case records, real people, or customer data. Every fixture is invented
- credentials, `.env` files, hostnames, or service configuration
- database, search-index, or deployment code

Production code for the product I build and operate is private. I'm happy to
walk through the architecture in conversation.
