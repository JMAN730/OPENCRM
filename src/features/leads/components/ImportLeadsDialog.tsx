"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";
import { useSession } from "next-auth/react";
import { trpc } from "@/app/_trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, FileText, CheckCircle2, AlertCircle, Tag } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizeState, parseCityState } from "@/features/leads/location";

// Maps common CSV/XLSX header variants to our lead fields
const FIELD_MAP: Record<string, string> = {
  // Company / business name
  name: "company", "business name": "company", "company name": "company",
  company: "company", organization: "company", employer: "company",
  // Person name
  firstname: "firstName", first_name: "firstName", "first name": "firstName",
  lastname: "lastName", last_name: "lastName", "last name": "lastName",
  // Contact
  email: "email", "email address": "email",
  phone: "phone", "phone number": "phone", mobile: "phone", telephone: "phone",
  "normalized phone": "phone",
  // Location
  city: "city", "city/town": "city", town: "city", location: "city",
  state: "state", province: "state", region: "state",
  // Other
  website: "website", url: "website", "final url": "website", "website url": "website",
  "google maps url": "mapsUrl", "maps url": "mapsUrl", "google maps": "mapsUrl",
  rating: "rating", stars: "rating", "star rating": "rating", reviews: "reviewCount",
  "review count": "reviewCount", "total reviews": "reviewCount",
  source: "source", "lead source": "source", category: "source",
  status: "status",
  "personalized observation": "qualificationSummary",
  "personalized_observation": "qualificationSummary",
  observation: "qualificationSummary",
  notes: "qualificationSummary",
  qualification: "qualificationSummary",
};

type ParsedLead = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  city?: string;
  state?: string;
  website?: string;
  mapsUrl?: string;
  rating?: number;
  reviewCount?: number;
  source?: string;
  qualificationSummary?: string;
  status?: "NOT_CONTACTED" | "CONNECTED" | "AI_VOICEMAIL" | "NO_ANSWER" | "HUNG_UP";
};

type RawCell = string | number | boolean | Date | null;

// Normalizes a cell value to a clean string, handling Excel numeric types
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().split("T")[0] ?? "";
  if (typeof value === "number") {
    // Excel stores phone numbers as floats — strip decimal and convert
    return Number.isInteger(value) ? String(value) : String(Math.round(value));
  }
  return String(value).trim();
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isValidUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}

// Attempt to turn a bare domain into a URL (e.g. "example.com" → "https://example.com")
function coerceUrl(s: string): string | undefined {
  if (isValidUrl(s)) return s;
  const prefixed = "https://" + s;
  return isValidUrl(prefixed) ? prefixed : undefined;
}

function normalizeRow(row: Record<string, unknown>): ParsedLead {
  const lead: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const normalized = rawKey.trim().toLowerCase();
    const field = FIELD_MAP[normalized];
    const str = cellToString(value);
    // If multiple columns map to the same field (common in messy spreadsheets),
    // keep the first non-empty value rather than overwriting.
    if (field && str && !lead[field]) lead[field] = str;
  }

  // If the "email" value is actually a URL, move it to website
  if (lead.email && !isValidEmail(lead.email)) {
    const asUrl = coerceUrl(lead.email);
    if (asUrl && !lead.website) lead.website = asUrl;
    delete lead.email;
  }

  // Ensure website is a valid URL; try to add protocol if missing
  if (lead.website) {
    const coerced = coerceUrl(lead.website);
    if (coerced) lead.website = coerced;
    else delete lead.website;
  }

  // Validate mapsUrl — must be an absolute URL
  if (lead.mapsUrl) {
    if (!isValidUrl(lead.mapsUrl)) delete lead.mapsUrl;
  }

  const validStatuses = ["NOT_CONTACTED","CONNECTED","AI_VOICEMAIL","NO_ANSWER","HUNG_UP"] as const;
  const rawStatus = lead.status?.toUpperCase();
  const rating = lead.rating ? Number(lead.rating) : undefined;
  const reviewCount = lead.reviewCount ? Number(lead.reviewCount) : undefined;
  const parsedLocation = parseCityState(lead.city);
  const state = normalizeState(lead.state) ?? parsedLocation.state;
  return {
    ...lead,
    city: parsedLocation.state ? parsedLocation.city : lead.city,
    state,
    rating: typeof rating === "number" && Number.isFinite(rating) ? rating : undefined,
    reviewCount:
      typeof reviewCount === "number" && Number.isFinite(reviewCount)
        ? Math.max(0, Math.round(reviewCount))
        : undefined,
    status: validStatuses.includes(rawStatus as typeof validStatuses[number])
      ? (rawStatus as typeof validStatuses[number])
      : "NOT_CONTACTED",
  };
}

interface Props {
  onImported: () => void;
}

export function ImportLeadsDialog({ onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedLead[]>([]);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string>("");
  // Store all parsed sheets so switching doesn't require re-reading the file
  const [allSheets, setAllSheets] = useState<{ sheet: string; data: RawCell[][] }[] | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | undefined>(undefined);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: session } = useSession();
  const isAdminOrManager =
    session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";

  const utils = trpc.useUtils();
  const { data: orgMembers } = trpc.teams.organizationMembers.useQuery(undefined, {
    enabled: isAdminOrManager,
    staleTime: 60_000,
  });
  const { data: myTeam } = trpc.teams.myTeam.useQuery(undefined, { staleTime: 60_000 });
  const { data: orgTags } = trpc.leads.listOrgTags.useQuery(undefined, { staleTime: 120_000 });
  const createTag = trpc.leads.createTag.useMutation();

  const assignableUsers = isAdminOrManager ? (orgMembers ?? []) : (myTeam?.users ?? []);

  const bulkCreate = trpc.leads.bulkCreate.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.count} lead${data.count !== 1 ? "s" : ""}`);
      setOpen(false);
      setRows([]);
      setFileName("");
      onImported();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const tag = await createTag.mutateAsync({ name });
      setSelectedTagIds((ids) => [...ids, tag.id]);
      setNewTagName("");
      void utils.leads.listOrgTags.invalidate();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message ?? "Failed to create tag");
    }
  };

  const applyRawRows = (rawRows: RawCell[][]) => {
    const [headerRow, ...dataRows] = rawRows;
    if (!headerRow || headerRow.length === 0) {
      toast.error("No valid leads found. Check your column headers.");
      return;
    }
    const headers = headerRow.map(h => String(h ?? "").trim());
    const jsonRows: Record<string, unknown>[] = dataRows.map(row => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => { if (h) obj[h] = row[i] ?? null; });
      return obj;
    });
    const parsed = jsonRows.map(normalizeRow).filter(
      (r) => r.company || r.firstName || r.lastName || r.email || r.phone
    );
    if (parsed.length === 0) {
      toast.error("No valid leads found. Check your column headers.");
      return;
    }
    setRows(parsed);
  };

  const parseXlsx = async (file: File, requestedSheetName?: string) => {
    try {
      const sheets = await readXlsxFile(file);
      const names = sheets.map((s) => s.sheet);
      setSheetNames(names);
      setAllSheets(sheets as { sheet: string; data: RawCell[][] }[]);

      // Pick the sheet with the most rows by default, or the requested one
      let activeSheet = requestedSheetName && names.includes(requestedSheetName)
        ? requestedSheetName
        : "";
      if (!activeSheet) {
        let bestName = names[0] ?? "";
        let bestCount = -1;
        for (const s of sheets) {
          if (s.data.length > bestCount) { bestCount = s.data.length; bestName = s.sheet; }
        }
        activeSheet = bestName;
      }
      setSheetName(activeSheet);
      const target = sheets.find((s) => s.sheet === activeSheet);
      if (!target) { toast.error("Failed to find a worksheet in this file."); return; }
      applyRawRows(target.data as RawCell[][]);
    } catch {
      toast.error("Failed to parse Excel file. Please check the file format.");
    }
  };

  const parseCsv = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = results.data.map(normalizeRow).filter(
          (r) => r.company || r.firstName || r.lastName || r.email || r.phone
        );
        if (parsed.length === 0) {
          toast.error("No valid leads found. Check your column headers.");
          return;
        }
        setRows(parsed);
      },
    });
  };

  const parseFile = (file: File) => {
    const isXlsx = file.name.endsWith(".xlsx");
    const isCsv = file.name.endsWith(".csv");
    if (!isXlsx && !isCsv) {
      toast.error("Please upload a .csv or .xlsx file");
      return;
    }
    setFileName(file.name);
    if (isXlsx) void parseXlsx(file);
    else parseCsv(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const handleImport = () =>
    bulkCreate.mutate({
      leads: rows,
      assigneeId: assigneeId ?? undefined,
      tagIds: selectedTagIds.length ? selectedTagIds : undefined,
    });

  const reset = () => {
    setRows([]);
    setFileName("");
    setSheetNames([]);
    setSheetName("");
    setAllSheets(null);
    setAssigneeId(undefined);
    setSelectedTagIds([]);
    setNewTagName("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
        <Upload size={16} />
        Import
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>
            Supports .csv and .xlsx files. Existing leads are updated (matched by email/phone) instead of duplicated.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload size={28} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Drop your file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">CSV or XLSX · Max 5,000 rows</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <FileText size={18} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {rows.length} leads ready to import
                  {sheetName ? ` · Sheet: ${sheetName}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} className="shrink-0 text-xs">
                Change
              </Button>
            </div>

            {sheetNames.length > 1 && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Worksheet</p>
                  <p className="text-xs text-muted-foreground truncate">
                    Choose which sheet to import from this workbook.
                  </p>
                </div>
                <select
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={sheetName}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSheetName(next);
                    const target = allSheets?.find((s) => s.sheet === next);
                    if (target) applyRawRows(target.data as RawCell[][]);
                  }}
                >
                  {sheetNames.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Preview table */}
            <div className="rounded-md border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-52 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      {["Company","Name","Phone","Email"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0, 50).map((row, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{row.company || "—"}</td>
                        <td className="px-3 py-2">{[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.phone || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 50 && (
                <div className="px-3 py-2 bg-muted/30 border-t border-border text-xs text-muted-foreground text-center">
                  Showing 50 of {rows.length} rows
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              {rows.some(r => !r.email && !r.phone) ? (
                <><AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-500" />
                <span>{rows.filter(r => !r.email && !r.phone).length} rows have no email or phone — you can still import them.</span></>
              ) : (
                <><CheckCircle2 size={13} className="shrink-0 mt-0.5 text-green-500" />
                <span>All rows have at least one contact field.</span></>
              )}
            </div>

            {/* Import options: assign + tags */}
            <div className="space-y-3 rounded-lg border border-border p-3">
              {assignableUsers.length > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Assign to</p>
                  <select
                    className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                    value={assigneeId ?? ""}
                    onChange={(e) => setAssigneeId(e.target.value || undefined)}
                  >
                    <option value="">Me</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Tags{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                {(orgTags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(orgTags ?? []).map((tag) => {
                      const active = selectedTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() =>
                            setSelectedTagIds((ids) =>
                              active
                                ? ids.filter((id) => id !== tag.id)
                                : [...ids, tag.id],
                            )
                          }
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50",
                          )}
                        >
                          <Tag size={10} />
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    className="h-8 flex-1 rounded-md border border-border bg-background px-3 text-xs placeholder:text-muted-foreground"
                    placeholder="New tag name…"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleCreateTag(); }}
                    maxLength={50}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!newTagName.trim() || createTag.isPending}
                    onClick={() => void handleCreateTag()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          {rows.length > 0 && (
            <Button onClick={handleImport} disabled={bulkCreate.isPending} className="gap-2">
              <Upload size={14} />
              {bulkCreate.isPending ? "Importing..." : `Import ${rows.length} leads`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
