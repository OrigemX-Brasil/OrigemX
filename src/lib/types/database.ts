/**
 * PLACEHOLDER — tipos do banco.
 *
 * Este arquivo é gerado, não escrito à mão:
 *
 *     npm run db:types      # supabase gen types typescript --linked
 *
 * Enquanto não houver um projeto Supabase linkado, ele fica com esta forma
 * permissiva só para o projeto compilar. Os tipos NÃO refletem o schema real
 * das migrations — qualquer segurança de tipo em query é ilusória até rodar o
 * comando acima, que sobrescreve o arquivo inteiro.
 *
 * Não editar à mão. Não escrever query de produção contando com estes tipos.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type PlaceholderTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: { [table: string]: PlaceholderTable };
    Views: { [view: string]: { Row: Record<string, unknown>; Relationships: [] } };
    Functions: { [fn: string]: { Args: Record<string, unknown>; Returns: unknown } };
    Enums: { [name: string]: string };
    CompositeTypes: { [name: string]: Record<string, unknown> };
  };
};
