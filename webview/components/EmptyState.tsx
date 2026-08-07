import type { ReactNode } from 'react';
import './EmptyState.css';

interface EmptyStateProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly tone?: 'neutral' | 'error';
  readonly action?: ReactNode;
}

/** Единый вид для «пусто», «загружается», «сломалось» — чтобы панель никогда не была просто белым пятном. */
export function EmptyState({ title, description, tone = 'neutral', action }: EmptyStateProps) {
  return (
    <div className={`gs-empty gs-empty--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <h2 className="gs-empty__title">{title}</h2>
      {description ? <p className="gs-empty__description">{description}</p> : null}
      {action ? <div className="gs-empty__action">{action}</div> : null}
    </div>
  );
}
