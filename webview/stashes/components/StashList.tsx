import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import type { FileChange } from '@shared/model';
import type { StashEntry, StashFile } from '@shared/stashModel';
import type { StashSummaryResult } from '@shared/stashProtocol';
import { plural } from '@shared/time';
import { FileTree } from '../../components/FileTree';
import { nextSelectedIndex } from '../../history/navigation';
import { StashCard, stashCardId } from './StashCard';
import './StashList.css';

interface StashListProps {
  readonly entries: readonly StashEntry[];
  readonly summaries: ReadonlyMap<string, StashSummaryResult>;
  readonly selectedSha: string | null;
  /** Файлы выбранного стеша в том же порядке, в каком они лежат на полотне. */
  readonly files: readonly StashFile[];
  readonly activePath: string | null;
  readonly onSelect: (entry: StashEntry) => void;
  readonly onSelectFile: (path: string) => void;
  readonly onCopySha: (entry: StashEntry) => Promise<unknown>;
}

/**
 * Список стешей: раскрытый показывает своё дерево файлов прямо под собой.
 *
 * Аккордеон, а не третья колонка: дерево файлов рядом со списком стешей съело
 * бы полпанели, и до первой строки кода не осталось бы места. Так соседние
 * стеши остаются на виду, а полотно диффа занимает всю оставшуюся ширину.
 *
 * Стешей в репозитории единицы, поэтому список не виртуализован — в отличие от
 * версий файла, которых бывают тысячи.
 */
export function StashList({
  entries,
  summaries,
  selectedSha,
  files,
  activePath,
  onSelect,
  onSelectFile,
  onCopySha,
}: StashListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedIndex = entries.findIndex((entry) => entry.sha === selectedSha);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const next = nextSelectedIndex(selectedIndex < 0 ? 0 : selectedIndex, event.key, entries.length);
      if (next === undefined) {
        return;
      }
      event.preventDefault();

      const entry = entries[next];
      if (entry) {
        onSelect(entry);
        // Карточка могла уехать за край: показываем её, ничего не прокручивая
        // сверх необходимого.
        document.getElementById(stashCardId(entry.sha))?.scrollIntoView?.({ block: 'nearest' });
      }
    },
    [entries, selectedIndex, onSelect],
  );

  return (
    <div
      className="gs-stashes-list"
      ref={scrollRef}
      role="listbox"
      tabIndex={0}
      aria-label="Стеши"
      {...(selectedSha !== null ? { 'aria-activedescendant': stashCardId(selectedSha) } : {})}
      onKeyDown={onKeyDown}
      onMouseDown={() => {
        // Фокус держит сам список, а не карточка: иначе после клика мышью
        // стрелки перестают листать стеши.
        scrollRef.current?.focus();
      }}
    >
      {entries.map((entry, index) => (
        <div key={entry.sha}>
          <StashCard
            entry={entry}
            summary={summaries.get(entry.sha)}
            selected={entry.sha === selectedSha}
            first={index === 0}
            last={index === entries.length - 1}
            onSelect={() => onSelect(entry)}
            onCopySha={() => onCopySha(entry)}
          />
          {entry.sha === selectedSha ? (
            <StashFiles
              summary={summaries.get(entry.sha)}
              files={files}
              activePath={activePath}
              onSelectFile={onSelectFile}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Дерево файлов раскрытого стеша — то же, что в панели сравнения. */
function StashFiles({
  summary,
  files,
  activePath,
  onSelectFile,
}: {
  readonly summary: StashSummaryResult | undefined;
  readonly files: readonly StashFile[];
  readonly activePath: string | null;
  readonly onSelectFile: (path: string) => void;
}) {
  const byPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const mark = useCallback((file: FileChange) => renderMark(byPath.get(file.path)), [byPath]);

  if (summary === undefined) {
    return <div className="gs-stashes-list__note">считаем содержимое…</div>;
  }
  if (summary.summary === null) {
    return (
      <div className="gs-stashes-list__note gs-stashes-list__note--error">
        {summary.error?.message ?? 'не удалось прочитать стеш'}
      </div>
    );
  }
  if (files.length === 0) {
    return <div className="gs-stashes-list__note">в стеше нет файлов</div>;
  }

  return (
    <div className="gs-stashes-list__files">
      <div className="gs-stashes-list__files-title">
        {files.length} {plural(files.length, ['изменённый файл', 'изменённых файла', 'изменённых файлов'])}
      </div>
      <FileTree files={files} activePath={activePath} onSelect={onSelectFile} mark={mark} />
    </div>
  );
}

/**
 * Откуда файл попал в стеш.
 *
 * Обе пометки про одно и то же: `git stash pop` вернёт такой файл не туда, где
 * его взяли, — новый останется неотслеживаемым, а изменение из индекса приедет
 * в рабочее дерево, если не позвать `--index`.
 */
function renderMark(file: StashFile | undefined): ReactNode {
  if (file?.untracked === true) {
    return (
      <span className="gs-stashes-list__mark" title="Файла не было в git — стеш сохранил его целиком">
        новый
      </span>
    );
  }
  if (file?.staged === true) {
    return (
      <span className="gs-stashes-list__mark" title="Изменение лежало в индексе">
        индекс
      </span>
    );
  }
  return null;
}
