export function getLeadStatusColor(status: string): string {
  switch (status) {
    case "NOT_CONTACTED": return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20";
    case "CONNECTED":     return "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20";
    case "AI_VOICEMAIL":  return "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20";
    case "NO_ANSWER":     return "bg-slate-500/10 text-slate-500 hover:bg-slate-500/20";
    case "HUNG_UP":       return "bg-destructive/10 text-destructive hover:bg-destructive/20";
    default:              return "bg-muted text-muted-foreground";
  }
}
