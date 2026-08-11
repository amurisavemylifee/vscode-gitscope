import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileVersion } from '@shared/historyModel';
import type { FilePatch } from '@shared/model';
import { bridge } from '../api/bridge';

export type Loaded<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'failed'; readonly message: string };

/**
 * Содержимое версий и патчи к ним, по одной штуке на выбранный элемент списка.
 *
 * Загруженное остаётся в памяти: по истории ходят вверх-вниз, сравнивая соседние
 * версии, и повторный поход в git на каждый клик был бы заметен. Кэш сбрасывается
 * вместе с ключом — при смене файла или перезагрузке истории.
 */
export function useVersions(historyKey: string, contextLines: number) {
  const [versions, setVersions] = useState<ReadonlyMap<string, Loaded<FileVersion>>>(() => new Map());
  const [patches, setPatches] = useState<ReadonlyMap<string, Loaded<FilePatch>>>(() => new Map());
  const requested = useRef<Set<string>>(new Set());

  useEffect(() => {
    requested.current = new Set();
    setVersions(new Map());
    setPatches(new Map());
  }, [historyKey]);

  // Число строк контекста меняет содержимое патчей, а версии файла — нет.
  useEffect(() => {
    for (const key of requested.current) {
      if (key.startsWith('patch:')) {
        requested.current.delete(key);
      }
    }
    setPatches(new Map());
  }, [contextLines]);

  const requestVersion = useCallback((entryId: string) => {
    load(entryId, `version:${entryId}`, requested, setVersions, () => bridge.request('history/version', { entryId }));
  }, []);

  const requestPatch = useCallback((entryId: string) => {
    load(entryId, `patch:${entryId}`, requested, setPatches, () => bridge.request('history/patch', { entryId }));
  }, []);

  return { versions, patches, requestVersion, requestPatch };
}

/** `id` адресует место в кэше, `key` — уже запрошенное: у версии и патча оно своё. */
function load<T>(
  id: string,
  key: string,
  requested: { current: Set<string> },
  setState: (update: (previous: ReadonlyMap<string, Loaded<T>>) => ReadonlyMap<string, Loaded<T>>) => void,
  fetch: () => Promise<T>,
): void {
  if (requested.current.has(key)) {
    return;
  }
  requested.current.add(key);
  setState((previous) => new Map(previous).set(id, { status: 'loading' }));

  fetch()
    .then((value) => setState((previous) => new Map(previous).set(id, { status: 'ready', value })))
    .catch((error: unknown) => {
      // Даём возможность повторить: запрос мог отмениться при перезагрузке
      // истории, а не сломаться по-настоящему.
      requested.current.delete(key);
      setState((previous) =>
        new Map(previous).set(id, {
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    });
}
