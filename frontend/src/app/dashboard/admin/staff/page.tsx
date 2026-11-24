import StaffClient from "./StaffClient";

// Staff data loads in a client effect, so opt this segment out of
// instant-navigation validation.
export const instant = false;

export default function StaffManagementPage() {
  return <StaffClient />;
}
