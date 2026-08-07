import { useEffect, useRef } from 'react';

/** С какого расстояния до экрана считать, что файл скоро понадобится. */
const PRELOAD_MARGIN = '600px 0px';

/**
 * Вызывает `onEnter` один раз, когда элемент подъезжает к видимой области.
 *
 * Запас в 600px нужен, чтобы патч успел загрузиться до того, как файл окажется
 * перед глазами: иначе при быстрой прокрутке видно мелькание «загрузка…».
 */
export function useNearViewport<T extends HTMLElement>(onEnter: () => void, enabled: boolean) {
  const ref = useRef<T | null>(null);
  const callback = useRef(onEnter);
  callback.current = onEnter;

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          callback.current();
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [enabled]);

  return ref;
}
