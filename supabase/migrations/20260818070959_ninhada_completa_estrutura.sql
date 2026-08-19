-- =============================================================================
-- OrigemX — ninhada completa: progenitores, filhotes, datas (Fase 3)
--
-- `ninhadas_do_canil.sql` (14/08) deixou escrito que progenitores e filhotes
-- eram "Fase 3, orçada à parte quando chegar". Chegou, como ADITIVO CONTRATUAL.
--
-- ---------------------------------------------------------------------------
-- A DECISÃO DESTA MIGRATION: filhote É uma linha em `dogs`.
-- ---------------------------------------------------------------------------
-- Não existe tabela `puppies`. O filhote nasce em `dogs` com `litter_id`
-- apontando para a ninhada, e por isso já herda TUDO que o projeto tem pronto:
-- foto (media role='dog_gallery'), registro CBKC (dog_identifiers), RLS,
-- public_id imutável para o QR, e o pedigree — dogs_check_ancestry,
-- dog_pedigree, dog_descendant_ids.
--
-- O motivo que decide não é economia de código, é INVARIANTE: "parentesco é
-- sire_id/dam_id referenciando dogs" e "nunca copiar dados do ancestral dentro
-- do registro do descendente". Uma entidade leve à parte só entraria em
-- pedigree futuro sendo PROMOVIDA a dogs na venda — e promoção é cópia de
-- dados entre tabelas, exatamente o que a invariante proíbe.
--
-- ---------------------------------------------------------------------------
-- QUEM É DONO DE QUÊ (a parte que confunde daqui a seis meses)
-- ---------------------------------------------------------------------------
-- A NINHADA é dona do PAR (sire_id/dam_id): `mated_on` existe antes de
-- qualquer filhote nascer, então o par precisa ter onde morar enquanto não há
-- filhote nenhum.
--
-- O FILHOTE é dono do PARENTESCO: `dogs.sire_id`/`dam_id` continuam sendo o
-- fato canônico que o pedigree lê — nada mudou nisso.
--
-- Os dois não podem se contradizer, e é trigger que garante, nas duas
-- direções: o filhote não entra com par diferente do da ninhada
-- (`dogs_check_litter_parents`), e mudar o par da ninhada REESCREVE o dos
-- filhotes vivos (`kennel_litters_sync_puppy_parents`) em vez de travar.
-- Travar pareceria mais seguro e é pior: o criador que descobre o reprodutor
-- depois teria de excluir e recadastrar os filhotes — queimando public_id que
-- pode já estar impresso em QR.
--
-- ---------------------------------------------------------------------------
-- PREÇO — exceção contratual, com fronteira escrita no schema
-- ---------------------------------------------------------------------------
-- `ninhadas_do_canil.sql` dizia "NENHUM campo de preço [...] Cláusula 4 do
-- contrato exclui marketplace". Isso foi revisto POR ADITIVO: preço é campo
-- INFORMATIVO, exibido na página pública, e o único fluxo de conversão é um
-- link de WhatsApp — a transação acontece inteiramente fora da plataforma.
--
-- Continuam fora de escopo e exigem NOVO aditivo: checkout, reserva
-- processada pelo app, pagamento, cobrança, emissão fiscal. Ter preço não
-- autoriza carrinho. O CHECK abaixo amarra `price_brl` a `litter_id` para que
-- essa fronteira não dependa só de memória: preço existe DENTRO de ninhada,
-- não como atributo geral de cão à venda.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- kennel_litters — public_id, progenitores e datas
-- -----------------------------------------------------------------------------

-- A ninhada ganha URL pública própria (/n/[public_id]). Mesmo alfabeto e mesmo
-- gerador do cão: o valor é lido por gente e não pode ter caractere ambíguo.
--
-- Em TRÊS passos, não `add column not null default`: `gen_public_id()` é
-- VOLATILE, e depender do comportamento de reescrita do Postgres para popular
-- linha existente é o tipo de detalhe que muda de versão. Explícito custa três
-- linhas e não tem surpresa.
alter table public.kennel_litters add column public_id text;
update public.kennel_litters set public_id = public.gen_public_id() where public_id is null;
alter table public.kennel_litters alter column public_id set not null;
alter table public.kennel_litters alter column public_id set default public.gen_public_id();

alter table public.kennel_litters add constraint kennel_litters_public_id_format
  check (public_id ~ '^[2-9a-hjkmnp-z]{12}$');

create unique index kennel_litters_public_id_key on public.kennel_litters (public_id);

alter table public.kennel_litters
  add column sire_id  uuid references public.dogs (id) on delete restrict,
  add column dam_id   uuid references public.dogs (id) on delete restrict,
  add column mated_on date,
  add column born_on  date;

-- Espelha `dogs_sire_dam_distinct`: o mesmo cão nas duas pontas do cruzamento
-- não é linebreeding, é erro de digitação.
alter table public.kennel_litters add constraint kennel_litters_sire_dam_distinct
  check (sire_id is null or dam_id is null or sire_id <> dam_id);

-- Nascer antes de cruzar é impossível — pega a inversão dos dois campos.
--
-- Não existe CHECK de "data no futuro" aqui, e é deliberado: `current_date` não
-- é imutável, e constraint que depende do relógio quebra restauração de dump
-- (a linha era válida quando entrou e passa a ser inválida depois). Mesmo
-- raciocínio já documentado em `validateBirthDate`, no lado da aplicação.
alter table public.kennel_litters add constraint kennel_litters_born_after_mated
  check (born_on is null or mated_on is null or born_on >= mated_on);

create index kennel_litters_sire_id_idx on public.kennel_litters (sire_id);
create index kennel_litters_dam_id_idx  on public.kennel_litters (dam_id);

comment on column public.kennel_litters.public_id is
  'Endereço público estável da ninhada (/n/[public_id]). Imutável por trigger — mesma razão do cão: link divulgado não pode passar a apontar para outro lugar.';
comment on column public.kennel_litters.mated_on is
  'Data da cobrição. A PREVISÃO DE PARTO (+63 dias) é DERIVADA e não tem coluna: valor calculável em duas fontes diverge na primeira correção.';
comment on column public.kennel_litters.sire_id is
  'Pai da ninhada. O parentesco canônico continua em dogs.sire_id do filhote; este campo existe porque a ninhada tem par ANTES de ter filhote.';

-- -----------------------------------------------------------------------------
-- public_id da ninhada é imutável — mesma mecânica de dogs_freeze_public_id:
-- o WHEN filtra, a função só levanta.
-- -----------------------------------------------------------------------------

create or replace function public.kennel_litters_freeze_public_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception
    'public_id é imutável (ninhada %): o link já divulgado passaria a apontar para outra ninhada',
    old.id
    using errcode = 'restrict_violation';
end;
$$;

revoke execute on function public.kennel_litters_freeze_public_id() from public, anon, authenticated;

create trigger kennel_litters_freeze_public_id
  before update on public.kennel_litters
  for each row
  when (new.public_id is distinct from old.public_id)
  execute function public.kennel_litters_freeze_public_id();

-- -----------------------------------------------------------------------------
-- Sexo dos progenitores da ninhada.
--
-- Não pode ser CHECK: exige consultar outra linha. SECURITY DEFINER pelo mesmo
-- motivo de dogs_check_ancestry — o reprodutor pode ser cão de OUTRO canil, que
-- a RLS de quem está gravando talvez não deixe enxergar; sem definer o
-- `select` devolveria zero linhas e a validação passaria por engano.
-- -----------------------------------------------------------------------------

create or replace function public.kennel_litters_check_parents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sex text;
begin
  if new.sire_id is not null then
    select d.sex into v_sex from public.dogs d where d.id = new.sire_id;
    if v_sex is distinct from 'male' then
      raise exception 'sire_id (%) precisa referenciar um cão macho', new.sire_id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.dam_id is not null then
    select d.sex into v_sex from public.dogs d where d.id = new.dam_id;
    if v_sex is distinct from 'female' then
      raise exception 'dam_id (%) precisa referenciar uma cadela', new.dam_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.kennel_litters_check_parents() from public, anon, authenticated;

create trigger kennel_litters_check_parents
  before insert or update of sire_id, dam_id on public.kennel_litters
  for each row execute function public.kennel_litters_check_parents();

-- -----------------------------------------------------------------------------
-- dogs — o vínculo com a ninhada
-- -----------------------------------------------------------------------------

alter table public.dogs
  add column litter_id     uuid references public.kennel_litters (id) on delete restrict,
  add column litter_status text,
  add column price_brl     numeric(10, 2);

alter table public.dogs add constraint dogs_litter_status_valid
  check (litter_status is null or litter_status in ('available', 'reserved', 'sold'));

-- BICONDICIONAL, não implicação: cão de ninhada SEMPRE tem status, cão fora de
-- ninhada NUNCA tem. Um `litter_status` sobrando num cão adulto seria dado que
-- a UI teria de aprender a ignorar.
alter table public.dogs add constraint dogs_litter_status_requires_litter
  check ((litter_id is null) = (litter_status is null));

-- A fronteira do aditivo, no schema: preço só existe dentro de ninhada.
alter table public.dogs add constraint dogs_price_requires_litter
  check (price_brl is null or (litter_id is not null and price_brl > 0));

create index dogs_litter_id_idx
  on public.dogs (litter_id)
  where deleted_at is null and litter_id is not null;

comment on column public.dogs.litter_id is
  'Ninhada em que este cão nasceu. NULL para todo cão cadastrado fora de ninhada. Um cão pertence a no máximo uma ninhada, para sempre — por isso é FK aqui, e não tabela de ligação.';
comment on column public.dogs.price_brl is
  'Preço informativo do filhote. NÃO existe checkout, reserva paga nem cobrança no produto — ver o cabeçalho desta migration.';

-- ATENÇÃO — `dogs` tem GRANT DE UPDATE POR COLUNA desde painel_admin. Coluna
-- nova sem grant explícito não falha só nela: o app manda todos os campos no
-- mesmo SET, então TODO save de cão passa a devolver 42501. Já custou uma
-- migration corretiva antes (grant_kennel_instagram_registro).
grant update (litter_id, litter_status, price_brl) on public.dogs to authenticated;

-- -----------------------------------------------------------------------------
-- O par do filhote é o par da ninhada.
-- -----------------------------------------------------------------------------

create or replace function public.dogs_check_litter_parents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sire uuid;
  v_dam  uuid;
begin
  if new.litter_id is null then
    return new;
  end if;

  select l.sire_id, l.dam_id into v_sire, v_dam
    from public.kennel_litters l
   where l.id = new.litter_id;

  if new.sire_id is distinct from v_sire or new.dam_id is distinct from v_dam then
    raise exception
      'filhote da ninhada % precisa ter o mesmo par de progenitores da ninhada (pai %, mãe %)',
      new.litter_id, v_sire, v_dam
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.dogs_check_litter_parents() from public, anon, authenticated;

create trigger dogs_check_litter_parents
  before insert or update of litter_id, sire_id, dam_id on public.dogs
  for each row execute function public.dogs_check_litter_parents();

-- -----------------------------------------------------------------------------
-- Trocar o par da ninhada REESCREVE o dos filhotes vivos.
--
-- AFTER, e isso NÃO é escolha de estilo: o UPDATE em `dogs` dispara
-- `dogs_check_litter_parents`, que relê `kennel_litters`. Num BEFORE a linha da
-- ninhada ainda teria o par ANTIGO e a checagem recusaria a própria cascata.
--
-- SECURITY DEFINER para não esbarrar no grant por coluna nem na RLS de `dogs`
-- — o escopo é estreito: só filhotes vivos DESTA ninhada, e quem chegou aqui
-- já provou (via kennel_litters_update) que pode editá-la.
--
-- `dogs_check_ancestry` continua rodando sobre cada filhote atualizado, então
-- sexo do progenitor e ciclo genealógico seguem garantidos.
-- -----------------------------------------------------------------------------

create or replace function public.kennel_litters_sync_puppy_parents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dogs
     set sire_id = new.sire_id,
         dam_id  = new.dam_id
   where litter_id = new.id
     and deleted_at is null
     and (sire_id is distinct from new.sire_id or dam_id is distinct from new.dam_id);

  return null;
end;
$$;

revoke execute on function public.kennel_litters_sync_puppy_parents() from public, anon, authenticated;

create trigger kennel_litters_sync_puppy_parents
  after update of sire_id, dam_id on public.kennel_litters
  for each row
  when (new.sire_id is distinct from old.sire_id or new.dam_id is distinct from old.dam_id)
  execute function public.kennel_litters_sync_puppy_parents();

-- -----------------------------------------------------------------------------
-- RLS — dogs_insert / dogs_update passam a validar `litter_id`
--
-- SEM ISTO A COLUNA NOVA É UM BURACO: as policies validam `kennel_id` via
-- owns_kennel, mas nada olharia `litter_id`. Qualquer autenticado inseriria um
-- cão apontando para a ninhada de outro criador, e ele apareceria na página
-- pública dela.
--
-- `private.owns_litter` já existe (ninhadas_do_canil.sql) e é SEGURA aqui: a
-- regra documentada em rls_policies.sql proíbe `can_manage_dog` nas policies de
-- `dogs` porque aquela função RECONSULTA public.dogs, e no INSERT...RETURNING
-- do PostgREST a linha nova ainda não está no snapshot. `owns_litter` consulta
-- kennel_litters + kennels; nunca toca em `dogs`.
--
-- As duas policies são recriadas na íntegra a partir da versão de painel_admin,
-- com uma cláusula a mais. Nada mais mudou.
-- -----------------------------------------------------------------------------

drop policy dogs_insert on public.dogs;
create policy dogs_insert
  on public.dogs for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and not (select private.is_suspended())
    and (
      kennel_id is null
      or private.owns_kennel(kennel_id)
      or private.is_admin()
    )
    and (
      litter_id is null
      or private.owns_litter(litter_id)
      or private.is_admin()
    )
  );

drop policy dogs_update on public.dogs;
create policy dogs_update
  on public.dogs for update
  to authenticated
  using (
    not (select private.is_suspended())
    and (
      owner_id = (select auth.uid())
      or created_by = (select auth.uid())
      or private.owns_kennel(kennel_id)
      or private.is_admin()
    )
  )
  with check (
    not (select private.is_suspended())
    and (
      owner_id = (select auth.uid())
      or created_by = (select auth.uid())
      or private.owns_kennel(kennel_id)
      or private.is_admin()
    )
    and (
      kennel_id is null
      or private.owns_kennel(kennel_id)
      or private.is_admin()
    )
    and (
      litter_id is null
      or private.owns_litter(litter_id)
      or private.is_admin()
    )
  );
