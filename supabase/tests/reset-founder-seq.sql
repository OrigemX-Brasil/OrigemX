-- =============================================================================
-- Devolve a numeração do selo Criador Fundador ao início.
--
--     npm run db:founder-reset
--
-- SÓ EM DESENVOLVIMENTO. Em produção isto reabriria números já entregues, e o
-- selo é imutável e intransferível — dois canis com o nº 007 destruiriam o
-- sentido da coisa.
--
-- Por que é necessário: `npm run test:rls` prova a atribuição sob concorrência,
-- e provar isso significa consumir números de verdade. `nextval` não é
-- transacional, então nem o rollback nem o DELETE das fixtures devolvem o que
-- foi consumido. Sem este reset, o pool de 100 do projeto de dev acabaria em
-- poucas dezenas de execuções e os testes passariam a medir o caminho de
-- esgotamento em vez do de atribuição.
-- =============================================================================

-- Salvaguarda contra apontar isto para o projeto errado: recusa se houver selo
-- em canil que NÃO seja fixture de teste.
do $$
declare v_reais integer;
begin
  select count(*) into v_reais
    from public.kennels
   where founder_number is not null
     and slug not like 'rls-%'
     and slug not like 'battery-%';

  if v_reais > 0 then
    raise exception
      'Recusado: % canil(is) com selo que nao sao fixture de teste. Este reset e so para desenvolvimento.',
      v_reais
      using errcode = 'restrict_violation';
  end if;
end $$;

-- O trigger de imutabilidade bloqueia valor -> qualquer coisa, NULL inclusive —
-- é o comportamento correto e é o que os testes provam. Para desfazer fixture é
-- preciso desativá-lo explicitamente, e reativá-lo em seguida.
--
-- Deixar isto visível é de propósito: se um dia este arquivo rodar onde não
-- devia, o `alter table ... disable trigger` aparece no diff e no log.
alter table public.kennels disable trigger kennels_freeze_founder_number;

update public.kennels
   set founder_number = null
 where founder_number is not null
   and (slug like 'rls-%' or slug like 'battery-%');

alter table public.kennels enable trigger kennels_freeze_founder_number;

select setval('public.kennel_founder_seq', 1, false) as sequence_reiniciada;
