import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatchState } from '../../hooks/usePatches';
import { bridge } from '../api/bridge';

/**
 * Патчи файлов выбранного стеша: запрашиваются по одному, когда файл подъезжает
 * к экрану, — как и в панели сравнения.
 *
 * Ключ кэша — стеш и число строк контекста. Содержимое стеша неизменно, а вот
 * контекст задаётся настройкой: когда её меняют, прежние патчи описывают уже не
 * то, что попросили показать.
 */
export function useStashPatches(sha: string | null, contextLines: number) {
  const key = `${sha ?? ''}:${contextLines}`;
  const [patches, setPatches] = useState<ReadonlyMap<string, PatchState>>(() => new Map());
  const requested = useRef<Set<string>>(new Set());
  const current = useRef(key);

  useEffect(() => {
    current.current = key;
    requested.current = new Set();
    setPatches(new Map());
  }, [key]);

  const requestPatch = useCallback(
    (path: string) => {
      if (sha === null || requested.current.has(path)) {
        return;
      }
      requested.current.add(path);

      const update = (state: PatchState) => {
        // Ответ на запрос про другой стеш никому не нужен: его файлы уже не те.
        if (current.current === key) {
          setPatches((previous) => new Map(previous).set(path, state));
        }
      };
      update({ status: 'loading' });

      bridge
        .request('stashes/patch', { sha, path })
        .then((patch) => update({ status: 'ready', patch }))
        .catch((error: unknown) => {
          // Даём возможность повторить: файл мог не загрузиться из-за отмены
          // при перечитывании списка, а не из-за настоящей поломки.
          requested.current.delete(path);
          update({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
        });
    },
    [sha, key],
  );

  return { patches, requestPatch };
}
