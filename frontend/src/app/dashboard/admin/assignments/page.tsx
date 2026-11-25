import { redirect } from "next/navigation";

// Keep old bookmarks working while removing the separate Assignments section.
export const instant = false;

export default function LegacyAssignmentsPage() {
  redirect("/dashboard/admin/declined");
}
