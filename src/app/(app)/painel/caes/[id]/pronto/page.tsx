import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/back-link";
import { getAuthUser } from "@/modules/auth/queries";
import { DogCreated } from "@/modules/dogs/components/dog-created";
import { getManageableDogById } from "@/modules/dogs/queries";
import { getDogGallery } from "@/modules/media/queries";
import { QrCard } from "@/modules/qr/components/qr-card";
import { qrTargetUrl } from "@/modules/qr/target";

export const metadata: Metadata = { title: "Cão cadastrado" };

/**
 * ============================================================================
 * Tela de sucesso do cadastro de cão — /painel/caes/[id]/pronto
 * ============================================================================
 *
 * ROTA PRÓPRIA, e não um `?criado=1` na página de edição, porque o problema que
 * ela resolve É a página de edição: `createDog` despejava o criador de volta no
 * mesmo formulário que ele acabou de preencher, sem confirmação nenhuma. Um
 * parâmetro na mesma rota manteria o formulário na tela e o defeito junto.
 *
 * A GUARDA É A MESMA DA EDIÇÃO: `getManageableDogById`, que já filtra por posse
 * (dono do cão, criador do registro, ou dono do canil em que ele está). Cão de
 * terceiro cai em `notFound()` pelo mesmo caminho que `e2e/08-isolamento`
 * já cobre para a tela de edição.
 *
 * NÃO É EXCLUSIVA DO INSTANTE DO CADASTRO: abrir depois continua funcionando e
 * mostra o estado atual. O texto foi escrito para não mentir nesse caso — ele
 * fala do que o registro É agora, não de algo que "acabou de acontecer".
 */
export default async function CaoProntoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getAuthUser();
  if (!user) notFound();

  const dog = await getManageableDogById(id, user.id);
  if (!dog) notFound();

  // Mesma função que a página de edição usa. Em cão recém-criado devolve lista
  // vazia — a galeria só existe depois, e é justamente por isso que a tela
  // sugere adicionar foto.
  const gallery = await getDogGallery(dog.id);
  const capa = gallery[0] ?? null;

  return (
    <div className="flex flex-col gap-8">
      <BackLink href="/painel/caes" label="Cães" />

      {/* Duas colunas no desktop pelo mesmo corte da tela de edição: à esquerda
          o que se AGE (publicar, compartilhar, completar), à direita o que se
          CONSULTA e leva para a gráfica. Abaixo de `xl` vira pilha, com o QR no
          fim — a ordem certa no celular, onde compartilhar é o que interessa e
          imprimir não acontece ali. */}
      <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-10">
        <DogCreated
          dogId={dog.id}
          name={dog.name}
          breed={dog.breed}
          sex={dog.sex}
          publicId={dog.public_id}
          // A MESMA função que o QR usa para montar a URL absoluta. Duas formas
          // de construir o endereço público divergiriam no primeiro ajuste — e
          // o QR impresso é o artefato que não dá para corrigir depois.
          publicUrl={qrTargetUrl("dog", dog.public_id)}
          coverUrl={capa?.thumbUrl ?? capa?.url ?? null}
          isPublished={Boolean(dog.published_at)}
        />

        <div className="flex flex-col gap-8">
          {/* Reaproveitado como está. O QR vale desde já, mesmo em rascunho:
              ele codifica o `public_id`, que é imutável e não depende de
              publicação — o papel impresso hoje continua valendo quando o
              criador publicar amanhã. */}
          <QrCard
            kind="dog"
            entityId={dog.id}
            stableId={dog.public_id}
            label="Aponta para o perfil público do cão. Já pode ir para a gráfica: ele codifica o identificador permanente, que não muda quando você editar o cadastro nem quando publicar."
          />
        </div>
      </div>
    </div>
  );
}
