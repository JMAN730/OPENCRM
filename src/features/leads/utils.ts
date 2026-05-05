export function getLeadStatusColor(status: string): string {
  switch (status) {
    case "NEW":         return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20";
    case "CONTACTED":   return "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20";
    case "QUALIFIED":   return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
    case "UNQUALIFIED": return "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20";
    case "LOST":        return "bg-destructive/10 text-destructive hover:bg-destructive/20";
    case "WON":         return "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20";
    default:            return "bg-muted text-muted-foreground";
  }
}
