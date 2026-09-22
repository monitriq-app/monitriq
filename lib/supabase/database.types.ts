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
      financial_events: {
        Row: {
          cash_flow_class: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
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
          received_category_code?: string | null
          spending_category_code?: string | null
          updated_at?: string
          user_id?: string
          voided_at?: string | null
        }
        Relationships: [
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

