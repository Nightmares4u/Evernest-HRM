import { redirect } from "next/navigation";
import { CRM_INTAKE_ENABLED } from "@/lib/crm/feature-flags";

// Lead transfers are part of the paused intake pipeline.
export default function CrmTransfersGate({ children }: { children: React.ReactNode }) {
  if (!CRM_INTAKE_ENABLED) redirect("/crm/clients");
  return <>{children}</>;
}
