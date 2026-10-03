import type { HTMLAttributes, ReactNode } from 'react';
import styles from './motion.module.css';

/** Class for a soft entrance (opacity + 8px rise, 180ms). Apply to dialogs/sheets/forms directly. */
export const revealClassName: string = styles.reveal ?? '';

const DELAYS = ['', styles.delay1, styles.delay2, styles.delay3] as const;

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'li' | 'span' | 'form';
  /** Stagger step: 0 (none), 1 = 60ms, 2 = 120ms, 3 = 180ms. */
  delay?: 0 | 1 | 2 | 3;
  children?: ReactNode;
}

/**
 * Soft reveal on mount: 180ms opacity + 8px translate, CSS only (works in server components).
 * Instant under prefers-reduced-motion.
 */
export function Reveal({ as: Tag = 'div', delay = 0, className, children, ...rest }: RevealProps) {
  return (
    <Tag className={[styles.reveal, DELAYS[delay], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}
