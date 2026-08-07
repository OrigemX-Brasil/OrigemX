alter table public.kennels
  add column registration_number text;

comment on column public.kennels.registration_number is
  'RG/registro do próprio canil (ex.: número de afixo CBKC/FCI). Texto livre, sem CHECK — mesmo tratamento de website_url e instagram_handle. Ao contrário do RG e do microchip do cão (dog_identifiers), este É exibido no perfil público — decisão explícita do produto.';
