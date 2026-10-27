export type SubscriptionStatus = "active" | "trial" | "needs_review" | "archived";
export type BillingCycle = "monthly" | "quarterly" | "annual";

export type Subscription = {
  id: string;
  user_id: string | null;
  vendor: string;
  service_details: string | null;
  category: string;
  amount: number;
  currency: string;
  billing_cycle: BillingCycle;
  renewal_date: string;
  cancel_by: string | null;
  payment_instrument: string | null;
  service_url?: string | null;
  contract_start_date?: string | null;
  actual_ngn_amount?: number | null;
  cost_center?: string | null;
  accountable_operator?: string | null;
  notes?: string | null;
  status: SubscriptionStatus;
  created_at: string;
  updated_at: string;
};

export type SubscriptionDraft = Pick<
  Subscription,
  | "vendor"
  | "service_details"
  | "category"
  | "amount"
  | "currency"
  | "billing_cycle"
  | "renewal_date"
  | "cancel_by"
  | "payment_instrument"
  | "service_url"
  | "contract_start_date"
  | "actual_ngn_amount"
  | "cost_center"
  | "accountable_operator"
  | "notes"
  | "status"
>;

export const demoSubscriptions: Subscription[] = [
  { id: "demo-1", user_id: null, vendor: "Namecheap DNS", service_details: "studio-lagos.co · Apex Domain", category: "Infrastructure", amount: 14.5, currency: "USD", billing_cycle: "annual", renewal_date: "2025-11-14", cancel_by: "2025-11-12", payment_instrument: "FirstBank Master ····8820", status: "needs_review", created_at: "2025-01-01", updated_at: "2025-01-01" },
  { id: "demo-2", user_id: null, vendor: "Google Workspace", service_details: "6 seats · Business Plus · studio-lagos.co", category: "Productivity & Comms", amount: 36, currency: "USD", billing_cycle: "monthly", renewal_date: "2025-11-12", cancel_by: "2025-11-10", payment_instrument: "Stanbic IBTC Visa ····4091", status: "active", created_at: "2025-01-01", updated_at: "2025-01-01" },
  { id: "demo-3", user_id: null, vendor: "Figma Professional", service_details: "3 editor seats · Design Org", category: "Design & Creative", amount: 45, currency: "USD", billing_cycle: "monthly", renewal_date: "2025-11-22", cancel_by: "2025-11-20", payment_instrument: "Stanbic IBTC Visa ····4091", status: "active", created_at: "2025-01-01", updated_at: "2025-01-01" },
  { id: "demo-4", user_id: null, vendor: "Vercel Pro", service_details: "Lagos Studio Edge · 2 Pipeline Seats", category: "Engineering & Hosting", amount: 20, currency: "USD", billing_cycle: "monthly", renewal_date: "2025-11-17", cancel_by: "2025-11-15", payment_instrument: "Stanbic IBTC Visa ····4091", status: "active", created_at: "2025-01-01", updated_at: "2025-01-01" },
  { id: "demo-5", user_id: null, vendor: "Canva Pro Teams", service_details: "5 seats · Marketing Kit Tier", category: "Design & Marketing", amount: 12.99, currency: "USD", billing_cycle: "monthly", renewal_date: "2025-11-20", cancel_by: "2025-11-18", payment_instrument: "GTBank Corp ····1104", status: "active", created_at: "2025-01-01", updated_at: "2025-01-01" },
  { id: "demo-6", user_id: null, vendor: "Zoom Workplace", service_details: "Annual retain · Pro 1-license", category: "Productivity & Comms", amount: 149.9, currency: "USD", billing_cycle: "annual", renewal_date: "2025-11-29", cancel_by: "2025-11-23", payment_instrument: "Stanbic IBTC Visa ····4091", status: "active", created_at: "2025-01-01", updated_at: "2025-01-01" },
  { id: "demo-7", user_id: null, vendor: "Cursor AI Pro", service_details: "Individual Engineer · Lead Seat", category: "Engineering", amount: 20, currency: "USD", billing_cycle: "monthly", renewal_date: "2025-11-26", cancel_by: "2025-11-24", payment_instrument: "FirstBank Master ····8820", status: "active", created_at: "2025-01-01", updated_at: "2025-01-01" },
  { id: "demo-8", user_id: null, vendor: "Adobe Creative Cloud", service_details: "All Apps Plan · Single User", category: "Design & Creative", amount: 59.99, currency: "USD", billing_cycle: "monthly", renewal_date: "2025-12-03", cancel_by: "2025-12-01", payment_instrument: "Stanbic IBTC Visa ····4091", status: "active", created_at: "2025-01-01", updated_at: "2025-01-01" },
  { id: "demo-9", user_id: null, vendor: "Mailchimp Standard", service_details: "5k contacts · Replaced by Resend", category: "Marketing & Sales", amount: 75, currency: "USD", billing_cycle: "monthly", renewal_date: "2025-12-08", cancel_by: "2025-12-06", payment_instrument: "GTBank Corp ····1104", status: "archived", created_at: "2025-01-01", updated_at: "2025-01-01" },
];
