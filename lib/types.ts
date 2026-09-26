export type Profile = {
  language?: "zh" | "en" | null;
  id: string;
  full_name: string;
  email: string;
  role: "coach" | "member";
  active: boolean;
  phone: string;
  goals: string;
  timezone: string;
  email_notifications: boolean;
  referral_code: string;
  created_at: string;
};
export type Slot = {
  id: string;
  starts_at: string;
  ends_at: string;
  available: boolean;
  active?: boolean;
};
export type Appointment = {
  id: string;
  member_id: string;
  slot_id: string;
  status: "booked" | "cancelled" | "completed" | "no_show";
  message: string;
  reason: string;
  created_at: string;
  slots: { starts_at: string; ends_at: string };
};
export type Plan = {
  deleted_at?: string | null;
  id: string;
  member_id: string;
  title: string;
  content: string;
  status: "draft" | "published" | "archived";
  created_at: string;
};
export type RecordEntry = {
  measurements?: import("./measurements").Measurements;
  deleted_at?: string | null;
  id: string;
  member_id: string;
  recorded_on: string;
  weight: number | null;
  body_fat: number | null;
  notes: string;
  shared: boolean;
};
export type Invite = {
  id: string;
  code: string;
  email: string | null;
  max_uses: number;
  uses: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
};
export type Referral = {
  referred_name?: string;
  id: string;
  referrer_id: string;
  referred_id: string;
  status: "pending" | "confirmed";
  created_at: string;
  confirmed_at: string | null;
};
export type EventEntry = {
  id: string;
  appointment_id: string;
  actor_id: string;
  action: string;
  message: string;
  created_at: string;
  details: { old_start?: string; new_start?: string };
};
export type EmailJob = {
  id: string;
  recipient_id: string;
  subject: string;
  state: string;
  attempts: number;
  due_at: string;
  last_error: string | null;
  created_at: string;
};
export type Package = {
  id: string;
  title: string;
  sessions: number;
  price: number | null;
  currency: string;
  description: string;
  active: boolean;
};
export type Settings = {
  id: number;
  studio_name: string;
  timezone: string;
  allow_referral_signup: boolean;
  location: string;
};
export type MemberPrice = {
  id: string;
  member_id: string;
  single_price: number | null;
  monthly_price: number | null;
  quarterly_price?: number | null;
  annual_price?: number | null;
  currency: string;
  updated_at: string;
};
export type ContactSync = {
  id: string;
  member_id: string;
  state: string;
  synced_at: string | null;
  last_error: string | null;
  in_segment: boolean;
};
export type Data = {
  session_entries: SessionEntry[];
  monthly_memberships: MonthlyMembership[];
  credits_ready: boolean;
  member_prices: MemberPrice[];
  contact_sync: ContactSync[];
  profiles: Profile[];
  slots: Slot[];
  appointments: Appointment[];
  plans: Plan[];
  records: RecordEntry[];
  invites: Invite[];
  referrals: Referral[];
  events: EventEntry[];
  email_jobs: EmailJob[];
  packages: Package[];
  settings: Settings;
};
export type SessionEntry = {
  id: string;
  member_id: string;
  kind:
    | "purchase"
    | "adjustment"
    | "lesson"
    | "monthly_lesson"
    | "no_show"
    | "monthly_no_show";
  quantity: number;
  note: string;
  amount: number | null;
  currency: string;
  appointment_id: string | null;
  membership_id: string | null;
  created_at: string;
};
export type MonthlyMembership = {
  id: string;
  member_id: string;
  starts_on: string;
  ends_on: string;
  note: string;
  amount: number | null;
  currency: string;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
};
