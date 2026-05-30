# Fix Reviews Column Mismatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the CSV column name mismatch that causes review counts to be silently dropped during scraper imports.

**Architecture:** The Python scraper writes a column named `"Reviews"` to its CSV output, but the TypeScript importer reads from a property named `ReviewCount` — which PapaParse will never populate because that header doesn't exist in the file. The fix is to align the TypeScript type and accessor to match the actual CSV header `"Reviews"`.

**Tech Stack:** TypeScript, PapaParse, Vitest

---

## Context

**Root cause:** `src/server/scraper/scraper.py` line 59/751 writes CSV column `"Reviews"`. `src/server/scraper/importer.ts` line 14 declares `ReviewCount?: string` in `ScrapedRow`, and line 173 reads `row.ReviewCount`. PapaParse maps CSV headers directly to object keys, so `row.ReviewCount` is always `undefined`, making `reviewCount` always `null` on every imported lead.

`rating` is unaffected — both sides consistently use `"Rating"`.

---

### Task 1: Fix the column name mismatch

**Files:**
- Modify: `src/server/scraper/importer.ts` (lines 14, 173)
- Modify: `src/server/scraper/importer.test.ts` (lines 368, 385)

- [ ] **Step 1: Update the failing test inputs to use the correct CSV column name**

  In `src/server/scraper/importer.test.ts`, change both test rows that use `ReviewCount` to `Reviews`:

  ```diff
  - rows: [{ Name: "Acme", Rating: "4.6", ReviewCount: "128" }],
  + rows: [{ Name: "Acme", Rating: "4.6", Reviews: "128" }],
  ```

  ```diff
  - rows: [{ Name: "Acme", Phone: "555", Rating: "4.7", ReviewCount: "18" }],
  + rows: [{ Name: "Acme", Phone: "555", Rating: "4.7", Reviews: "18" }],
  ```

- [ ] **Step 2: Run the tests to confirm they now fail on type errors**

  ```bash
  npx vitest run src/server/scraper/importer.test.ts
  ```

  Expected: TypeScript/type errors because `ScrapedRow` still declares `ReviewCount`, not `Reviews`.

- [ ] **Step 3: Fix the `ScrapedRow` type and the accessor in `importer.ts`**

  In `src/server/scraper/importer.ts`:

  Line 14 — rename the type field:
  ```diff
  -  ReviewCount?: string;
  +  Reviews?: string;
  ```

  Line 173 — read the correct key:
  ```diff
  -  const reviewCountRaw = (row.ReviewCount ?? "").trim();
  +  const reviewCountRaw = (row["Reviews"] ?? "").trim();
  ```

- [ ] **Step 4: Run the tests and verify they pass**

  ```bash
  npx vitest run src/server/scraper/importer.test.ts
  ```

  Expected: all tests pass including "imports rating and review count when present in scraped rows" and the update path test.

- [ ] **Step 5: Run the full test suite to check for regressions**

  ```bash
  npm test
  ```

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add src/server/scraper/importer.ts src/server/scraper/importer.test.ts
  git commit -m "fix: align importer to scraper CSV column name Reviews → reviewCount"
  ```
