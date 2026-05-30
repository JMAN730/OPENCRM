# Editable Sales Scripts

**Date:** 2026-05-28  
**Status:** Approved for implementation

---

## Context

Sales scripts in the CRM are currently hardcoded as a constant (`SALES_SCRIPTS`) in `LeadModal.tsx`. They're read-only — users can copy them but not change them. The goal is to let Admins and Managers edit, add, and delete scripts, with changes persisted to the database and shared across the whole organization.

---

## What We're Building

An "Edit mode" toggle for the Scripts panel (already reachable via the Scripts button in the lead modal). In read mode the panel looks exactly as it does today. Admins and Managers see a purple **Edit** button in the header; clicking it switches the whole panel into an editable state where every script becomes a form field.

**Edit mode features:**
- Script title and body become editable inputs
- Each script has a **🗑 Delete** button
- Each category section has a **+ Add script to [Category]** button at the bottom
- Categories themselves are fixed (Opening, Objection Handling, Closing, Voicemail) — users can't add or rename categories in this version
- Header shows **Save** (purple, filled) and **Cancel** buttons
- Save atomically replaces all scripts for the org in the database
- Cancel discards all in-progress changes and returns to read mode
- Regular Users never see the Edit button — the panel stays read-only for them

---

## Architecture

### Data model

New Prisma model added to `prisma/schema.prisma`:

```prisma
model SalesScript {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  category       String
  title          String
  body           String       @db.Text
  order          Int          @default(0)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([organizationId])
}
```

Add `salesScripts SalesScript[]` to the `Organization` model.

### tRPC router

New file: `src/features/scripts/server/router.ts`  
Registered in `src/server/api/root.ts` as `scripts`.

**Two procedures:**

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `getAll` | query | `organizationProcedure` | Returns all scripts for the org grouped by category. If the org has no scripts yet, seeds with the current `SALES_SCRIPTS` defaults and returns them. |
| `replaceAll` | mutation | `organizationProcedure` | Accepts `{ scripts: { category, title, body, order }[] }`. Deletes all existing scripts for the org and inserts the new set atomically (in a `$transaction`). Throws `FORBIDDEN` if caller is not MANAGER or ADMIN. |

### UI changes

All changes are in `src/features/leads/components/lead-list/LeadModal.tsx`:

1. **Remove** the `SALES_SCRIPTS` hardcoded constant (it becomes the seed data in the router).
2. **`ScriptsDialog`** fetches from `trpc.scripts.getAll.useQuery()` and calls `trpc.scripts.replaceAll.useMutation()` on save.
3. Add `editMode: boolean` and `draft: ScriptGroup[]` local state.
4. **Edit button** in the header — only rendered when `session.user.role` is `ADMIN` or `MANAGER`.
5. In edit mode, script cards render `<input>` (title) + `<textarea>` (body) + a delete button instead of static text.
6. Each category section gains a **+ Add script** button that appends a blank script to the draft.
7. **Save** calls `replaceAll` with the current draft, then exits edit mode on success.
8. **Cancel** resets draft to the server data and exits edit mode.

### Color scheme

Uses `var(--crm-accent)` (vivid purple, `oklch(56% 0.26 280)`) for:
- Header border bottom in edit mode
- Header title color in edit mode
- Save button background
- Script card border in edit mode
- "Add script" dashed button border and text color (`var(--crm-accent-fg)`)
- Edit button text color in read mode

---

## Seeding

The 10 existing hardcoded scripts become the default seed. When `getAll` is called for an org with zero scripts, it inserts all defaults and returns them. This is a one-time operation per org.

The `SALES_SCRIPTS` constant moves from `LeadModal.tsx` to the router file as `DEFAULT_SCRIPTS`.

---

## Verification

1. Open a lead modal → click Scripts → panel loads from DB (first load auto-seeds defaults).
2. As an Admin/Manager: click **Edit** → panel turns purple edit mode, all scripts editable.
3. Edit a title and body → click **Save** → panel returns to read mode, shows updated text.
4. Click **Edit** again → click **+ Add script to Closing** → blank card appears → fill it in → **Save** → new script visible in read mode.
5. Click **Edit** → click **🗑 Delete** on a script → **Save** → script gone.
6. Click **Edit** → make changes → click **Cancel** → original scripts restored.
7. Log in as a regular User → open Scripts → **no Edit button visible**.
8. Open two browser tabs as Manager → edit and save in one tab → refresh other tab → changes are reflected.
9. Run `npm test` — all existing tests still pass.
