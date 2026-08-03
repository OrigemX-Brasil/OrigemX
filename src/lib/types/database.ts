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
      dogs: {
        Row: {
          born_on: string | null
          breed: string | null
          coat: string | null
          color: string | null
          created_at: string
          created_by: string | null
          dam_id: string | null
          deleted_at: string | null
          id: string
          kennel_id: string | null
          name: string
          owner_id: string | null
          public_id: string
          published_at: string | null
          sex: string
          sire_id: string | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          born_on?: string | null
          breed?: string | null
          coat?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          dam_id?: string | null
          deleted_at?: string | null
          id?: string
          kennel_id?: string | null
          name: string
          owner_id?: string | null
          public_id?: string
          published_at?: string | null
          sex: string
          sire_id?: string | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          born_on?: string | null
          breed?: string | null
          coat?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          dam_id?: string | null
          deleted_at?: string | null
          id?: string
          kennel_id?: string | null
          name?: string
          owner_id?: string | null
          public_id?: string
          published_at?: string | null
          sex?: string
          sire_id?: string | null
          slug?: string | null
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
      kennels: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          founder_number: number | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          published_at: string | null
          slug: string
          state: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          founder_number?: number | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          published_at?: string | null
          slug: string
          state?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          founder_number?: number | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          published_at?: string | null
          slug?: string
          state?: string | null
          updated_at?: string
          website_url?: string | null
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
      media: {
        Row: {
          alt: string | null
          bucket_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dog_id: string | null
          height: number | null
          id: string
          kennel_id: string | null
          mime: string
          owner_id: string
          position: number
          role: string
          size_bytes: number
          storage_path: string
          thumb_bytes: number | null
          thumb_path: string | null
          updated_at: string
          width: number | null
        }
        Insert: {
          alt?: string | null
          bucket_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string | null
          height?: number | null
          id?: string
          kennel_id?: string | null
          mime: string
          owner_id: string
          position?: number
          role: string
          size_bytes: number
          storage_path: string
          thumb_bytes?: number | null
          thumb_path?: string | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          alt?: string | null
          bucket_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dog_id?: string | null
          height?: number | null
          id?: string
          kennel_id?: string | null
          mime?: string
          owner_id?: string
          position?: number
          role?: string
          size_bytes?: number
          storage_path?: string
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
            foreignKeyName: "media_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dog_descendant_ids: { Args: { p_dog_id: string }; Returns: string[] }
      dog_is_public: {
        Args: {
          p_deleted_at: string
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
