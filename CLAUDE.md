# OrigemX — Invariantes do projeto

Plataforma web para criadores de cães (canis), com perfis públicos, pedigree de 5
gerações e QR Code.

Este documento é **normativo**. Vale para toda sessão de trabalho neste repositório.
Quando algo aqui conflitar com uma sugestão, este documento vence. Mudança de invariante
é decisão do dono do produto, não do implementador.

---

## STACK

Next.js App Router + TypeScript + Tailwind. Supabase (Postgres, Auth, Storage, RLS).
Deploy Vercel.

**Sem outras libs de UI, state manager ou ORM sem eu aprovar.**

---

## AMBIENTE

- Não há Supabase local (sem Docker). Dev roda contra o projeto Supabase
  de desenvolvimento (link ativo). NUNCA rodar db reset ou db push
  apontando para o projeto do cliente sem eu confirmar explicitamente.
- Confirmar o diretório de trabalho antes de qualquer comando de terminal.

## INVARIANTES DE DADOS

- Todo cão tem UUID permanente. Parentesco é `sire_id`/`dam_id` referenciando `dogs`.
- Nunca copiar dados do ancestral dentro do registro do descendente.
- Ancestral repetido é legítimo (linebreeding). Pedigree renderiza por **CAMINHO**, não
  por nó.
- Ciclo genealógico é proibido e bloqueado no banco.
- `dogs.owner_id` e `kennel_id` são NULLABLE (ancestral sem dono cadastrado).
- Exclusão é sempre lógica (`deleted_at`). Nunca DELETE físico.
- Toda tabela tem `created_at`, `updated_at` e autoria quando aplicável.

---

## INVARIANTES DE SEGURANÇA

- RLS habilitada em **TODAS** as tabelas. Nenhuma tabela pública sem policy.
- Nunca usar `service_role` key no client. Nunca expor segredo em `NEXT_PUBLIC_`.
- Autorização é decidida no banco (RLS), não só na UI.

---

## INVARIANTES DE PERFORMANCE

- Nenhuma listagem sem paginação e limite. Nunca SELECT sem LIMIT em lista.
- Índice em toda FK e em toda coluna usada em busca/filtro.
- Imagem vai para Storage; banco guarda URL e metadata. **NUNCA base64.**

---

## INVARIANTES DE PRODUTO

- Mobile-first. Tema escuro.
- Cores e tipografia vêm de CSS variables (tokens), nunca hardcoded — a identidade visual
  do cliente ainda não chegou.
- URL pública do perfil usa identificador **ESTÁVEL**. QR impresso não pode quebrar.

---

## FORA DE ESCOPO

Não implementar, nem "preparar tabela":

IA, marketplace, financeiro, pagamentos, dossiê de saúde, agenda/lembretes, ninhadas,
rede social, notificação por e-mail/push/WhatsApp/SMS, multi-espécies, fusão automática de
duplicados, cache distribuído, filas.

---

## Como estas invariantes estão implementadas

Referência rápida — o banco é quem garante, não a aplicação.

| Invariante                 | Onde vive                                                                  |
| -------------------------- | -------------------------------------------------------------------------- |
| UUID permanente do cão     | `dogs.id uuid PK`                                                          |
| Parentesco por referência  | `dogs.sire_id` / `dogs.dam_id` → `dogs.id`                                 |
| Ciclo genealógico proibido | trigger `dogs_check_ancestry()` (CTE recursiva)                            |
| Linebreeding é legítimo    | mesma CTE usa `UNION`, então ancestral repetido não vira ciclo             |
| Exclusão lógica            | `deleted_at` em todas as tabelas + policies filtram                        |
| QR não quebra              | `dogs.public_id` imutável, protegido por trigger                           |
| RLS em tudo                | migration `0002_rls_policies.sql`                                          |
| Listagem com limite        | todo acesso a dados em `src/modules/*/queries.ts`, com `limit` obrigatório |
| Tokens de cor              | `src/styles/tokens.css` — nenhuma cor literal em componente                |

### Schema

Todo schema nasce como **migration versionada** em `supabase/migrations/`, para aplicar no
projeto do cliente com `db push` sem retrabalho. Nunca alterar o banco por fora da
migration. Criar arquivo novo sempre com `npx supabase migration new <nome>`.

@AGENTS.md
