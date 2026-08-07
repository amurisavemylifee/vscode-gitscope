import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Между тестами DOM должен быть чистым: иначе запросы вроде getByRole находят
// элементы из предыдущего теста.
afterEach(cleanup);

// jsdom не реализует наблюдатели, а на них держатся виртуализатор и ленивая
// загрузка патчей. Заглушки нужны, чтобы компоненты вообще смонтировались.
class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;
