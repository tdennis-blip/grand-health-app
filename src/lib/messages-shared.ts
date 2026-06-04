// Types and pure helpers used by both server fetchers and client components.
// IMPORTANT: this module must NOT import anything server-only
// (next/headers, supabase server client, etc.) — that would force any client
// component that imports from here to fail with "next/headers in pages/".

export type Message = {
  id: string;
  clinicId: string;
  patientId: string;
  senderId: string;
  senderRole: "patient" | "clinician";
  recipientId: string;
  body: string;
  recipientReadAt: string | null;
  createdAt: string;
};

export type ParticipantProfile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  role: "patient" | "clinician";
};

export type ClinicianOption = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  isPrimary: boolean;
};

export type InboxEntry = {
  patientId: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  lastMessage: Message | null;
  unreadForMe: number;
};

export function displayName(p: { firstName: string | null; lastName: string | null } | null | undefined): string {
  if (!p) return "Unknown";
  const n = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
  return n || "Unknown";
}
