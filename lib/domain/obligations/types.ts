// Relative/extensioned imports — see the comment in
// lib/domain/profile/types.ts.
import type { Database } from "../../supabase/database.types.ts";

export type Obligation = Database["public"]["Tables"]["obligations"]["Row"];
export type ObligationStatus = "active" | "paid" | "cancelled" | "archived";

/**
 * Honest-nullable-mapping situation, same as every prior domain's summary
 * type — see lib/domain/goals/types.ts's GoalSummary comment.
 */
export interface ObligationSummary {
  obligationId: string;
  name: string;
  description: string | null;
  currencyCode: string;
  amount: string;
  dueDate: string | null;
  status: ObligationStatus;
  isProtected: boolean;
  fundingGoalId: string | null;
  /** Derived (active + due_date < today in the caller's profile timezone) — never a stored flag. */
  isOverdue: boolean;
  createdAt: string;
}

export interface UpcomingObligation {
  obligationId: string;
  name: string;
  currencyCode: string;
  amount: string;
  dueDate: string;
  isProtected: boolean;
}

export interface CreateObligationInput {
  name: string;
  currencyCode: string;
  amount: string;
  description?: string;
  dueDate?: string;
  /** Explicit user choice — never defaults to true. See create_obligation() in the migration. */
  isProtected?: boolean;
  fundingGoalId?: string;
}

/** Fields a user may change on an existing obligation — matches the DB's column-level UPDATE grant. */
export interface ObligationUpdate {
  name?: string;
  description?: string | null;
  currencyCode?: string;
  amount?: string;
  dueDate?: string | null;
  status?: ObligationStatus;
  isProtected?: boolean;
  fundingGoalId?: string | null;
}
