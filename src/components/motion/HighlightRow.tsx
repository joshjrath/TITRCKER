'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { useHighlight } from './useHighlight';

export interface HighlightRowProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Default 'tr'. */
  as?: 'tr' | 'li' | 'div';
  /** True for the row that was just saved. */
  highlighted: boolean;
  /** Change it to replay the highlight on a row that is already highlighted (e.g. its version). */
  highlightKey?: string | number;
  children?: ReactNode;
}

/** A list/table row that briefly washes lavender when `highlighted` turns on (see useHighlight). */
export function HighlightRow({ as: Tag = 'tr', highlighted, highlightKey, className, children, ...rest }: HighlightRowProps) {
  const classFor = useHighlight(highlighted ? 'row' : null, highlightKey);
  const cls = [className, classFor('row')].filter(Boolean).join(' ');
  return (
    <Tag className={cls || undefined} {...rest}>
      {children}
    </Tag>
  );
}
