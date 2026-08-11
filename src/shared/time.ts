/**
 * Форматирование времени по-русски. Изоморфно: нужно и в пикере ревизий
 * (когда был коммит), и в шапке панели (когда был последний fetch).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Выбирает форму слова: 1 минута, 2 минуты, 5 минут. */
export function plural(count: number, forms: readonly [string, string, string]): string {
  const absolute = Math.abs(count) % 100;
  const tail = absolute % 10;
  if (absolute > 10 && absolute < 20) {
    return forms[2];
  }
  if (tail > 1 && tail < 5) {
    return forms[1];
  }
  if (tail === 1) {
    return forms[0];
  }
  return forms[2];
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/**
 * «12 авг 2026, 01:19» из ISO-строки.
 *
 * Поля берутся из строки как есть, без `Date`: git пишет время в таймзоне
 * автора, и коммит, сделанный в Токио в полдень, должен остаться полуднем, а не
 * превратиться в ночь по часам смотрящего.
 */
export function formatDateTime(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) {
    return '';
  }
  const [, year, month, day, hour, minute] = match as unknown as [string, string, string, string, string, string];
  return `${Number.parseInt(day, 10)} ${MONTHS[Number.parseInt(month, 10) - 1] ?? month} ${year}, ${hour}:${minute}`;
}

/**
 * «3 минуты назад», «вчера», «2 месяца назад».
 *
 * Принимает миллисекунды или ISO-строку; на нераспознанном значении возвращает
 * пустую строку — подпись просто не показывается, а не ломает вёрстку.
 */
export function formatRelativeTime(value: number | string, now: number = Date.now()): string {
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  const elapsed = now - timestamp;
  if (elapsed < 0) {
    return 'в будущем';
  }
  if (elapsed < MINUTE) {
    return 'только что';
  }
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} ${plural(minutes, ['минуту', 'минуты', 'минут'])} назад`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} ${plural(hours, ['час', 'часа', 'часов'])} назад`;
  }
  if (elapsed < 2 * DAY) {
    return 'вчера';
  }
  if (elapsed < MONTH) {
    const days = Math.floor(elapsed / DAY);
    return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;
  }
  if (elapsed < YEAR) {
    const months = Math.floor(elapsed / MONTH);
    return `${months} ${plural(months, ['месяц', 'месяца', 'месяцев'])} назад`;
  }
  const years = Math.floor(elapsed / YEAR);
  return `${years} ${plural(years, ['год', 'года', 'лет'])} назад`;
}
