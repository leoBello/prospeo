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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      generated_message: {
        Row: {
          channel: string
          content: string
          created_at: string
          id: string
          model: string
          prompt_version: string
          prospect_id: string
        }
        Insert: {
          channel: string
          content: string
          created_at?: string
          id?: string
          model: string
          prompt_version: string
          prospect_id: string
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          id?: string
          model?: string
          prompt_version?: string
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_message_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospect"
            referencedColumns: ["id"]
          },
        ]
      }
      interaction: {
        Row: {
          body: string | null
          id: string
          kind: Database["public"]["Enums"]["interaction_kind"]
          occurred_at: string
          prospect_id: string
        }
        Insert: {
          body?: string | null
          id?: string
          kind: Database["public"]["Enums"]["interaction_kind"]
          occurred_at?: string
          prospect_id: string
        }
        Update: {
          body?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["interaction_kind"]
          occurred_at?: string
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interaction_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospect"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect: {
        Row: {
          address: string
          city: string
          date_creation: string | null
          denomination: string
          denomination_usuelle: string | null
          discovered_at: string
          effectif_code: string | null
          id: string
          is_entrepreneur_individuel: boolean
          is_head_office: boolean
          latitude: number | null
          longitude: number | null
          naf_code: string | null
          postal_code: string
          siren: string
          siret: string
          trade_slug: string
          updated_at: string
        }
        Insert: {
          address: string
          city: string
          date_creation?: string | null
          denomination: string
          denomination_usuelle?: string | null
          discovered_at?: string
          effectif_code?: string | null
          id?: string
          is_entrepreneur_individuel?: boolean
          is_head_office?: boolean
          latitude?: number | null
          longitude?: number | null
          naf_code?: string | null
          postal_code: string
          siren: string
          siret: string
          trade_slug: string
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          date_creation?: string | null
          denomination?: string
          denomination_usuelle?: string | null
          discovered_at?: string
          effectif_code?: string | null
          id?: string
          is_entrepreneur_individuel?: boolean
          is_head_office?: boolean
          latitude?: number | null
          longitude?: number | null
          naf_code?: string | null
          postal_code?: string
          siren?: string
          siret?: string
          trade_slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      prospect_enrichment: {
        Row: {
          declared_url: string | null
          enriched_at: string
          maps_url: string | null
          match_confidence: number | null
          matched_name: string | null
          phone_e164: string | null
          phone_kind: string | null
          place_id: string | null
          prospect_id: string
          rating: number | null
          review_count: number | null
          screenshot_paths: Json
          social_urls: Json
          source: string
          status: Database["public"]["Enums"]["enrichment_status"]
        }
        Insert: {
          declared_url?: string | null
          enriched_at?: string
          maps_url?: string | null
          match_confidence?: number | null
          matched_name?: string | null
          phone_e164?: string | null
          phone_kind?: string | null
          place_id?: string | null
          prospect_id: string
          rating?: number | null
          review_count?: number | null
          screenshot_paths?: Json
          social_urls?: Json
          source: string
          status: Database["public"]["Enums"]["enrichment_status"]
        }
        Update: {
          declared_url?: string | null
          enriched_at?: string
          maps_url?: string | null
          match_confidence?: number | null
          matched_name?: string | null
          phone_e164?: string | null
          phone_kind?: string | null
          place_id?: string | null
          prospect_id?: string
          rating?: number | null
          review_count?: number | null
          screenshot_paths?: Json
          social_urls?: Json
          source?: string
          status?: Database["public"]["Enums"]["enrichment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "prospect_enrichment_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: true
            referencedRelation: "prospect"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_pipeline: {
        Row: {
          next_action_at: string | null
          prospect_id: string
          status: Database["public"]["Enums"]["pipeline_status"]
          updated_at: string
        }
        Insert: {
          next_action_at?: string | null
          prospect_id: string
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
        }
        Update: {
          next_action_at?: string | null
          prospect_id?: string
          status?: Database["public"]["Enums"]["pipeline_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_pipeline_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: true
            referencedRelation: "prospect"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_score: {
        Row: {
          breakdown: Json
          computed_at: string
          prospect_id: string
          ruleset_version: string
          total: number
        }
        Insert: {
          breakdown: Json
          computed_at?: string
          prospect_id: string
          ruleset_version: string
          total: number
        }
        Update: {
          breakdown?: Json
          computed_at?: string
          prospect_id?: string
          ruleset_version?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "prospect_score_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: true
            referencedRelation: "prospect"
            referencedColumns: ["id"]
          },
        ]
      }
      web_presence: {
        Row: {
          category: Database["public"]["Enums"]["web_presence_category"] | null
          domain_available: boolean | null
          domain_candidates: Json
          final_url: string | null
          has_viewport_meta: boolean | null
          http_status: number | null
          is_https: boolean | null
          is_parked: boolean | null
          last_social_post_at: string | null
          probed_at: string | null
          probed_url: string | null
          prospect_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["web_presence_category"] | null
          domain_available?: boolean | null
          domain_candidates?: Json
          final_url?: string | null
          has_viewport_meta?: boolean | null
          http_status?: number | null
          is_https?: boolean | null
          is_parked?: boolean | null
          last_social_post_at?: string | null
          probed_at?: string | null
          probed_url?: string | null
          prospect_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["web_presence_category"] | null
          domain_available?: boolean | null
          domain_candidates?: Json
          final_url?: string | null
          has_viewport_meta?: boolean | null
          http_status?: number | null
          is_https?: boolean | null
          is_parked?: boolean | null
          last_social_post_at?: string | null
          probed_at?: string | null
          probed_url?: string | null
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_presence_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: true
            referencedRelation: "prospect"
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
      enrichment_status: "ok" | "not_found" | "ambiguous" | "blocked"
      interaction_kind: "appel" | "whatsapp" | "email" | "note"
      pipeline_status:
        | "a_contacter"
        | "contacte"
        | "relance"
        | "interesse"
        | "gagne"
        | "perdu"
        | "ne_pas_contacter"
      web_presence_category:
        | "none"
        | "social_only"
        | "directory_only"
        | "dead_site"
        | "has_site"
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
    Enums: {
      enrichment_status: ["ok", "not_found", "ambiguous", "blocked"],
      interaction_kind: ["appel", "whatsapp", "email", "note"],
      pipeline_status: [
        "a_contacter",
        "contacte",
        "relance",
        "interesse",
        "gagne",
        "perdu",
        "ne_pas_contacter",
      ],
      web_presence_category: [
        "none",
        "social_only",
        "directory_only",
        "dead_site",
        "has_site",
      ],
    },
  },
} as const
