alter table public.kennels
  add column instagram_handle text;

comment on column public.kennels.instagram_handle is
  'Handle do Instagram, sem @. Mesmo tratamento de website_url: formato validado só na aplicação (src/modules/kennels/fields.ts), sem CHECK aqui — não é campo crítico de identidade como o slug.';
