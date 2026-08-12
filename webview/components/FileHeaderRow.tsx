import type { FileChange } from '@shared/model';
import { DiffStat } from './DiffStat';
import { Icon } from './Icon';
import { StatusBadge } from './StatusBadge';

interface FileHeaderRowProps {
  readonly file: FileChange;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  /** Шапка отрисована в липкой полосе поверх списка, а не как обычная строка. */
  readonly floating?: boolean;
}

/** Заголовок файла: тот же компонент используется и в потоке строк, и в липкой полосе. */
export function FileHeaderRow({ file, collapsed, onToggle, floating = false }: FileHeaderRowProps) {
  return (
    <div className={`gs-file-header${floating ? ' gs-file-header--floating' : ''}`}>
      {/* Содержимое отделено от полосы: полоса тянется на всю ширину строк, а
          содержимое остаётся в окне при горизонтальной прокрутке. */}
      <div className="gs-file-header__body">
        <button
          type="button"
          className="gs-file-header__toggle"
          aria-expanded={!collapsed}
          title={collapsed ? 'Развернуть файл' : 'Свернуть файл'}
          onClick={onToggle}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={13} />
        </button>

        <StatusBadge status={file.status} />

        <span
          className="gs-file-header__path"
          title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}
        >
          {file.previousPath ? (
            <>
              <span className="gs-file-header__previous">{file.previousPath}</span>
              <Icon name="chevron-right" size={11} />
            </>
          ) : null}
          <span className="gs-file-header__name">{file.path}</span>
        </span>

        {file.similarity !== undefined ? (
          <span className="gs-file-header__meta" title="Насколько файл совпадает с прежним">
            {file.similarity}%
          </span>
        ) : null}

        {file.binary ? (
          <span className="gs-file-header__meta">двоичный</span>
        ) : (
          <DiffStat insertions={file.insertions} deletions={file.deletions} withBar />
        )}
      </div>
    </div>
  );
}
