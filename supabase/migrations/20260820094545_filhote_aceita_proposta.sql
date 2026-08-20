-- =============================================================================
-- OrigemX — filhote: sinalizador "Aceita proposta"
--
-- APENAS RÓTULO INFORMATIVO. Não existe (e não deve existir) mecanismo de
-- enviar valor de oferta pela plataforma, campo "faça sua proposta" ou
-- notificação de proposta — seria intermediação de negociação, fora de
-- escopo (Cláusula 4, marketplace). A negociação inteira acontece fora da
-- plataforma, pelo WhatsApp que já existe (kennels.whatsapp).
--
-- Independente de `price_brl`: o criador pode marcar mesmo sem preço
-- cadastrado ("só sob consulta") — decisão do dono do produto.
-- =============================================================================

alter table public.dogs add column accepts_offer boolean not null default false;

comment on column public.dogs.accepts_offer is
  'Sinalizador informativo: o criador está aberto a negociar o valor deste filhote. NÃO é mecanismo de oferta — só rótulo, exibido como badge na página pública. A negociação acontece inteiramente fora da plataforma.';

-- Mesma fronteira que `price_brl`/`litter_status` já têm: o campo só faz
-- sentido dentro de ninhada. `false` fora de ninhada é inofensivo (nunca é
-- lido pela página pública de cão comum), mas o CHECK mantém a mesma
-- filosofia já documentada — a fronteira do aditivo vive no schema.
alter table public.dogs add constraint dogs_accepts_offer_requires_litter
  check (accepts_offer = false or litter_id is not null);

-- `dogs` tem GRANT DE UPDATE POR COLUNA desde painel_admin. Coluna nova sem
-- grant explícito não falha só nela: o formulário do filhote manda
-- litter_status/price_brl/accepts_offer juntos no mesmo UPDATE, então TODO
-- save de filhote passaria a devolver 42501. Já custou migration corretiva
-- antes (grant_kennel_instagram_registro).
grant update (accepts_offer) on public.dogs to authenticated;
