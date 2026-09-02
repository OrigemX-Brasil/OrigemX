/**
 * O nome do cookie que sinaliza um cadastro assistido em andamento.
 *
 * MÓDULO PRÓPRIO, sem nenhum import, e isso é necessidade e não organização: o
 * proxy do Next roda fora do runtime de Node completo, e `lib/assist.ts` puxa
 * `lib/supabase/server`, que depende de `next/headers`. Importar aquele arquivo
 * lá quebraria o build do proxy — então a constante compartilhada mora aqui,
 * sozinha.
 *
 * O QUE ESTE COOKIE É: dica de UI, para o proxy saber que deve servir as telas
 * do criador sob `/admin/assistir`. O QUE ELE NÃO É: autorização. Quem decide o
 * que o admin escreve é `private.assisting_profile()`, no banco. Adulterá-lo
 * muda o prefixo da URL e nada mais — sem sessão aberta o layout devolve 404 e
 * a RLS recusa toda escrita.
 */
export const ASSIST_COOKIE = "origemx_assist";
