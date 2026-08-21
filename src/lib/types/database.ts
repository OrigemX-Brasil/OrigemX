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
    PostgrestVersion: "14.15"
  }
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
      audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json
          entity_id: string
          entity_type: string
          id: number
          reason: string
          updated_at: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json
          entity_id: string
          entity_type: string
          id?: never
          reason: string
          updated_at?: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json
          entity_id?: string
          entity_type?: string
          id?: never
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dog_genetic_tests: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dog_id: string
          id: string
          lab: string | null
          name: string
          result: string
          tested_on: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id: string
          id?: string
          lab?: string | null
          name: string
          result: string
          tested_on?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string
          id?: string
          lab?: string | null
          name?: string
          result?: string
          tested_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dog_genetic_tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_genetic_tests_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      dog_health_records: {
        Row: {
          applied_on: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dog_id: string
          id: string
          kind: string
          notes: string | null
          product: string | null
          updated_at: string
        }
        Insert: {
          applied_on: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id: string
          id?: string
          kind: string
          notes?: string | null
          product?: string | null
          updated_at?: string
        }
        Update: {
          applied_on?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string
          id?: string
          kind?: string
          notes?: string | null
          product?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dog_health_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_health_records_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      dog_identifiers: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dog_id: string
          id: string
          is_primary: boolean
          issuer: string | null
          kind: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id: string
          id?: string
          is_primary?: boolean
          issuer?: string | null
          kind: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string
          id?: string
          is_primary?: boolean
          issuer?: string | null
          kind?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "dog_identifiers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_identifiers_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      dog_measurements: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dog_id: string
          id: string
          kind: string
          measured_on: string
          notes: string | null
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id: string
          id?: string
          kind: string
          measured_on: string
          notes?: string | null
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string
          id?: string
          kind?: string
          measured_on?: string
          notes?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "dog_measurements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_measurements_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      dog_videos: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dog_id: string
          duration_seconds: number | null
          error_reason: string | null
          id: string
          owner_id: string
          playback_origin: string | null
          provider: string
          provider_uid: string
          status: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id: string
          duration_seconds?: number | null
          error_reason?: string | null
          id?: string
          owner_id: string
          playback_origin?: string | null
          provider?: string
          provider_uid: string
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string
          duration_seconds?: number | null
          error_reason?: string | null
          id?: string
          owner_id?: string
          playback_origin?: string | null
          provider?: string
          provider_uid?: string
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dog_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_videos_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_videos_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dogs: {
        Row: {
          accepts_offer: boolean
          born_on: string | null
          breed: string | null
          coat: string | null
          color: string | null
          created_at: string
          created_by: string | null
          dam_id: string | null
          deleted_at: string | null
          hidden_at: string | null
          id: string
          kennel_id: string | null
          litter_id: string | null
          litter_status: string | null
          name: string
          owner_id: string | null
          price_brl: number | null
          public_id: string
          published_at: string | null
          sex: string
          sire_id: string | null
          slug: string | null
          titles: string[] | null
          updated_at: string
        }
        Insert: {
          accepts_offer?: boolean
          born_on?: string | null
          breed?: string | null
          coat?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          dam_id?: string | null
          deleted_at?: string | null
          hidden_at?: string | null
          id?: string
          kennel_id?: string | null
          litter_id?: string | null
          litter_status?: string | null
          name: string
          owner_id?: string | null
          price_brl?: number | null
          public_id?: string
          published_at?: string | null
          sex: string
          sire_id?: string | null
          slug?: string | null
          titles?: string[] | null
          updated_at?: string
        }
        Update: {
          accepts_offer?: boolean
          born_on?: string | null
          breed?: string | null
          coat?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          dam_id?: string | null
          deleted_at?: string | null
          hidden_at?: string | null
          id?: string
          kennel_id?: string | null
          litter_id?: string | null
          litter_status?: string | null
          name?: string
          owner_id?: string | null
          price_brl?: number | null
          public_id?: string
          published_at?: string | null
          sex?: string
          sire_id?: string | null
          slug?: string | null
          titles?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dogs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dogs_dam_id_fkey"
            columns: ["dam_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dogs_kennel_id_fkey"
            columns: ["kennel_id"]
            isOneToOne: false
            referencedRelation: "kennels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dogs_litter_id_fkey"
            columns: ["litter_id"]
            isOneToOne: false
            referencedRelation: "kennel_litters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dogs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dogs_sire_id_fkey"
            columns: ["sire_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      kennel_faqs: {
        Row: {
          answer: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          kennel_id: string
          position: number
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          kennel_id: string
          position?: number
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          kennel_id?: string
          position?: number
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kennel_faqs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kennel_faqs_kennel_id_fkey"
            columns: ["kennel_id"]
            isOneToOne: false
            referencedRelation: "kennels"
            referencedColumns: ["id"]
          },
        ]
      }
      kennel_litters: {
        Row: {
          born_on: string | null
          created_at: string
          created_by: string | null
          dam_id: string | null
          deleted_at: string | null
          description: string | null
          id: string
          kennel_id: string
          mated_on: string | null
          public_id: string
          published_at: string | null
          sire_id: string | null
          updated_at: string
        }
        Insert: {
          born_on?: string | null
          created_at?: string
          created_by?: string | null
          dam_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          kennel_id: string
          mated_on?: string | null
          public_id?: string
          published_at?: string | null
          sire_id?: string | null
          updated_at?: string
        }
        Update: {
          born_on?: string | null
          created_at?: string
          created_by?: string | null
          dam_id?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          kennel_id?: string
          mated_on?: string | null
          public_id?: string
          published_at?: string | null
          sire_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kennel_litters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kennel_litters_dam_id_fkey"
            columns: ["dam_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kennel_litters_kennel_id_fkey"
            columns: ["kennel_id"]
            isOneToOne: false
            referencedRelation: "kennels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kennel_litters_sire_id_fkey"
            columns: ["sire_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      kennels: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          founder_number: number | null
          hidden_at: string | null
          id: string
          instagram_handle: string | null
          logo_url: string | null
          name: string
          owner_id: string
          published_at: string | null
          registration_number: string | null
          slug: string
          state: string | null
          updated_at: string
          website_url: string | null
          whatsapp: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          founder_number?: number | null
          hidden_at?: string | null
          id?: string
          instagram_handle?: string | null
          logo_url?: string | null
          name: string
          owner_id: string
          published_at?: string | null
          registration_number?: string | null
          slug: string
          state?: string | null
          updated_at?: string
          website_url?: string | null
          whatsapp?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          founder_number?: number | null
          hidden_at?: string | null
          id?: string
          instagram_handle?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          published_at?: string | null
          registration_number?: string | null
          slug?: string
          state?: string | null
          updated_at?: string
          website_url?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kennels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kennels_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_events: {
        Row: {
          created_at: string
          id: number
          kind: string
          path: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          path?: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          path?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          alt: string | null
          bucket_id: string
          caption: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dog_id: string | null
          height: number | null
          id: string
          kennel_id: string | null
          litter_id: string | null
          mime: string
          owner_id: string
          position: number
          role: string
          size_bytes: number
          storage_path: string
          testimonial_id: string | null
          thumb_bytes: number | null
          thumb_path: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          alt?: string | null
          bucket_id?: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string | null
          height?: number | null
          id?: string
          kennel_id?: string | null
          litter_id?: string | null
          mime: string
          owner_id: string
          position?: number
          role: string
          size_bytes: number
          storage_path: string
          testimonial_id?: string | null
          thumb_bytes?: number | null
          thumb_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt?: string | null
          bucket_id?: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string | null
          height?: number | null
          id?: string
          kennel_id?: string | null
          litter_id?: string | null
          mime?: string
          owner_id?: string
          position?: number
          role?: string
          size_bytes?: number
          storage_path?: string
          testimonial_id?: string | null
          thumb_bytes?: number | null
          thumb_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_kennel_id_fkey"
            columns: ["kennel_id"]
            isOneToOne: false
            referencedRelation: "kennels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_litter_id_fkey"
            columns: ["litter_id"]
            isOneToOne: false
            referencedRelation: "kennel_litters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_testimonial_id_fkey"
            columns: ["testimonial_id"]
            isOneToOne: false
            referencedRelation: "testimonials"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: string
          state: string | null
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string
          state?: string | null
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          state?: string | null
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          author_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dog_id: string | null
          id: string
          kennel_id: string
          published_at: string | null
          rating: number | null
          text: string
          updated_at: string
        }
        Insert: {
          author_name: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string | null
          id?: string
          kennel_id: string
          published_at?: string | null
          rating?: number | null
          text: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string | null
          id?: string
          kennel_id?: string
          published_at?: string | null
          rating?: number | null
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonials_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonials_kennel_id_fkey"
            columns: ["kennel_id"]
            isOneToOne: false
            referencedRelation: "kennels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_profile_email: {
        Args: { p_profile_id: string }
        Returns: string
      }
      admin_set_dog_hidden: {
        Args: { p_dog_id: string; p_hidden: boolean; p_reason: string }
        Returns: string
      }
      admin_set_founder_number: {
        Args: { p_kennel_id: string; p_number: number; p_reason: string }
        Returns: number
      }
      admin_set_kennel_hidden: {
        Args: { p_hidden: boolean; p_kennel_id: string; p_reason: string }
        Returns: string
      }
      admin_set_profile_suspended: {
        Args: { p_profile_id: string; p_reason: string; p_suspended: boolean }
        Returns: string
      }
      dog_descendant_ids: { Args: { p_dog_id: string }; Returns: string[] }
      dog_is_public: {
        Args: {
          p_deleted_at: string
          p_hidden_at: string
          p_kennel_id: string
          p_owner_id: string
          p_published_at: string
        }
        Returns: boolean
      }
      dog_pedigree: {
        Args: { p_dog_id: string; p_generations?: number }
        Returns: {
          born_on: string
          breed: string
          dog_id: string
          generation: number
          is_public: boolean
          kennel_name: string
          name: string
          pos: number
          public_id: string
          sex: string
        }[]
      }
      gen_public_id: { Args: never; Returns: string }
      kennel_is_founder_eligible: {
        Args: { p_kennel_id: string }
        Returns: boolean
      }
      media_used_bytes: { Args: { p_owner_id: string }; Returns: number }
      record_landing_event: {
        Args: { p_kind: string; p_path?: string; p_source?: string }
        Returns: undefined
      }
      try_assign_founder_number: {
        Args: { p_kennel_id: string }
        Returns: number
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
