import type { BillingCycle, Subscription, SubscriptionDraft, SubscriptionStatus } from "@/lib/subscriptions/types";

type SubscriptionRow = Subscription;
type SubscriptionInsert = SubscriptionDraft & { id?: string; user_id?: string | null; created_at?: string; updated_at?: string };
type SubscriptionUpdate = Partial<SubscriptionDraft> & { updated_at?: string };

export type Database = {
  public: {
    Tables: {
      renewme_admins: {
        Row: { user_id: string; granted_at: string };
        Insert: { user_id: string; granted_at?: string };
        Update: never;
        Relationships: [];
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: SubscriptionInsert;
        Update: SubscriptionUpdate;
        Relationships: [];
      };
      renewme_reminder_preferences: {
        Row: { user_id: string; email_enabled: boolean; created_at: string; updated_at: string };
        Insert: { user_id: string; email_enabled?: boolean; created_at?: string; updated_at?: string };
        Update: { email_enabled?: boolean; updated_at?: string };
        Relationships: [];
      };
      renewme_subscription_invoices: {
        Row: { id: string; user_id: string; subscription_id: string; renewal_id: string | null; file_path: string; file_name: string; content_type: string; file_size: number; created_at: string };
        Insert: { id?: string; user_id: string; subscription_id: string; renewal_id?: string | null; file_path: string; file_name: string; content_type: string; file_size: number; created_at?: string };
        Update: never;
        Relationships: [];
      };
      renewme_subscription_renewals: {
        Row: { id: string; user_id: string; subscription_id: string; renewal_date: string; amount: number; currency: string; payment_status: string; note: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; subscription_id: string; renewal_date: string; amount: number; currency: string; payment_status?: string; note?: string | null; created_at?: string; updated_at?: string };
        Update: { renewal_date?: string; amount?: number; currency?: string; payment_status?: string; note?: string | null; updated_at?: string };
        Relationships: [];
      };
      renewme_reminder_deliveries: {
        Row: {
          id: string;
          user_id: string;
          subscription_id: string | null;
          reminder_type: string;
          due_date: string;
          status: string;
          attempt_count: number;
          last_attempt_at: string | null;
          sent_at: string | null;
          provider_message_id: string | null;
          last_error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          subscription_id: string;
          reminder_type: string;
          due_date: string;
          status?: string;
          attempt_count?: number;
          last_attempt_at?: string | null;
          sent_at?: string | null;
          provider_message_id?: string | null;
          last_error?: string | null;
          created_at?: string;
        };
        Update: {
          status?: string;
          attempt_count?: number;
          last_attempt_at?: string | null;
          sent_at?: string | null;
          provider_message_id?: string | null;
          last_error?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      renewme_is_admin: { Args: Record<string, never>; Returns: boolean };
      renewme_admin_summary: {
        Args: Record<string, never>;
        Returns: { account_count: number; subscription_count: number; active_subscription_count: number; review_count: number }[];
      };
      renewme_admin_user_ids: { Args: Record<string, never>; Returns: { user_id: string }[] };
      renewme_is_admin_user: { Args: { target_user_id: string }; Returns: boolean };
      renewme_admin_search_accounts: {
        Args: { p_search?: string; p_page?: number; p_page_size?: number };
        Returns: { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null; banned_until: string | null; is_admin: boolean; total_count: number }[];
      };
      renewme_claim_due_reminders: {
        Args: { p_today?: string };
        Returns: { result_delivery_id: string; result_recipient_email: string | null; result_vendor: string; result_service_details: string | null; result_amount: number; result_currency: string; result_billing_cycle: string; result_reminder_type: string; result_due_date: string; result_attempt_count: number }[];
      };
      renewme_finish_reminder: {
        Args: { p_delivery_id: string; p_sent: boolean; p_provider_message_id?: string | null; p_error?: string | null };
        Returns: boolean;
      };
    };
    Enums: { subscription_status: SubscriptionStatus; billing_cycle: BillingCycle };
    CompositeTypes: Record<string, never>;
  };
};
