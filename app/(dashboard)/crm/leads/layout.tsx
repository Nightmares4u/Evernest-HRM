import { redirect } from "next/navigation";
import { CRM_INTAKE_ENABLED } from "@/lib/crm/feature-flags";

// Leads (list/detail/follow-ups) are part of the paused intake pipeline.
export default function CrmLeadsGate({ children }: { children: React.ReactNode }) {
  if (!CRM_INTAKE_ENABLED) redirect("/crm/clients");
  return <>{children}</>;
}
