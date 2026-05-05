"use client";

import { trpc } from "@/app/_trpc/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Search,
  MoreHorizontal,
  Mail,
  Phone,
  ExternalLink,
  Trash2,
  Globe,
  Building2,
  User,
  Tag,
  Calendar,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ImportLeadsDialog } from "./ImportLeadsDialog";
import { useDebounce } from "@/hooks/use-debounce";
import { getLeadStatusColor } from "@/features/leads/utils";

type Lead = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  website?: string | null;
  status: string;
  source?: string | null;
  createdAt: string;
};

function LeadDetailDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{lead.company || fullName || "Lead Details"}</DialogTitle>
          <DialogDescription className="sr-only">Lead details</DialogDescription>
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className={getLeadStatusColor(lead.status)}>
              {lead.status}
            </Badge>
            {lead.source && (
              <span className="text-xs text-muted-foreground">{lead.source}</span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {fullName && (
            <div className="flex items-start gap-3">
              <User size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="text-sm font-medium">{fullName}</p>
              </div>
            </div>
          )}

          {lead.company && (
            <div className="flex items-start gap-3">
              <Building2 size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Company</p>
                <p className="text-sm font-medium">{lead.company}</p>
              </div>
            </div>
          )}

          {lead.email && (
            <div className="flex items-start gap-3">
              <Mail size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <a
                  href={`mailto:${lead.email}`}
                  className="text-sm font-medium text-primary hover:underline underline-offset-4"
                >
                  {lead.email}
                </a>
              </div>
            </div>
          )}

          {lead.phone && (
            <div className="flex items-start gap-3">
              <Phone size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <a
                  href={`tel:${lead.phone}`}
                  className="text-sm font-medium text-primary hover:underline underline-offset-4"
                >
                  {lead.phone}
                </a>
              </div>
            </div>
          )}

          {lead.website && (
            <div className="flex items-start gap-3">
              <Globe size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Website</p>
                <a
                  href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline underline-offset-4 break-all"
                >
                  {lead.website}
                </a>
              </div>
            </div>
          )}

          {lead.source && (
            <div className="flex items-start gap-3">
              <Tag size={15} className="text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="text-sm font-medium">{lead.source}</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <Calendar size={15} className="text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm font-medium">
                {new Date(lead.createdAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LeadsList() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const utils = trpc.useUtils();
  const { data: leads, isLoading } = trpc.leads.getAll.useQuery({ search: debouncedSearch });

  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => {
      toast.success("Lead created successfully");
      setIsAddDialogOpen(false);
      utils.leads.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });

  const deleteLead = trpc.leads.delete.useMutation({
    onSuccess: () => {
      toast.success("Lead deleted successfully");
      utils.leads.getAll.invalidate();
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      firstName: (formData.get("firstName") as string) || undefined,
      lastName: (formData.get("lastName") as string) || undefined,
      email: (formData.get("email") as string) || undefined,
      phone: (formData.get("phone") as string) || undefined,
      company: (formData.get("company") as string) || undefined,
      source: "Manual",
    };
    createLead.mutate(data);
  };


  return (
    <div className="space-y-4">
      {selectedLead && (
        <LeadDetailDialog lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search leads..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <ImportLeadsDialog onImported={() => utils.leads.getAll.invalidate()} />

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger render={<Button className="gap-2" />}>
              <Plus size={16} />
              Add Lead
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
                <DialogDescription>
                  Fill in the details below to create a new lead.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" name="company" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" name="firstName" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" name="lastName" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createLead.isPending}>
                    {createLead.isPending ? "Creating..." : "Create Lead"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading leads...
                </TableCell>
              </TableRow>
            ) : leads?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No leads found.
                </TableCell>
              </TableRow>
            ) : (
              leads?.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">
                    {lead.company || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {lead.firstName || lead.lastName
                      ? `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim()
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="text-muted-foreground hover:text-primary">
                          <Mail size={16} />
                        </a>
                      )}
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} className="text-muted-foreground hover:text-primary">
                          <Phone size={16} />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getLeadStatusColor(lead.status)}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 p-0" />}>
                        <MoreHorizontal size={16} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer"
                          onClick={() => setSelectedLead(lead)}
                        >
                          <ExternalLink size={14} />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer"
                          onClick={() => {
                            if (lead.phone) {
                              window.location.href = `tel:${lead.phone}`;
                            } else {
                              toast.error("No phone number for this lead");
                            }
                          }}
                        >
                          <Phone size={14} />
                          Call Lead
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this lead?")) {
                              deleteLead.mutate({ id: lead.id });
                            }
                          }}
                        >
                          <Trash2 size={14} />
                          Delete Lead
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
