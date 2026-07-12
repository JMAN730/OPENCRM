"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TriggerButtonProps {
  disabled?: boolean;
  onClick?: () => void;
}

// Must stay pixel-identical to ImportLeadsDialog's own DialogTrigger button —
// it stands in for it until the dialog chunk loads.
function ImportTriggerButton({ disabled, onClick }: TriggerButtonProps) {
  return (
    <Button variant="outline" className="gap-2" disabled={disabled} onClick={onClick}>
      <Upload size={16} />
      Import
    </Button>
  );
}

// ImportLeadsDialog pulls in PapaParse + read-excel-file; defer that chunk
// until the user actually clicks Import.
const ImportLeadsDialog = dynamic(
  () => import("./ImportLeadsDialog").then((m) => ({ default: m.ImportLeadsDialog })),
  {
    ssr: false,
    loading: () => <ImportTriggerButton disabled />,
  },
);

interface Props {
  onImported: () => void;
}

export function LazyImportLeadsDialog({ onImported }: Props) {
  const [requested, setRequested] = useState(false);

  if (!requested) {
    return <ImportTriggerButton onClick={() => setRequested(true)} />;
  }

  return <ImportLeadsDialog onImported={onImported} defaultOpen />;
}
