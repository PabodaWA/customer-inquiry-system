export type InquiryStatus = "NEW" | "IN_PROGRESS" | "RESOLVED";

export type Inquiry = {
  id: number;
  customer_name: string;
  contact?: string;
  subject: string;
  description?: string;
  category: string;
  status: InquiryStatus;
  assigned_to?: number | null;
  assigned_staff_name?: string | null;
  assignment_status?: "PENDING" | "ASSIGNED";
  handler_response_status?: "WAITING" | "ACCEPTED" | "DECLINED" | "NOT_REQUIRED" | "UNKNOWN";
  created_at: string;
  updated_at?: string;
  created_by?: number;
};

export type ApiResult<T> = { success?: boolean; data?: T; count?: number; message?: string };

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
export const INQUIRY_STATUSES: InquiryStatus[] = ["NEW", "IN_PROGRESS", "RESOLVED"];
export const STATUS_TRANSITIONS: Record<InquiryStatus, InquiryStatus[]> = {
  NEW: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["IN_PROGRESS"],
};

export async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const result = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok || result.success === false) {
    throw new Error(result.message ?? `Request failed (${response.status}).`);
  }
  return result;
}

export function inquiryReference(id: number) {
  return `CN-${String(id).padStart(4, "0")}`;
}

export function readableLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function displayDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
