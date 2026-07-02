import { redirect } from "next/navigation";
import { CRM_INTAKE_ENABLED } from "@/lib/crm/feature-flags";

// Admin transfer oversight is part of the paused intake pipeline.
export default function AdminCrmTransfersGate({ children }: { children: React.ReactNode }) {
  if (!CRM_INTAKE_ENABLED) redirect("/admin/crm");
  return <>{children}</>;
}
