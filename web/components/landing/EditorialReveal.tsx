'use client';

import type { ReactNode } from 'react';
import { m } from 'motion/react';

interface EditorialRevealProps {
  children: ReactNode;
  className?: string;
  /**
   * Above-the-fold sections animate on mount instead of waiting for scroll —
   * readers don't scroll up from above the fold, so whileInView would never
   * fire on the hero. Defaults to false (scroll-triggered).
   */
  onMount?: boolean;
}

// Restraint-by-default scroll reveal for the landing broadsheet. Each section
// fades + rises 12 px once, when it crosses 10% into the viewport — the kind
// of "page is finishing settling" feel that NYT / Atlantic style features
// get for free with paper. NOT magaziney parallax or scroll-jacking; the
// broadsheet aesthetic is restrained, and so is this.
//
// `once: true` detaches the IntersectionObserver after firing, so the
// landing page has no continuous scroll listener.
export default function EditorialReveal({
  children,
  className,
  onMount = false,
}: EditorialRevealProps) {
  const initial = { opacity: 0, y: 12 };
  const visible = { opacity: 1, y: 0 };
  const transition = { duration: 0.36, ease: [0.2, 0.7, 0.2, 1] as const };

  if (onMount) {
    return (
      <m.section
        className={className}
        initial={initial}
        animate={visible}
        transition={transition}
      >
        {children}
      </m.section>
    );
  }
  return (
    <m.section
      className={className}
      initial={initial}
      whileInView={visible}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={transition}
    >
      {children}
    </m.section>
  );
}
