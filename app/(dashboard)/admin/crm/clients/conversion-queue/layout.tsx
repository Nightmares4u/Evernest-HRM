import { redirect } from "next/navigation";
import { CRM_INTAKE_ENABLED } from "@/lib/crm/feature-flags";

// Lead-to-client conversion queue is part of the paused intake pipeline.
export default function ConversionQueueGate({ children }: { children: React.ReactNode }) {
  if (!CRM_INTAKE_ENABLED) redirect("/admin/crm");
  return <>{children}</>;
}
