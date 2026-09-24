// AUTO-GENERATED — do not hand-edit.
// Regenerate after any migration: supabase db reset && npm run db:types
// (or, against a linked remote project: supabase gen types typescript --linked)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      asset_basis_events: {
        Row: {
          amount: number
          asset_id: string
          basis_event_type: string
          created_at: string
          currency_code: string
          description: string | null
          id: string
          occurred_at: string
          user_id: string
        }
        Insert: {
          amount: number
          asset_id: string
          basis_event_type: string
          created_at?: string
          currency_code: string
          description?: string | null
          id?: string
          occurred_at: string
          user_id: string
        }
        Update: {
          amount?: number
          asset_id?: string
          basis_event_type?: string
          created_at?: string
          currency_code?: string
          description?: string | null
          id?: string
          occurred_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_basis_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_basis_events_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      asset_types: {
        Row: {
          code: string
          created_at: string
          display_name: string
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
        }
        Relationships: []
      }
      asset_valuations: {
        Row: {
          asset_id: string
          created_at: string
          currency_code: string
          id: string
          note: string | null
          source: string | null
          user_id: string
          valuation_type: string
          value: number
          valued_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          currency_code: string
          id?: string
          note?: string | null
          source?: string | null
          user_id: string
          valuation_type: string
          value: number
          valued_at: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          currency_code?: string
          id?: string
          note?: string | null
          source?: string | null
          user_id?: string
          valuation_type?: string
          value?: number
          valued_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_valuations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_valuations_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      assets: {
        Row: {
          acquired_at: string | null
          asset_type: string
          created_at: string
          currency_code: string
          description: string | null
          id: string
          is_archived: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acquired_at?: string | null
          asset_type: string
          created_at?: string
          currency_code: string
          description?: string | null
          id?: string
          is_archived?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acquired_at?: string | null
          asset_type?: string
          created_at?: string
          currency_code?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_asset_type_fkey"
            columns: ["asset_type"]
            isOneToOne: false
            referencedRelation: "asset_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "assets_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      cash_buckets: {
        Row: {
          bucket_type: string
          created_at: string
          currency_code: string
          id: string
          is_archived: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bucket_type: string
          created_at?: string
          currency_code: string
          id?: string
          is_archived?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bucket_type?: string
          created_at?: string
          currency_code?: string
          id?: string
          is_archived?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_buckets_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          bucket_id: string
          created_at: string
          currency_code: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          bucket_id: string
          created_at?: string
          currency_code: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          amount?: number
          bucket_id?: string
          created_at?: string
          currency_code?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "cash_buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "cash_movements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "financial_events"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_use_overrides: {
        Row: {
          bucket_id: string
          conflicts_snapshot: Json
          context_type: string | null
          created_at: string
          currency_code: string
          id: string
          note: string | null
          proposed_amount: number
          safe_to_deploy_after: number | null
          safe_to_deploy_before: number | null
          user_id: string
        }
        Insert: {
          bucket_id: string
          conflicts_snapshot: Json
          context_type?: string | null
          created_at?: string
          currency_code: string
          id?: string
          note?: string | null
          proposed_amount: number
          safe_to_deploy_after?: number | null
          safe_to_deploy_before?: number | null
          user_id: string
        }
        Update: {
          bucket_id?: string
          conflicts_snapshot?: Json
          context_type?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          note?: string | null
          proposed_amount?: number
          safe_to_deploy_after?: number | null
          safe_to_deploy_before?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_use_overrides_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "cash_buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_use_overrides_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          decimal_exponent: number
          display_name: string
          symbol: string
        }
        Insert: {
          code: string
          created_at?: string
          decimal_exponent: number
          display_name: string
          symbol: string
        }
        Update: {
          code?: string
          created_at?: string
          decimal_exponent?: number
          display_name?: string
          symbol?: string
        }
        Relationships: []
      }
      decision_choices: {
        Row: {
          choice: string
          created_at: string
          decision_id: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          choice: string
          created_at?: string
          decision_id: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          choice?: string
          created_at?: string
          decision_id?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_choices_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_scenario_evaluations: {
        Row: {
          created_at: string
          evaluated_at: string
          id: string
          scenario_id: string
          snapshot: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          evaluated_at?: string
          id?: string
          scenario_id: string
          snapshot: Json
          user_id: string
        }
        Update: {
          created_at?: string
          evaluated_at?: string
          id?: string
          scenario_id?: string
          snapshot?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_scenario_evaluations_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "decision_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_scenarios: {
        Row: {
          acquisition_costs: number | null
          capitalization_classification: string | null
          cash_required: number | null
          collateral_note: string | null
          created_at: string
          currency_code: string
          debt_fee_payment: number | null
          debt_interest_payment: number | null
          debt_principal_payment: number | null
          decision_id: string
          destination_bucket_id: string | null
          expected_future_sale_value: number | null
          expected_value_assumption: number | null
          gross_proceeds: number | null
          holding_period_months: number | null
          id: string
          interest_rate: number | null
          monthly_payment_assumption: number | null
          name: string
          note: string | null
          proceeds_costs: number | null
          sale_date_assumption: string | null
          source_bucket_id: string | null
          term_months: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          acquisition_costs?: number | null
          capitalization_classification?: string | null
          cash_required?: number | null
          collateral_note?: string | null
          created_at?: string
          currency_code: string
          debt_fee_payment?: number | null
          debt_interest_payment?: number | null
          debt_principal_payment?: number | null
          decision_id: string
          destination_bucket_id?: string | null
          expected_future_sale_value?: number | null
          expected_value_assumption?: number | null
          gross_proceeds?: number | null
          holding_period_months?: number | null
          id?: string
          interest_rate?: number | null
          monthly_payment_assumption?: number | null
          name: string
          note?: string | null
          proceeds_costs?: number | null
          sale_date_assumption?: string | null
          source_bucket_id?: string | null
          term_months?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          acquisition_costs?: number | null
          capitalization_classification?: string | null
          cash_required?: number | null
          collateral_note?: string | null
          created_at?: string
          currency_code?: string
          debt_fee_payment?: number | null
          debt_interest_payment?: number | null
          debt_principal_payment?: number | null
          decision_id?: string
          destination_bucket_id?: string | null
          expected_future_sale_value?: number | null
          expected_value_assumption?: number | null
          gross_proceeds?: number | null
          holding_period_months?: number | null
          id?: string
          interest_rate?: number | null
          monthly_payment_assumption?: number | null
          name?: string
          note?: string | null
          proceeds_costs?: number | null
          sale_date_assumption?: string | null
          source_bucket_id?: string | null
          term_months?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_scenarios_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "decision_scenarios_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_scenarios_destination_bucket_id_fkey"
            columns: ["destination_bucket_id"]
            isOneToOne: false
            referencedRelation: "cash_buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decision_scenarios_source_bucket_id_fkey"
            columns: ["source_bucket_id"]
            isOneToOne: false
            referencedRelation: "cash_buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      decision_types: {
        Row: {
          code: string
          created_at: string
          display_name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
          sort_order?: number
        }
        Relationships: []
      }
      decisions: {
        Row: {
          created_at: string
          decision_type_code: string
          description: string | null
          id: string
          linked_asset_id: string | null
          linked_liability_id: string | null
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decision_type_code: string
          description?: string | null
          id?: string
          linked_asset_id?: string | null
          linked_liability_id?: string | null
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decision_type_code?: string
          description?: string | null
          id?: string
          linked_asset_id?: string | null
          linked_liability_id?: string | null
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_decision_type_code_fkey"
            columns: ["decision_type_code"]
            isOneToOne: false
            referencedRelation: "decision_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "decisions_linked_asset_id_fkey"
            columns: ["linked_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_linked_liability_id_fkey"
            columns: ["linked_liability_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_events: {
        Row: {
          cash_flow_class: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_id: string | null
          received_category_code: string | null
          spending_category_code: string | null
          updated_at: string
          user_id: string
          voided_at: string | null
        }
        Insert: {
          cash_flow_class: string
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          idempotency_key?: string | null
          occurred_at: string
          operation_id?: string | null
          received_category_code?: string | null
          spending_category_code?: string | null
          updated_at?: string
          user_id: string
          voided_at?: string | null
        }
        Update: {
          cash_flow_class?: string
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          operation_id?: string | null
          received_category_code?: string | null
          spending_category_code?: string | null
          updated_at?: string
          user_id?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_events_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "financial_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_events_received_category_code_fkey"
            columns: ["received_category_code"]
            isOneToOne: false
            referencedRelation: "money_received_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "financial_events_spending_category_code_fkey"
            columns: ["spending_category_code"]
            isOneToOne: false
            referencedRelation: "money_spending_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      financial_operations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          idempotency_key?: string | null
          occurred_at: string
          operation_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          operation_type?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_rule_versions: {
        Row: {
          created_at: string
          effective_at: string
          id: string
          note: string | null
          rule_id: string
          threshold_value: number
          user_id: string
        }
        Insert: {
          created_at?: string
          effective_at?: string
          id?: string
          note?: string | null
          rule_id: string
          threshold_value: number
          user_id: string
        }
        Update: {
          created_at?: string
          effective_at?: string
          id?: string
          note?: string | null
          rule_id?: string
          threshold_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_rule_versions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "financial_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_rules: {
        Row: {
          created_at: string
          currency_code: string
          id: string
          rule_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          id?: string
          rule_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          id?: string
          rule_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_rules_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      fx_rates: {
        Row: {
          base_currency: string
          created_at: string
          event_id: string | null
          id: string
          quote_currency: string
          rate: number
          rate_as_of: string
          source: string
          user_id: string | null
        }
        Insert: {
          base_currency: string
          created_at?: string
          event_id?: string | null
          id?: string
          quote_currency: string
          rate: number
          rate_as_of: string
          source: string
          user_id?: string | null
        }
        Update: {
          base_currency?: string
          created_at?: string
          event_id?: string | null
          id?: string
          quote_currency?: string
          rate?: number
          rate_as_of?: string
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_base_currency_fkey"
            columns: ["base_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fx_rates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "financial_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_rates_quote_currency_fkey"
            columns: ["quote_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      goal_allocation_events: {
        Row: {
          amount: number
          bucket_id: string
          created_at: string
          currency_code: string
          event_type: string
          goal_id: string
          id: string
          idempotency_key: string | null
          note: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bucket_id: string
          created_at?: string
          currency_code: string
          event_type: string
          goal_id: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bucket_id?: string
          created_at?: string
          currency_code?: string
          event_type?: string
          goal_id?: string
          id?: string
          idempotency_key?: string | null
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_allocation_events_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "cash_buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_allocation_events_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "goal_allocation_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string | null
          goal_id: string
          id: string
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          goal_id: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          goal_id?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_milestones_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_target_history: {
        Row: {
          created_at: string
          currency_code: string | null
          effective_at: string
          goal_id: string
          id: string
          note: string | null
          target_date: string | null
          target_value: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code?: string | null
          effective_at?: string
          goal_id: string
          id?: string
          note?: string | null
          target_date?: string | null
          target_value?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string | null
          effective_at?: string
          goal_id?: string
          id?: string
          note?: string | null
          target_date?: string | null
          target_value?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_target_history_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "goal_target_history_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_types: {
        Row: {
          code: string
          created_at: string
          default_measurement_type: string
          display_name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          default_measurement_type: string
          display_name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          default_measurement_type?: string
          display_name?: string
          sort_order?: number
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          currency_code: string | null
          description: string | null
          goal_type_code: string
          id: string
          is_focus: boolean
          is_protected: boolean
          liability_id: string | null
          measurement_type: string
          name: string
          priority: number | null
          starting_liability_balance: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code?: string | null
          description?: string | null
          goal_type_code: string
          id?: string
          is_focus?: boolean
          is_protected?: boolean
          liability_id?: string | null
          measurement_type: string
          name: string
          priority?: number | null
          starting_liability_balance?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string | null
          description?: string | null
          goal_type_code?: string
          id?: string
          is_focus?: boolean
          is_protected?: boolean
          liability_id?: string | null
          measurement_type?: string
          name?: string
          priority?: number | null
          starting_liability_balance?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "goals_goal_type_code_fkey"
            columns: ["goal_type_code"]
            isOneToOne: false
            referencedRelation: "goal_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "goals_liability_id_fkey"
            columns: ["liability_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      liabilities: {
        Row: {
          counterparty: string | null
          created_at: string
          currency_code: string
          id: string
          interest_rate: number | null
          is_archived: boolean
          liability_type: string
          maturity_date: string | null
          name: string
          opened_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          counterparty?: string | null
          created_at?: string
          currency_code: string
          id?: string
          interest_rate?: number | null
          is_archived?: boolean
          liability_type: string
          maturity_date?: string | null
          name: string
          opened_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          counterparty?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          interest_rate?: number | null
          is_archived?: boolean
          liability_type?: string
          maturity_date?: string | null
          name?: string
          opened_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liabilities_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "liabilities_liability_type_fkey"
            columns: ["liability_type"]
            isOneToOne: false
            referencedRelation: "liability_types"
            referencedColumns: ["code"]
          },
        ]
      }
      liability_principal_events: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          description: string | null
          financial_event_id: string | null
          id: string
          liability_id: string
          occurred_at: string
          principal_event_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code: string
          description?: string | null
          financial_event_id?: string | null
          id?: string
          liability_id: string
          occurred_at: string
          principal_event_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          description?: string | null
          financial_event_id?: string | null
          id?: string
          liability_id?: string
          occurred_at?: string
          principal_event_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liability_principal_events_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "liability_principal_events_financial_event_id_fkey"
            columns: ["financial_event_id"]
            isOneToOne: false
            referencedRelation: "financial_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liability_principal_events_liability_id_fkey"
            columns: ["liability_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      liability_types: {
        Row: {
          code: string
          created_at: string
          display_name: string
        }
        Insert: {
          code: string
          created_at?: string
          display_name: string
        }
        Update: {
          code?: string
          created_at?: string
          display_name?: string
        }
        Relationships: []
      }
      money_received_categories: {
        Row: {
          cash_flow_class: string
          code: string
          created_at: string
          display_name: string
        }
        Insert: {
          cash_flow_class: string
          code: string
          created_at?: string
          display_name: string
        }
        Update: {
          cash_flow_class?: string
          code?: string
          created_at?: string
          display_name?: string
        }
        Relationships: []
      }
      money_spending_categories: {
        Row: {
          cash_flow_class: string
          code: string
          created_at: string
          display_name: string
        }
        Insert: {
          cash_flow_class: string
          code: string
          created_at?: string
          display_name: string
        }
        Update: {
          cash_flow_class?: string
          code?: string
          created_at?: string
          display_name?: string
        }
        Relationships: []
      }
      obligations: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          description: string | null
          due_date: string | null
          funding_goal_id: string | null
          id: string
          is_protected: boolean
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code: string
          description?: string | null
          due_date?: string | null
          funding_goal_id?: string | null
          id?: string
          is_protected?: boolean
          name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          description?: string | null
          due_date?: string | null
          funding_goal_id?: string | null
          id?: string
          is_protected?: boolean
          name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "obligations_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "obligations_funding_goal_id_fkey"
            columns: ["funding_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          onboarding_completed: boolean
          preferred_currency: string | null
          preferred_name: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id: string
          onboarding_completed?: boolean
          preferred_currency?: string | null
          preferred_name?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          onboarding_completed?: boolean
          preferred_currency?: string | null
          preferred_name?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      receivable_ledger_events: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          description: string | null
          financial_event_id: string | null
          id: string
          ledger_event_type: string
          occurred_at: string
          receivable_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code: string
          description?: string | null
          financial_event_id?: string | null
          id?: string
          ledger_event_type: string
          occurred_at: string
          receivable_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          description?: string | null
          financial_event_id?: string | null
          id?: string
          ledger_event_type?: string
          occurred_at?: string
          receivable_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_ledger_events_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "receivable_ledger_events_financial_event_id_fkey"
            columns: ["financial_event_id"]
            isOneToOne: false
            referencedRelation: "financial_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_ledger_events_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "receivables"
            referencedColumns: ["id"]
          },
        ]
      }
      receivable_recoverable_estimates: {
        Row: {
          created_at: string
          currency_code: string
          estimated_at: string
          id: string
          note: string | null
          receivable_id: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          currency_code: string
          estimated_at: string
          id?: string
          note?: string | null
          receivable_id: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          currency_code?: string
          estimated_at?: string
          id?: string
          note?: string | null
          receivable_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "receivable_recoverable_estimates_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "receivable_recoverable_estimates_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "receivables"
            referencedColumns: ["id"]
          },
        ]
      }
      receivables: {
        Row: {
          created_at: string
          currency_code: string
          description: string | null
          expected_payment_date: string | null
          id: string
          is_archived: boolean
          last_follow_up_at: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          description?: string | null
          expected_payment_date?: string | null
          id?: string
          is_archived?: boolean
          last_follow_up_at?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          description?: string | null
          expected_payment_date?: string | null
          id?: string
          is_archived?: boolean
          last_follow_up_at?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      asset_current_basis: {
        Args: never
        Returns: {
          asset_id: string
          basis: string
          currency_code: string
        }[]
      }
      asset_latest_valuations: {
        Args: never
        Returns: {
          asset_id: string
          currency_code: string
          valuation_type: string
          value: string
          valued_at: string
        }[]
      }
      asset_native_currency_totals: {
        Args: never
        Returns: {
          currency_code: string
          total_estimated_value: string
        }[]
      }
      asset_quicksale_coverage: {
        Args: never
        Returns: {
          active_asset_count: number
          coverage_status: string
          currency_code: string
          quicksale_estimate_count: number
          quicksale_sum: string
        }[]
      }
      asset_summary: {
        Args: never
        Returns: {
          asset_id: string
          asset_type: string
          cost_basis: string
          currency_code: string
          estimated_current_value: string
          is_archived: boolean
          latest_valued_at: string
          name: string
          quick_sale_estimate: string
          target_value: string
        }[]
      }
      asset_value_by_type: {
        Args: never
        Returns: {
          asset_type: string
          currency_code: string
          total_estimated_value: string
        }[]
      }
      create_asset: {
        Args: {
          p_acquired_at?: string
          p_asset_type: string
          p_currency_code: string
          p_description?: string
          p_estimated_current_value?: number
          p_initial_basis_amount?: number
          p_name: string
          p_quick_sale_estimate?: number
          p_target_value?: number
          p_valued_at?: string
        }
        Returns: {
          acquired_at: string | null
          asset_type: string
          created_at: string
          currency_code: string
          description: string | null
          id: string
          is_archived: boolean
          name: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "assets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_decision: {
        Args: {
          p_decision_type_code: string
          p_description?: string
          p_linked_asset_id?: string
          p_linked_liability_id?: string
          p_name: string
        }
        Returns: {
          created_at: string
          decision_type_code: string
          description: string | null
          id: string
          linked_asset_id: string | null
          linked_liability_id: string | null
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_decision_scenario: {
        Args: {
          p_acquisition_costs?: number
          p_capitalization_classification?: string
          p_cash_required?: number
          p_collateral_note?: string
          p_currency_code: string
          p_debt_fee_payment?: number
          p_debt_interest_payment?: number
          p_debt_principal_payment?: number
          p_decision_id: string
          p_destination_bucket_id?: string
          p_expected_future_sale_value?: number
          p_expected_value_assumption?: number
          p_gross_proceeds?: number
          p_holding_period_months?: number
          p_interest_rate?: number
          p_monthly_payment_assumption?: number
          p_name: string
          p_note?: string
          p_proceeds_costs?: number
          p_sale_date_assumption?: string
          p_source_bucket_id?: string
          p_term_months?: number
        }
        Returns: {
          acquisition_costs: number | null
          capitalization_classification: string | null
          cash_required: number | null
          collateral_note: string | null
          created_at: string
          currency_code: string
          debt_fee_payment: number | null
          debt_interest_payment: number | null
          debt_principal_payment: number | null
          decision_id: string
          destination_bucket_id: string | null
          expected_future_sale_value: number | null
          expected_value_assumption: number | null
          gross_proceeds: number | null
          holding_period_months: number | null
          id: string
          interest_rate: number | null
          monthly_payment_assumption: number | null
          name: string
          note: string | null
          proceeds_costs: number | null
          sale_date_assumption: string | null
          source_bucket_id: string | null
          term_months: number | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "decision_scenarios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_financial_rule: {
        Args: {
          p_currency_code: string
          p_note?: string
          p_rule_type: string
          p_threshold_value: number
        }
        Returns: {
          created_at: string
          currency_code: string
          id: string
          rule_type: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_goal: {
        Args: {
          p_currency_code?: string
          p_description?: string
          p_goal_type_code: string
          p_is_protected?: boolean
          p_liability_id?: string
          p_measurement_type: string
          p_name: string
          p_target_date?: string
          p_target_value?: number
        }
        Returns: {
          created_at: string
          currency_code: string | null
          description: string | null
          goal_type_code: string
          id: string
          is_focus: boolean
          is_protected: boolean
          liability_id: string | null
          measurement_type: string
          name: string
          priority: number | null
          starting_liability_balance: number | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "goals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_liability: {
        Args: {
          p_counterparty?: string
          p_currency_code: string
          p_interest_rate?: number
          p_liability_type: string
          p_maturity_date?: string
          p_name: string
          p_occurred_at?: string
          p_opened_at?: string
          p_opening_principal: number
        }
        Returns: {
          counterparty: string | null
          created_at: string
          currency_code: string
          id: string
          interest_rate: number | null
          is_archived: boolean
          liability_type: string
          maturity_date: string | null
          name: string
          opened_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "liabilities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_obligation: {
        Args: {
          p_amount: number
          p_currency_code: string
          p_description?: string
          p_due_date?: string
          p_funding_goal_id?: string
          p_is_protected?: boolean
          p_name: string
        }
        Returns: {
          amount: number
          created_at: string
          currency_code: string
          description: string | null
          due_date: string | null
          funding_goal_id: string | null
          id: string
          is_protected: boolean
          name: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "obligations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_receivable: {
        Args: {
          p_currency_code: string
          p_description?: string
          p_estimated_recoverable_value?: number
          p_expected_payment_date?: string
          p_face_amount: number
          p_name: string
          p_occurred_at?: string
        }
        Returns: {
          created_at: string
          currency_code: string
          description: string | null
          expected_payment_date: string | null
          id: string
          is_archived: boolean
          last_follow_up_at: string | null
          name: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "receivables"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decision_choice_history: {
        Args: { p_decision_id: string; p_limit?: number }
        Returns: {
          choice: string
          created_at: string
          id: string
          note: string
        }[]
      }
      decision_scenario_evaluation_history: {
        Args: { p_limit?: number; p_scenario_id: string }
        Returns: {
          created_at: string
          evaluated_at: string
          id: string
          snapshot: Json
        }[]
      }
      decision_summary: {
        Args: never
        Returns: {
          created_at: string
          current_choice: string
          current_choice_at: string
          decision_id: string
          decision_type_code: string
          decision_type_label: string
          description: string
          linked_asset_id: string
          linked_asset_name: string
          linked_liability_id: string
          linked_liability_name: string
          name: string
          scenario_count: number
          status: string
        }[]
      }
      evaluate_decision_scenario: {
        Args: { p_scenario_id: string }
        Returns: {
          acquisition_costs: string
          basis_after_capitalized_improvement: string
          bucket_balance_after: string
          bucket_balance_before: string
          cash_required: string
          currency_code: string
          currency_safe_to_deploy_after: string
          currency_safe_to_deploy_before: string
          debt_fee_payment: string
          debt_interest_payment: string
          debt_principal_payment: string
          decision_id: string
          decision_type_code: string
          destination_bucket_balance: string
          expected_future_sale_value: string
          expected_value_assumption: string
          gross_proceeds: string
          hypothetical_bucket_id: string
          hypothetical_liability_outstanding_after: string
          linked_asset_cost_basis: string
          linked_asset_id: string
          linked_asset_latest_value: string
          linked_asset_quick_sale_estimate: string
          linked_asset_target_value: string
          linked_liability_id: string
          linked_liability_outstanding_principal: string
          minimum_cash_floor_status: string
          missing_information: string[]
          net_immediate_cash_delta: string
          net_proceeds: string
          overall_status: string
          proceeds_costs: string
          projected_gross_profit_loss: string
          protected_goal_status: string
          protected_obligation_status: string
          retained_deficit_after: string
          retained_deficit_before: string
          scenario_id: string
          source_bucket_balance: string
          total_cash_required: string
        }[]
      }
      evaluate_hypothetical_bucket_liquidity: {
        Args: { p_bucket_id: string; p_delta: number }
        Returns: {
          bucket_id: string
          currency_code: string
          currency_safe_to_deploy_after: string
          currency_safe_to_deploy_before: string
          current_allocation_shortfall: string
          current_balance: string
          current_protected_allocation: string
          hypothetical_delta: string
          minimum_cash_floor_status: string
          post_use_allocation_shortfall: string
          post_use_balance: string
          protected_commitments_after: string
          protected_goal_cash_after: string
          protected_goal_status: string
          protected_obligation_status: string
          retained_deficit_after: string
          retained_deficit_before: string
          uncovered_protected_obligations_after: string
        }[]
      }
      evaluate_proposed_cash_use: {
        Args: { p_amount: number; p_bucket_id: string }
        Returns: {
          bucket_id: string
          currency_code: string
          currency_safe_to_deploy_after: string
          currency_safe_to_deploy_before: string
          current_allocation_shortfall: string
          current_balance: string
          current_protected_allocation: string
          minimum_cash_floor_status: string
          post_use_allocation_shortfall: string
          post_use_balance: string
          proposed_amount: string
          protected_commitments_after: string
          protected_goal_cash_after: string
          protected_goal_status: string
          protected_obligation_status: string
          retained_deficit_after: string
          uncovered_protected_obligations_after: string
        }[]
      }
      financial_position_by_currency: {
        Args: never
        Returns: {
          allocation_shortfall: string
          asset_quick_sale_potential: string
          currency_code: string
          liabilities_outstanding: string
          liquid_cash: string
          minimum_cash_floor: string
          net_worth: string
          non_cash_asset_value: string
          protected_commitments: string
          protected_goal_cash: string
          receivables_estimated_recoverable: string
          receivables_outstanding: string
          receivables_recoverability_difference: string
          required_retained_cash: string
          retained_deficit: string
          safe_to_deploy: string
          safe_to_deploy_status: string
        }[]
      }
      financial_rule_history: {
        Args: { p_limit?: number; p_rule_id: string }
        Returns: {
          effective_at: string
          id: string
          note: string
          threshold_value: string
        }[]
      }
      financial_rule_summary: {
        Args: never
        Returns: {
          currency_code: string
          current_threshold: string
          effective_at: string
          rule_id: string
          rule_type: string
          status: string
        }[]
      }
      goal_allocated_total: { Args: { p_goal_id: string }; Returns: number }
      goal_allocation_history: {
        Args: { p_goal_id: string; p_limit?: number }
        Returns: {
          amount: string
          bucket_id: string
          created_at: string
          currency_code: string
          event_type: string
          id: string
          note: string
        }[]
      }
      goal_backed_protected_allocation: {
        Args: {
          p_goal_id: string
          p_hypothetical_bucket_id?: string
          p_hypothetical_delta?: number
        }
        Returns: number
      }
      goal_bucket_allocated_total: {
        Args: { p_bucket_id: string }
        Returns: number
      }
      goal_bucket_available_to_allocate: {
        Args: { p_bucket_id: string }
        Returns: number
      }
      goal_bucket_shortfalls: {
        Args: never
        Returns: {
          allocated_total: string
          balance: string
          bucket_id: string
          bucket_name: string
          currency_code: string
          shortfall: string
        }[]
      }
      goal_current_target: {
        Args: { p_goal_id: string }
        Returns: {
          currency_code: string
          effective_at: string
          target_date: string
          target_value: number
        }[]
      }
      goal_native_currency_totals: {
        Args: never
        Returns: {
          currency_code: string
          total_allocated: string
        }[]
      }
      goal_protected_allocation_totals: {
        Args: never
        Returns: {
          currency_code: string
          total_protected_allocated: string
        }[]
      }
      goal_required_pace: {
        Args: { p_goal_id: string }
        Returns: {
          amount: string
          currency_code: string
          periods_remaining: number
          status: string
        }[]
      }
      goal_summary: {
        Args: never
        Returns: {
          allocated_total: string
          created_at: string
          currency_code: string
          current_outstanding_principal: string
          debt_progress_percentage: number
          description: string
          goal_id: string
          goal_type_code: string
          goal_type_label: string
          is_focus: boolean
          is_protected: boolean
          liability_id: string
          measurement_type: string
          milestone_completed_count: number
          milestone_total_count: number
          name: string
          percentage: number
          priority: number
          remaining: string
          required_pace_amount: string
          required_pace_periods_remaining: number
          required_pace_status: string
          starting_liability_balance: string
          status: string
          target_date: string
          target_value: string
        }[]
      }
      goal_target_history_list: {
        Args: { p_goal_id: string; p_limit?: number }
        Returns: {
          currency_code: string
          effective_at: string
          id: string
          note: string
          target_date: string
          target_value: string
        }[]
      }
      liability_native_currency_totals: {
        Args: never
        Returns: {
          currency_code: string
          total_outstanding: string
        }[]
      }
      liability_outstanding_principal: {
        Args: { p_liability_id: string }
        Returns: number
      }
      liability_principal_history: {
        Args: { p_limit?: number }
        Returns: {
          amount: string
          currency_code: string
          description: string
          liability_id: string
          occurred_at: string
          principal_event_id: string
          principal_event_type: string
          voided: boolean
        }[]
      }
      liability_summary: {
        Args: never
        Returns: {
          currency_code: string
          interest_rate: number
          is_archived: boolean
          liability_id: string
          liability_type: string
          maturity_date: string
          name: string
          opened_at: string
          outstanding_principal: string
          principal_repaid: string
        }[]
      }
      money_bucket_balances: {
        Args: never
        Returns: {
          balance: string
          bucket_id: string
          currency_code: string
        }[]
      }
      money_currency_totals: {
        Args: never
        Returns: {
          balance: string
          currency_code: string
        }[]
      }
      money_period_summary: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          cash_in: string
          cash_out: string
          currency_code: string
          earned_income: string
          expense: string
          net_external_cash_flow: string
          transfer_in: string
          transfer_out: string
        }[]
      }
      money_recent_activity: {
        Args: { p_limit?: number }
        Returns: {
          amount: string
          bucket_id: string
          cash_flow_class: string
          currency_code: string
          description: string
          event_id: string
          event_type: string
          movement_id: string
          occurred_at: string
          received_category_code: string
          spending_category_code: string
          voided_at: string
        }[]
      }
      obligation_summary: {
        Args: never
        Returns: {
          amount: string
          created_at: string
          currency_code: string
          description: string
          due_date: string
          funding_goal_id: string
          is_overdue: boolean
          is_protected: boolean
          name: string
          obligation_id: string
          status: string
        }[]
      }
      receivable_ledger_history: {
        Args: { p_limit?: number }
        Returns: {
          amount: string
          currency_code: string
          description: string
          ledger_event_id: string
          ledger_event_type: string
          occurred_at: string
          receivable_id: string
          voided: boolean
        }[]
      }
      receivable_native_currency_totals: {
        Args: never
        Returns: {
          currency_code: string
          total_outstanding: string
        }[]
      }
      receivable_outstanding_amount: {
        Args: { p_receivable_id: string }
        Returns: number
      }
      receivable_recoverability_coverage: {
        Args: never
        Returns: {
          active_receivable_count: number
          coverage_status: string
          currency_code: string
          recoverability_estimate_count: number
          recoverable_sum: string
        }[]
      }
      receivable_summary: {
        Args: never
        Returns: {
          currency_code: string
          estimated_recoverable_value: string
          expected_payment_date: string
          face_amount: string
          is_archived: boolean
          last_follow_up_at: string
          latest_recovery_at: string
          name: string
          outstanding_amount: string
          receivable_id: string
          recovered_amount: string
        }[]
      }
      record_asset_basis_event: {
        Args: {
          p_amount: number
          p_asset_id: string
          p_basis_event_type: string
          p_description?: string
          p_occurred_at?: string
        }
        Returns: {
          amount: number
          asset_id: string
          basis_event_type: string
          created_at: string
          currency_code: string
          description: string | null
          id: string
          occurred_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "asset_basis_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_asset_valuation: {
        Args: {
          p_asset_id: string
          p_note?: string
          p_source?: string
          p_valuation_type: string
          p_value: number
          p_valued_at?: string
        }
        Returns: {
          asset_id: string
          created_at: string
          currency_code: string
          id: string
          note: string | null
          source: string | null
          user_id: string
          valuation_type: string
          value: number
          valued_at: string
        }
        SetofOptions: {
          from: "*"
          to: "asset_valuations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_cash_use_override: {
        Args: {
          p_amount: number
          p_bucket_id: string
          p_context_type?: string
          p_note?: string
        }
        Returns: {
          bucket_id: string
          conflicts_snapshot: Json
          context_type: string | null
          created_at: string
          currency_code: string
          id: string
          note: string | null
          proposed_amount: number
          safe_to_deploy_after: number | null
          safe_to_deploy_before: number | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_use_overrides"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_debt_payment: {
        Args: {
          p_bucket_id: string
          p_description?: string
          p_fee_amount?: number
          p_idempotency_key?: string
          p_interest_amount?: number
          p_liability_id: string
          p_occurred_at?: string
          p_principal_amount?: number
        }
        Returns: {
          created_at: string
          description: string | null
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_type: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_decision_choice: {
        Args: { p_choice: string; p_decision_id: string; p_note?: string }
        Returns: {
          choice: string
          created_at: string
          decision_id: string
          id: string
          note: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "decision_choices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_financial_rule_version: {
        Args: { p_note?: string; p_rule_id: string; p_threshold_value: number }
        Returns: {
          created_at: string
          effective_at: string
          id: string
          note: string | null
          rule_id: string
          threshold_value: number
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "financial_rule_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_fx_transfer: {
        Args: {
          p_description?: string
          p_destination_amount: number
          p_destination_bucket_id: string
          p_idempotency_key?: string
          p_occurred_at?: string
          p_source_amount: number
          p_source_bucket_id: string
        }
        Returns: {
          cash_flow_class: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_id: string | null
          received_category_code: string | null
          spending_category_code: string | null
          updated_at: string
          user_id: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "financial_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_goal_allocation: {
        Args: {
          p_amount: number
          p_bucket_id: string
          p_goal_id: string
          p_idempotency_key?: string
          p_note?: string
        }
        Returns: {
          amount: number
          bucket_id: string
          created_at: string
          currency_code: string
          event_type: string
          goal_id: string
          id: string
          idempotency_key: string | null
          note: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "goal_allocation_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_goal_milestone: {
        Args: {
          p_due_date?: string
          p_goal_id: string
          p_sort_order?: number
          p_title: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          due_date: string | null
          goal_id: string
          id: string
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "goal_milestones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_goal_reallocation: {
        Args: {
          p_amount: number
          p_bucket_id: string
          p_from_goal_id: string
          p_idempotency_key?: string
          p_note?: string
          p_to_goal_id: string
        }
        Returns: {
          amount: number
          bucket_id: string
          created_at: string
          currency_code: string
          event_type: string
          goal_id: string
          id: string
          idempotency_key: string | null
          note: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "goal_allocation_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_goal_release: {
        Args: {
          p_amount: number
          p_bucket_id: string
          p_goal_id: string
          p_idempotency_key?: string
          p_note?: string
        }
        Returns: {
          amount: number
          bucket_id: string
          created_at: string
          currency_code: string
          event_type: string
          goal_id: string
          id: string
          idempotency_key: string | null
          note: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "goal_allocation_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_goal_target: {
        Args: {
          p_goal_id: string
          p_note?: string
          p_target_date?: string
          p_target_value?: number
        }
        Returns: {
          created_at: string
          currency_code: string | null
          effective_at: string
          goal_id: string
          id: string
          note: string | null
          target_date: string | null
          target_value: number | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "goal_target_history"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_liability_adjustment: {
        Args: {
          p_amount: number
          p_description?: string
          p_liability_id: string
          p_occurred_at?: string
        }
        Returns: {
          amount: number
          created_at: string
          currency_code: string
          description: string | null
          financial_event_id: string | null
          id: string
          liability_id: string
          occurred_at: string
          principal_event_type: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "liability_principal_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_loan_proceeds: {
        Args: {
          p_amount: number
          p_bucket_id: string
          p_description?: string
          p_idempotency_key?: string
          p_liability_id: string
          p_occurred_at?: string
        }
        Returns: {
          cash_flow_class: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_id: string | null
          received_category_code: string | null
          spending_category_code: string | null
          updated_at: string
          user_id: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "financial_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_manual_reporting_rate: {
        Args: {
          p_base_currency: string
          p_quote_currency: string
          p_rate: number
          p_rate_as_of?: string
        }
        Returns: {
          base_currency: string
          created_at: string
          event_id: string | null
          id: string
          quote_currency: string
          rate: number
          rate_as_of: string
          source: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fx_rates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_money_received: {
        Args: {
          p_amount: number
          p_bucket_id: string
          p_category_code: string
          p_description?: string
          p_idempotency_key?: string
          p_occurred_at?: string
        }
        Returns: {
          cash_flow_class: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_id: string | null
          received_category_code: string | null
          spending_category_code: string | null
          updated_at: string
          user_id: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "financial_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_money_spent: {
        Args: {
          p_amount: number
          p_bucket_id: string
          p_category_code: string
          p_description?: string
          p_idempotency_key?: string
          p_occurred_at?: string
        }
        Returns: {
          cash_flow_class: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_id: string | null
          received_category_code: string | null
          spending_category_code: string | null
          updated_at: string
          user_id: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "financial_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_opening_balance: {
        Args: {
          p_amount: number
          p_bucket_id: string
          p_description?: string
          p_idempotency_key?: string
          p_occurred_at?: string
        }
        Returns: {
          cash_flow_class: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_id: string | null
          received_category_code: string | null
          spending_category_code: string | null
          updated_at: string
          user_id: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "financial_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_receivable_adjustment: {
        Args: {
          p_amount: number
          p_description?: string
          p_occurred_at?: string
          p_receivable_id: string
        }
        Returns: {
          amount: number
          created_at: string
          currency_code: string
          description: string | null
          financial_event_id: string | null
          id: string
          ledger_event_type: string
          occurred_at: string
          receivable_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "receivable_ledger_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_receivable_recovery: {
        Args: {
          p_amount: number
          p_bucket_id: string
          p_description?: string
          p_idempotency_key?: string
          p_occurred_at?: string
          p_receivable_id: string
        }
        Returns: {
          cash_flow_class: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_id: string | null
          received_category_code: string | null
          spending_category_code: string | null
          updated_at: string
          user_id: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "financial_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_recoverable_estimate: {
        Args: {
          p_estimated_at?: string
          p_note?: string
          p_receivable_id: string
          p_value: number
        }
        Returns: {
          created_at: string
          currency_code: string
          estimated_at: string
          id: string
          note: string | null
          receivable_id: string
          user_id: string
          value: number
        }
        SetofOptions: {
          from: "*"
          to: "receivable_recoverable_estimates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_transfer: {
        Args: {
          p_amount: number
          p_description?: string
          p_destination_bucket_id: string
          p_idempotency_key?: string
          p_occurred_at?: string
          p_source_bucket_id: string
        }
        Returns: {
          cash_flow_class: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_id: string | null
          received_category_code: string | null
          spending_category_code: string | null
          updated_at: string
          user_id: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "financial_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reporting_fx_rates: {
        Args: { p_reporting_currency: string }
        Returns: {
          base_currency: string
          quote_currency: string
          rate: string
          rate_as_of: string
          source: string
        }[]
      }
      resolve_period_bounds: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          period_end: string
          period_start: string
        }[]
      }
      rules_uncovered_protected_obligations: {
        Args: {
          p_hypothetical_bucket_id?: string
          p_hypothetical_delta?: number
        }
        Returns: {
          currency_code: string
          uncovered_amount: number
        }[]
      }
      safe_to_deploy_by_currency: {
        Args: {
          p_hypothetical_bucket_id?: string
          p_hypothetical_delta?: number
        }
        Returns: {
          currency_code: string
          liquid_cash: string
          minimum_cash_floor: string
          protected_commitments: string
          protected_goal_cash: string
          required_retained_cash: string
          retained_deficit: string
          safe_to_deploy: string
          status: string
          uncovered_protected_obligations: string
        }[]
      }
      save_decision_scenario_evaluation: {
        Args: { p_scenario_id: string }
        Returns: {
          created_at: string
          evaluated_at: string
          id: string
          scenario_id: string
          snapshot: Json
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "decision_scenario_evaluations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_focus_goal: { Args: { p_goal_id?: string }; Returns: undefined }
      upcoming_obligations: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          amount: string
          currency_code: string
          due_date: string
          is_protected: boolean
          name: string
          obligation_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

