import { redirect } from "next/navigation";
import { CRM_INTAKE_ENABLED } from "@/lib/crm/feature-flags";

// Raw inbox is part of the paused intake pipeline (see lib/crm/feature-flags.ts).
export default function CrmInboxGate({ children }: { children: React.ReactNode }) {
  if (!CRM_INTAKE_ENABLED) redirect("/crm/clients");
  return <>{children}</>;
}
