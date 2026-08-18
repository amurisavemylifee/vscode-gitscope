import { Icon, type IconName } from './Icon';
import './Segmented.css';

interface SegmentedButtonProps {
  readonly active: boolean;
  /** Со значком кнопка показывает его, без значка — саму подпись. */
  readonly icon?: IconName;
  readonly label: string;
  readonly onClick: () => void;
}

/**
 * Кнопка переключателя из нескольких состояний.
 *
 * Одна на все панели: выбор раскладки диффа выглядит и ведёт себя одинаково и
 * в истории файла, и в стешах — это одно и то же действие.
 */
export function SegmentedButton({ active, icon, label, onClick }: SegmentedButtonProps) {
  return (
    <button
      type="button"
      className={`gs-segmented__button${active ? ' gs-segmented__button--active' : ''}`}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} size={14} /> : label}
    </button>
  );
}
