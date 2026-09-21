import { createFileRoute } from "@tanstack/react-router";
import { KeepShell } from "@/components/keep/shell";
import { GoogleDriveExplorer } from "@/components/drive/drive-explorer";

export const Route = createFileRoute("/drive")({ component: DrivePage });

function DrivePage() {
  return (
    <KeepShell>
      <GoogleDriveExplorer />
    </KeepShell>
  );
}
