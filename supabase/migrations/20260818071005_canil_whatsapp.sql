-- =============================================================================
-- OrigemX — WhatsApp do canil
--
-- Alimenta o CTA da página pública da ninhada ("Tenho interesse"). O botão é um
-- deep link wa.me: a conversa acontece no aplicativo do criador, FORA da
-- plataforma. Nada é enviado pelo servidor.
--
-- É a diferença entre isto e um formulário de lead, que exigiria tabela,
-- moderação e — para ter qualquer valor — notificação, que continua fora de
-- escopo. Um link não guarda nada de ninguém.
--
-- SÓ DÍGITOS, com código do país. O app formata para exibir e monta a URL; o
-- banco guarda a forma canônica, porque telefone digitado com máscara vira
-- cinco grafias do mesmo número e nenhuma delas casa com wa.me.
--
-- PRIVACIDADE: é telefone que aparece em página pública, então nasce NULL e o
-- formulário precisa dizer, na tela, que ele fica visível. Ninguém deve
-- descobrir isso depois de publicado.
-- =============================================================================

alter table public.kennels add column whatsapp text;

-- 10 a 15 dígitos: cobre o Brasil (55 + DDD + 8 ou 9 dígitos) sem cravar o
-- país, e 15 é o teto do E.164.
alter table public.kennels add constraint kennels_whatsapp_format
  check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$');

comment on column public.kennels.whatsapp is
  'Telefone do WhatsApp, só dígitos com código do país (ex.: 5511987654321). EXIBIDO PUBLICAMENTE. Alimenta o link wa.me — o produto não envia mensagem nenhuma.';

-- `kennels` também tem GRANT DE UPDATE POR COLUNA (desde founder_badge). Sem
-- esta linha, salvar o canil passa a falhar inteiro com 42501 — foi
-- exatamente o que aconteceu com instagram_handle/registration_number e custou
-- a migration corretiva grant_kennel_instagram_registro.
grant update (whatsapp) on public.kennels to authenticated;
