-- =============================================================================
-- OrigemX — corrige GRANT ausente em kennels.instagram_handle e .registration_number
--
-- 20260807080825 e 20260807212322 adicionaram estas colunas a public.kennels
-- mas nenhuma foi somada à lista de UPDATE concedida a `authenticated` em
-- 20260803034530_founder_badge.sql. Consequência real: updateKennel sempre
-- envia TODOS os campos de KENNEL_FORM_FIELDS no mesmo UPDATE, e o Postgres
-- recusa a instrução INTEIRA (42501) se qualquer coluna do SET list não tiver
-- GRANT — mesmo sem mudança de valor naquela coluna. Toda gravação de perfil
-- de canil estava quebrada, não só as que tocam estes dois campos.
--
-- GRANT é aditivo: não é preciso repetir as colunas já concedidas.
-- =============================================================================

grant update (instagram_handle, registration_number)
  on public.kennels to authenticated;
