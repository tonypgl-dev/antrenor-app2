export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      athletes: {
        Row: {
          archived: boolean
          birth_date: string | null
          created_at: string
          created_by_coach: string
          default_race: string
          coaching_start_date: string | null
          coaching_expires_at: string | null
          facility_start_date: string | null
          facility_expires_at: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          payment_mode: string
          phone: string | null
          public_slug: string | null
          structure: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          birth_date?: string | null
          created_at?: string
          created_by_coach: string
          default_race?: string
          coaching_start_date?: string | null
          coaching_expires_at?: string | null
          facility_start_date?: string | null
          facility_expires_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          payment_mode?: string
          phone?: string | null
          public_slug?: string | null
          structure?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          birth_date?: string | null
          created_at?: string
          created_by_coach?: string
          default_race?: string
          coaching_start_date?: string | null
          coaching_expires_at?: string | null
          facility_start_date?: string | null
          facility_expires_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          payment_mode?: string
          phone?: string | null
          public_slug?: string | null
          structure?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      attendance_days: {
        Row: {
          created_at: string
          date: string
          finalized_by_coach: string | null
          id: string
          status: string
        }
        Insert: {
          created_at?: string
          date?: string
          finalized_by_coach?: string | null
          id?: string
          status?: string
        }
        Update: {
          created_at?: string
          date?: string
          finalized_by_coach?: string | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      attendance_entries: {
        Row: {
          athlete_id: string
          attendance_day_id: string
          created_at: string
          created_by_coach: string | null
          id: string
          present: boolean
          session_paid: boolean
        }
        Insert: {
          athlete_id: string
          attendance_day_id: string
          created_at?: string
          created_by_coach?: string | null
          id?: string
          present?: boolean
          session_paid?: boolean
        }
        Update: {
          athlete_id?: string
          attendance_day_id?: string
          created_at?: string
          created_by_coach?: string | null
          id?: string
          present?: boolean
          session_paid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "attendance_entries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_entries_attendance_day_id_fkey"
            columns: ["attendance_day_id"]
            isOneToOne: false
            referencedRelation: "attendance_days"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_ledger: {
        Row: {
          amount: number
          athlete_id: string | null
          athlete_name: string | null
          created_at: string
          created_by_coach: string
          date: string
          id: string
          type: string
        }
        Insert: {
          amount: number
          athlete_id?: string | null
          athlete_name?: string | null
          created_at?: string
          created_by_coach: string
          date?: string
          id?: string
          type: string
        }
        Update: {
          amount?: number
          athlete_id?: string | null
          athlete_name?: string | null
          created_at?: string
          created_by_coach?: string
          date?: string
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      lane_assignments: {
        Row: {
          athlete_id: string | null
          created_at: string
          external_name: string | null
          id: string
          is_out: boolean
          lane_id: string
          nickname: string | null
          sort_order: number
          timing_session_id: string
        }
        Insert: {
          athlete_id?: string | null
          created_at?: string
          external_name?: string | null
          id?: string
          is_out?: boolean
          lane_id: string
          nickname?: string | null
          sort_order?: number
          timing_session_id: string
        }
        Update: {
          athlete_id?: string | null
          created_at?: string
          external_name?: string | null
          id?: string
          is_out?: boolean
          lane_id?: string
          nickname?: string | null
          sort_order?: number
          timing_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lane_assignments_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_assignments_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lane_assignments_timing_session_id_fkey"
            columns: ["timing_session_id"]
            isOneToOne: false
            referencedRelation: "timing_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      lanes: {
        Row: {
          black_threshold_seconds: number | null
          created_at: string
          id: string
          ideal_total_time_seconds: number | null
          is_preset: boolean
          laps_total: number
          name: string
          race_type: string
        }
        Insert: {
          black_threshold_seconds?: number | null
          created_at?: string
          id?: string
          ideal_total_time_seconds?: number | null
          is_preset?: boolean
          laps_total: number
          name: string
          race_type: string
        }
        Update: {
          black_threshold_seconds?: number | null
          created_at?: string
          id?: string
          ideal_total_time_seconds?: number | null
          is_preset?: boolean
          laps_total?: number
          name?: string
          race_type?: string
        }
        Relationships: []
      }
      lap_events: {
        Row: {
          created_at: string
          created_by_coach: string
          elapsed_ms: number
          id: string
          lane_assignment_id: string
          lap_number: number
          run_id: string
        }
        Insert: {
          created_at?: string
          created_by_coach: string
          elapsed_ms: number
          id?: string
          lane_assignment_id: string
          lap_number: number
          run_id: string
        }
        Update: {
          created_at?: string
          created_by_coach?: string
          elapsed_ms?: number
          id?: string
          lane_assignment_id?: string
          lap_number?: number
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lap_events_lane_assignment_id_fkey"
            columns: ["lane_assignment_id"]
            isOneToOne: false
            referencedRelation: "lane_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lap_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          lane_id: string
          run_number: number
          start_at: string | null
          status: string
          timing_session_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lane_id: string
          run_number?: number
          start_at?: string | null
          status?: string
          timing_session_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lane_id?: string
          run_number?: number
          start_at?: string | null
          status?: string
          timing_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_lane_id_fkey"
            columns: ["lane_id"]
            isOneToOne: false
            referencedRelation: "lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_timing_session_id_fkey"
            columns: ["timing_session_id"]
            isOneToOne: false
            referencedRelation: "timing_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          athlete_id: string
          created_at: string
          created_by_coach: string
          expires_at: string
          id: string
          starts_at: string
          type: string
        }
        Insert: {
          amount: number
          athlete_id: string
          created_at?: string
          created_by_coach: string
          expires_at: string
          id?: string
          starts_at?: string
          type: string
        }
        Update: {
          amount?: number
          athlete_id?: string
          created_at?: string
          created_by_coach?: string
          expires_at?: string
          id?: string
          starts_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      timing_sessions: {
        Row: {
          attendance_day_id: string | null
          created_at: string
          created_by_coach: string
          date: string
          id: string
        }
        Insert: {
          attendance_day_id?: string | null
          created_at?: string
          created_by_coach: string
          date?: string
          id?: string
        }
        Update: {
          attendance_day_id?: string | null
          created_at?: string
          created_by_coach?: string
          date?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timing_sessions_attendance_day_id_fkey"
            columns: ["attendance_day_id"]
            isOneToOne: false
            referencedRelation: "attendance_days"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
