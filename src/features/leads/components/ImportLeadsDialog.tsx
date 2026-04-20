"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
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
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Maps common CSV header variants to our lead fields
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
  // Other
  website: "website", url: "website", "final url": "website", "website url": "website",
  source: "source", "lead source": "source",
  status: "status",
};

type ParsedLead = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  source?: string;
  status?: "NEW" | "CONTACTED" | "QUALIFIED" | "UNQUALIFIED" | "LOST" | "WON";
};

function normalizeRow(row: Record<string, string>): ParsedLead {
  const lead: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const normalized = rawKey.trim().toLowerCase();
    const field = FIELD_MAP[normalized];
    if (field && value?.trim()) lead[field] = value.trim();
  }

  const validStatuses = ["NEW","CONTACTED","QUALIFIED","UNQUALIFIED","LOST","WON"] as const;
  const rawStatus = lead.status?.toUpperCase();
  return {
    ...lead,
    status: validStatuses.includes(rawStatus as typeof validStatuses[number])
      ? (rawStatus as typeof validStatuses[number])
      : "NEW",
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const parseFile = (file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    setFileName(file.name);
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

  const handleImport = () => bulkCreate.mutate(rows);

  const reset = () => { setRows([]); setFileName(""); };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
        <Upload size={16} />
        Import CSV
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
          <DialogDescription>
            Supports columns: first name, last name, email, phone, company, website, source.
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
            <p className="text-sm font-medium">Drop your CSV here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Max 5,000 rows</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
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
                <p className="text-xs text-muted-foreground">{rows.length} leads ready to import</p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset} className="shrink-0 text-xs">
                Change
              </Button>
            </div>

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
