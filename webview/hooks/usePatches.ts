import { useCallback, useEffect, useRef, useState } from 'react';
import type { FilePatch } from '@shared/model';
import { bridge } from '../api/bridge';

export type PatchState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly patch: FilePatch }
  | { readonly status: 'failed'; readonly message: string };

/**
 * Вторая фаза загрузки: патчи запрашиваются по одному, когда файл подъезжает к
 * экрану. Сравнение на тысячу файлов открывается сразу, а трафик и память
 * тратятся только на то, что человек действительно смотрит.
 */
export function usePatches(comparisonKey: string) {
  const [patches, setPatches] = useState<ReadonlyMap<string, PatchState>>(() => new Map());
  const requested = useRef<Set<string>>(new Set());

  // Сменилось сравнение — прежние патчи больше не про эти ревизии.
  useEffect(() => {
    requested.current = new Set();
    setPatches(new Map());
  }, [comparisonKey]);

  const update = useCallback((path: string, state: PatchState) => {
    setPatches((previous) => new Map(previous).set(path, state));
  }, []);

  const requestPatch = useCallback(
    (path: string) => {
      if (requested.current.has(path)) {
        return;
      }
      requested.current.add(path);
      update(path, { status: 'loading' });

      bridge
        .request('comparison/patch', { path })
        .then((patch) => update(path, { status: 'ready', patch }))
        .catch((error: unknown) => {
          // Даём возможность повторить: файл мог не загрузиться из-за отмены
          // при смене ревизий, а не из-за настоящей поломки.
          requested.current.delete(path);
          update(path, { status: 'failed', message: error instanceof Error ? error.message : String(error) });
        });
    },
    [update],
  );

  return { patches, requestPatch };
}
