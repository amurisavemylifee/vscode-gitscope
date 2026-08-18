import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import './CopyShaButton.css';

/** Сколько держать отметку об успешном копировании. */
const COPIED_FEEDBACK_MS = 1200;

interface CopyShaButtonProps {
  readonly shortSha: string;
  /** Подсказка до копирования: что именно скопируется. */
  readonly title: string;
  readonly onCopy: () => Promise<unknown>;
}

/**
 * Короткий SHA, он же кнопка копирования.
 *
 * Отдельной кнопки под это нет намеренно: SHA — единственное, что отсюда
 * копируют, и щёлкать удобнее по самой надписи. Значок рядом проявляется под
 * курсором, но место занимает всегда — иначе строка дёргалась бы при наведении.
 *
 * Одна на все панели: и у версии файла, и у стеша это одно и то же действие.
 */
export function CopyShaButton({ shortSha, title, onCopy }: CopyShaButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={`gs-copy-sha${copied ? ' gs-copy-sha--copied' : ''}`}
      title={copied ? 'SHA скопирован' : title}
      onClick={(event) => {
        // Клик по SHA — про буфер обмена, а не про выбор в списке.
        event.stopPropagation();
        void onCopy().then(() => setCopied(true));
      }}
    >
      {shortSha}
      <Icon name={copied ? 'check' : 'copy'} size={10} className="gs-copy-sha__icon" />
    </button>
  );
}
