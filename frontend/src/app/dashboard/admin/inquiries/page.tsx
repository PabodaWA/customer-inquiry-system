import InquiriesClient from "./InquiriesClient";

// Inquiries load authenticated data in a client effect, so opt this segment
// out of instant-navigation validation.
export const instant = false;

export default function AllInquiriesPage() {
  return <InquiriesClient />;
}
