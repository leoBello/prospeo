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
      campaign: {
        Row: {
          auto_send: boolean
          auto_send_at: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          owner_id: string | null
          size: number
          state: Database["public"]["Enums"]["campaign_state"]
        }
        Insert: {
          auto_send?: boolean
          auto_send_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          owner_id?: string | null
          size: number
          state?: Database["public"]["Enums"]["campaign_state"]
        }
        Update: {
          auto_send?: boolean
          auto_send_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          owner_id?: string | null
          size?: number
          state?: Database["public"]["Enums"]["campaign_state"]
        }
        Relationships: []
      }
      campaign_job: {
        Row: {
          attempts: number
          campaign_id: string | null
          cost_eur: number | null
          finished_at: string | null
          id: number
          kind: Database["public"]["Enums"]["campaign_job_kind"]
          last_error: string | null
          prospect_id: string
          requested_at: string
          requested_by: string | null
          started_at: string | null
          state: Database["public"]["Enums"]["campaign_job_state"]
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          cost_eur?: number | null
          finished_at?: string | null
          id?: never
          kind?: Database["public"]["Enums"]["campaign_job_kind"]
          last_error?: string | null
          prospect_id: string
          requested_at?: string
          requested_by?: string | null
          started_at?: string | null
          state?: Database["public"]["Enums"]["campaign_job_state"]
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          cost_eur?: number | null
          finished_at?: string | null
          id?: never
          kind?: Database["public"]["Enums"]["campaign_job_kind"]
          last_error?: string | null
          prospect_id?: string
          requested_at?: string
          requested_by?: string | null
          started_at?: string | null
          state?: Database["public"]["Enums"]["campaign_job_state"]
        }
        Relationships: [
          {
            foreignKeyName: "campaign_job_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_job_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospect"
            referencedColumns: ["id"]
          },
        ]
      }
      connexion_plateforme: {
        Row: {
          compte_libelle: string | null
          connectee_at: string
          etat: Database["public"]["Enums"]["etat_connexion"]
          etat_constate_at: string | null
          id: string
          owner_id: string
          plateforme: Database["public"]["Enums"]["plateforme_connectee"]
          reference: string | null
        }
        Insert: {
          compte_libelle?: string | null
          connectee_at?: string
          etat?: Database["public"]["Enums"]["etat_connexion"]
          etat_constate_at?: string | null
          id?: string
          owner_id: string
          plateforme: Database["public"]["Enums"]["plateforme_connectee"]
          reference?: string | null
        }
        Update: {
          compte_libelle?: string | null
          connectee_at?: string
          etat?: Database["public"]["Enums"]["etat_connexion"]
          etat_constate_at?: string | null
          id?: string
          owner_id?: string
          plateforme?: Database["public"]["Enums"]["plateforme_connectee"]
          reference?: string | null
        }
        Relationships: []
      }
      connexion_secret: {
        Row: {
          chiffre: string
          cle_id: string
          connexion_id: string
          ecrit_at: string
          etiquette: string
          vecteur: string
        }
        Insert: {
          chiffre: string
          cle_id: string
          connexion_id: string
          ecrit_at?: string
          etiquette: string
          vecteur: string
        }
        Update: {
          chiffre?: string
          cle_id?: string
          connexion_id?: string
          ecrit_at?: string
          etiquette?: string
          vecteur?: string
        }
        Relationships: [
          {
            foreignKeyName: "connexion_secret_connexion_id_fkey"
            columns: ["connexion_id"]
            isOneToOne: true
            referencedRelation: "connexion_plateforme"
            referencedColumns: ["id"]
          },
        ]
      }
      deployment_event: {
        Row: {
          detail: string | null
          duration_ms: number | null
          id: number
          occurred_at: string
          outcome: Database["public"]["Enums"]["deployment_outcome"]
          prospect_id: string
          step: Database["public"]["Enums"]["deployment_step"]
        }
        Insert: {
          detail?: string | null
          duration_ms?: number | null
          id?: never
          occurred_at?: string
          outcome: Database["public"]["Enums"]["deployment_outcome"]
          prospect_id: string
          step: Database["public"]["Enums"]["deployment_step"]
        }
        Update: {
          detail?: string | null
          duration_ms?: number | null
          id?: never
          occurred_at?: string
          outcome?: Database["public"]["Enums"]["deployment_outcome"]
          prospect_id?: string
          step?: Database["public"]["Enums"]["deployment_step"]
        }
        Relationships: [
          {
            foreignKeyName: "deployment_event_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospect"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_message: {
        Row: {
          channel: string
          content: string
          created_at: string
          id: string
          model: string
          prompt_version: string
          prospect_id: string
          subject: string | null
        }
        Insert: {
          channel: string
          content: string
          created_at?: string
          id?: string
          model: string
          prompt_version: string
          prospect_id: string
          subject?: string | null
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          id?: string
          model?: string
          prompt_version?: string
          prospect_id?: string
          subject?: string | null
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
      message_send: {
        Row: {
          channel: string
          error: string | null
          generated_message_id: string | null
          id: string
          prospect_id: string
          provider: string
          provider_message_id: string | null
          recipient: string
          sent_at: string | null
          sent_by: string | null
          started_at: string
          state: Database["public"]["Enums"]["send_state"]
        }
        Insert: {
          channel: string
          error?: string | null
          generated_message_id?: string | null
          id?: string
          prospect_id: string
          provider: string
          provider_message_id?: string | null
          recipient: string
          sent_at?: string | null
          sent_by?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["send_state"]
        }
        Update: {
          channel?: string
          error?: string | null
          generated_message_id?: string | null
          id?: string
          prospect_id?: string
          provider?: string
          provider_message_id?: string | null
          recipient?: string
          sent_at?: string | null
          sent_by?: string | null
          started_at?: string
          state?: Database["public"]["Enums"]["send_state"]
        }
        Relationships: [
          {
            foreignKeyName: "message_send_generated_message_id_fkey"
            columns: ["generated_message_id"]
            isOneToOne: false
            referencedRelation: "generated_message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_send_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospect"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_event: {
        Row: {
          id: number
          next_action_at: string | null
          occurred_at: string
          origin: Database["public"]["Enums"]["pipeline_event_origin"]
          prospect_id: string
          status: Database["public"]["Enums"]["pipeline_status"]
        }
        Insert: {
          id?: never
          next_action_at?: string | null
          occurred_at?: string
          origin?: Database["public"]["Enums"]["pipeline_event_origin"]
          prospect_id: string
          status: Database["public"]["Enums"]["pipeline_status"]
        }
        Update: {
          id?: never
          next_action_at?: string | null
          occurred_at?: string
          origin?: Database["public"]["Enums"]["pipeline_event_origin"]
          prospect_id?: string
          status?: Database["public"]["Enums"]["pipeline_status"]
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_event_prospect_id_fkey"
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
          is_closed: boolean
          is_entrepreneur_individuel: boolean
          is_head_office: boolean
          latitude: number | null
          longitude: number | null
          naf_code: string | null
          owner_id: string
          postal_code: string
          reconciled_at: string | null
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
          is_closed?: boolean
          is_entrepreneur_individuel?: boolean
          is_head_office?: boolean
          latitude?: number | null
          longitude?: number | null
          naf_code?: string | null
          owner_id: string
          postal_code: string
          reconciled_at?: string | null
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
          is_closed?: boolean
          is_entrepreneur_individuel?: boolean
          is_head_office?: boolean
          latitude?: number | null
          longitude?: number | null
          naf_code?: string | null
          owner_id?: string
          postal_code?: string
          reconciled_at?: string | null
          siren?: string
          siret?: string
          trade_slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      prospect_contact: {
        Row: {
          candidates: Json
          email: string
          found_at: string
          origin: Database["public"]["Enums"]["contact_origin"]
          prospect_id: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          candidates?: Json
          email: string
          found_at?: string
          origin: Database["public"]["Enums"]["contact_origin"]
          prospect_id: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          candidates?: Json
          email?: string
          found_at?: string
          origin?: Database["public"]["Enums"]["contact_origin"]
          prospect_id?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_contact_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: true
            referencedRelation: "prospect"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_enrichment: {
        Row: {
          candidates: Json
          decided_by: string
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
          candidates?: Json
          decided_by?: string
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
          candidates?: Json
          decided_by?: string
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
      prospect_site: {
        Row: {
          content: Json | null
          content_hash: string | null
          content_rejected_at: string | null
          deployment_url: string | null
          generated_at: string | null
          model: string | null
          prompt_version: string | null
          prospect_id: string
          published_at: string | null
          repo_full_name: string | null
          repo_url: string | null
          unpublished_at: string | null
          updated_at: string
          vercel_project_id: string | null
        }
        Insert: {
          content?: Json | null
          content_hash?: string | null
          content_rejected_at?: string | null
          deployment_url?: string | null
          generated_at?: string | null
          model?: string | null
          prompt_version?: string | null
          prospect_id: string
          published_at?: string | null
          repo_full_name?: string | null
          repo_url?: string | null
          unpublished_at?: string | null
          updated_at?: string
          vercel_project_id?: string | null
        }
        Update: {
          content?: Json | null
          content_hash?: string | null
          content_rejected_at?: string | null
          deployment_url?: string | null
          generated_at?: string | null
          model?: string | null
          prompt_version?: string | null
          prospect_id?: string
          published_at?: string | null
          repo_full_name?: string | null
          repo_url?: string | null
          unpublished_at?: string | null
          updated_at?: string
          vercel_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_site_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: true
            referencedRelation: "prospect"
            referencedColumns: ["id"]
          },
        ]
      }
      site_template: {
        Row: {
          branch: string
          check_detail: string | null
          check_ok: boolean | null
          checked_at: string | null
          id: number
          repo_full_name: string | null
          updated_at: string
        }
        Insert: {
          branch?: string
          check_detail?: string | null
          check_ok?: boolean | null
          checked_at?: string | null
          id?: never
          repo_full_name?: string | null
          updated_at?: string
        }
        Update: {
          branch?: string
          check_detail?: string | null
          check_ok?: boolean | null
          checked_at?: string | null
          id?: never
          repo_full_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      web_presence: {
        Row: {
          category: Database["public"]["Enums"]["web_presence_category"] | null
          domain_available: boolean | null
          domain_candidates: Json
          domain_checked_at: string | null
          domain_free_name: string | null
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
          domain_checked_at?: string | null
          domain_free_name?: string | null
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
          domain_checked_at?: string | null
          domain_free_name?: string | null
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
      worker_heartbeat: {
        Row: {
          beat_at: string
          id: boolean
          in_flight: number
          version: string | null
        }
        Insert: {
          beat_at: string
          id?: boolean
          in_flight?: number
          version?: string | null
        }
        Update: {
          beat_at?: string
          id?: boolean
          in_flight?: number
          version?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      campaign_job_kind: "chaine"
      campaign_job_state:
        | "en_attente"
        | "en_cours"
        | "termine"
        | "echoue"
        | "annule"
      campaign_state: "en_cours" | "suspendue" | "terminee" | "annulee"
      contact_origin: "collecte" | "saisie"
      deployment_outcome: "demarre" | "reussi" | "echoue" | "ignore"
      deployment_step:
        | "redaction"
        | "depot"
        | "projet"
        | "build"
        | "en_ligne"
        | "retrait"
      enrichment_status: "ok" | "not_found" | "ambiguous" | "blocked"
      etat_connexion: "active" | "revoquee" | "indechiffrable"
      interaction_kind: "appel" | "whatsapp" | "email" | "sms" | "note"
      pipeline_event_origin: "observe" | "amorcage"
      pipeline_status:
        | "a_contacter"
        | "contacte"
        | "relance"
        | "interesse"
        | "gagne"
        | "perdu"
        | "ne_pas_contacter"
      plateforme_connectee: "github" | "vercel" | "google"
      send_state: "en_cours" | "envoye" | "echoue"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      campaign_job_kind: ["chaine"],
      campaign_job_state: [
        "en_attente",
        "en_cours",
        "termine",
        "echoue",
        "annule",
      ],
      campaign_state: ["en_cours", "suspendue", "terminee", "annulee"],
      contact_origin: ["collecte", "saisie"],
      deployment_outcome: ["demarre", "reussi", "echoue", "ignore"],
      deployment_step: [
        "redaction",
        "depot",
        "projet",
        "build",
        "en_ligne",
        "retrait",
      ],
      enrichment_status: ["ok", "not_found", "ambiguous", "blocked"],
      etat_connexion: ["active", "revoquee", "indechiffrable"],
      interaction_kind: ["appel", "whatsapp", "email", "sms", "note"],
      pipeline_event_origin: ["observe", "amorcage"],
      pipeline_status: [
        "a_contacter",
        "contacte",
        "relance",
        "interesse",
        "gagne",
        "perdu",
        "ne_pas_contacter",
      ],
      plateforme_connectee: ["github", "vercel", "google"],
      send_state: ["en_cours", "envoye", "echoue"],
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
