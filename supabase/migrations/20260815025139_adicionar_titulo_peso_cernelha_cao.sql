-- =============================================================================
-- OrigemX — títulos, peso e cernelha do cão
--
-- Três campos opcionais, informativos, sem impacto em identidade ou genealogia.
-- Mesmo tratamento de kennels.instagram_handle / registration_number: sem
-- CHECK de formato, comentário documenta nulidade e visibilidade.
-- =============================================================================

alter table public.dogs
  add column titles text[],
  add column weight_kg numeric(5,2),
  add column withers_height_cm numeric(5,2);

comment on column public.dogs.titles is
  'Títulos de campeão do cão (ex.: "Campeão Nacional"), texto livre repetível. Sem tabela de catálogo: normalizar em domínio fechado não é necessário hoje. Opcional, exibido no perfil público.';
comment on column public.dogs.weight_kg is
  'Peso em quilogramas, opcional. Dado informativo, não crítico de identidade. Exibido no perfil público.';
comment on column public.dogs.withers_height_cm is
  'Altura de cernelha em centímetros, opcional. Mesmo tratamento de weight_kg. Exibido no perfil público.';

-- Guarda de sanidade, não regra de negócio: nenhuma das duas medidas físicas
-- faz sentido em zero ou negativo. Não há teto — não é campo de faixa fechada
-- como founder_number.
alter table public.dogs
  add constraint dogs_weight_kg_positive check (weight_kg is null or weight_kg > 0),
  add constraint dogs_withers_height_cm_positive check (withers_height_cm is null or withers_height_cm > 0);

-- Ver nota no plano: sem isto, `updateDog` falha por INTEIRO (42501) em todo
-- salvamento de cão, não só nos que tocam estes três campos — mesmo incidente
-- já visto em kennels (20260808032251_grant_kennel_instagram_registro.sql).
grant update (titles, weight_kg, withers_height_cm) on public.dogs to authenticated;
