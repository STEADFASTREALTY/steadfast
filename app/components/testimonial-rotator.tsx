"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export type Testimonial = { id: string; author_name: string; author_context: string | null; quote: string; asset_id: string | null };
export function TestimonialRotator({ testimonials }: { testimonials: Testimonial[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => { if (testimonials.length < 2) return; const timer = window.setInterval(() => setIndex((current) => (current + 1) % testimonials.length), 7000); return () => window.clearInterval(timer); }, [testimonials.length]);
  if (!testimonials.length) return null;
  const testimonial = testimonials[index];
  return <section className="site-testimonial" aria-live="polite">
    <div className="site-testimonial-layout">
      <div className="site-testimonial-image">{testimonial.asset_id ? <Image src={`/media/sites/${testimonial.asset_id}/display.webp`} alt="" width={520} height={620} unoptimized /> : <div className="site-testimonial-image-placeholder" aria-hidden="true" />}</div>
      <div className="site-testimonial-copy"><blockquote>“{testimonial.quote}”</blockquote><div className="site-testimonial-author"><strong>{testimonial.author_name}</strong>{testimonial.author_context ? <span>{testimonial.author_context}</span> : null}</div></div>
    </div>
    {testimonials.length > 1 ? <div className="testimonial-dots" aria-label="Choose client story">{testimonials.map((item, itemIndex) => <button key={item.id} type="button" aria-label={`Show story ${itemIndex + 1}`} aria-current={itemIndex === index} onClick={() => setIndex(itemIndex)} />)}</div> : null}
  </section>;
}
