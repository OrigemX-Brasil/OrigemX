import Image from "next/image";

import type { PublicTestimonial } from "@/modules/public/queries";

import { StarRating } from "./star-rating";

/** Card horizontal — avatar de um lado, nome/estrelas/texto do outro. Usado
 *  na página do canil (todos os depoimentos) e do cão (só os vinculados). */
export function TestimonialCard({ testimonial }: { testimonial: PublicTestimonial }) {
  return (
    <li className="border-border bg-surface rounded-card flex gap-4 border p-4">
      <div className="bg-surface-hover rounded-card text-fg-faint flex size-14 shrink-0 items-center justify-center overflow-hidden">
        {testimonial.avatar?.thumbUrl ? (
          <Image
            src={testimonial.avatar.thumbUrl}
            alt=""
            width={56}
            height={56}
            className="size-14 object-cover"
            unoptimized
          />
        ) : (
          <span className="text-lg">{testimonial.author_name.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-fg text-sm font-medium">{testimonial.author_name}</span>
          <StarRating value={testimonial.rating} />
        </div>
        <p className="text-fg-muted min-w-0 text-sm whitespace-pre-line">{testimonial.text}</p>
      </div>
    </li>
  );
}
