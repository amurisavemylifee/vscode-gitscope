import type { ChangeStatus } from '@shared/model';
import './StatusBadge.css';

const LABELS: Record<ChangeStatus, { letter: string; title: string }> = {
  added: { letter: 'A', title: 'Файл добавлен' },
  modified: { letter: 'M', title: 'Файл изменён' },
  deleted: { letter: 'D', title: 'Файл удалён' },
  renamed: { letter: 'R', title: 'Файл переименован' },
  copied: { letter: 'C', title: 'Файл скопирован' },
  'type-changed': { letter: 'T', title: 'Изменился тип файла' },
};

/** Однобуквенный маркер статуса — та же система обозначений, что у самого git. */
export function StatusBadge({ status }: { readonly status: ChangeStatus }) {
  const { letter, title } = LABELS[status];
  return (
    <span className={`gs-status gs-status--${status}`} title={title} aria-label={title}>
      {letter}
    </span>
  );
}
