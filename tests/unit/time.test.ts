import { describe, expect, it } from 'vitest';
import { formatDateTime, formatRelativeTime, plural } from '@shared/time';

const now = Date.parse('2026-08-07T12:00:00Z');
const ago = (ms: number) => formatRelativeTime(now - ms, now);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('plural', () => {
  it('выбирает форму по русским правилам', () => {
    const forms = ['минута', 'минуты', 'минут'] as const;

    expect([1, 2, 5, 11, 21, 22, 25, 101, 112].map((n) => plural(n, forms))).toEqual([
      'минута',
      'минуты',
      'минут',
      'минут',
      'минута',
      'минуты',
      'минут',
      'минута',
      'минут',
    ]);
  });
});

describe('formatRelativeTime', () => {
  it('округляет свежие моменты до «только что»', () => {
    expect(ago(30 * SECOND)).toBe('только что');
  });

  it('считает минуты, часы и дни', () => {
    expect(ago(5 * MINUTE)).toBe('5 минут назад');
    expect(ago(3 * HOUR)).toBe('3 часа назад');
    expect(ago(5 * DAY)).toBe('5 дней назад');
  });

  it('вчерашнее называет вчерашним', () => {
    expect(ago(30 * HOUR)).toBe('вчера');
  });

  it('считает месяцы и годы', () => {
    expect(ago(90 * DAY)).toBe('3 месяца назад');
    expect(ago(800 * DAY)).toBe('2 года назад');
  });

  it('понимает ISO-строку', () => {
    expect(formatRelativeTime('2026-08-07T09:00:00Z', now)).toBe('3 часа назад');
  });

  it('не притворяется, что понял мусор', () => {
    expect(formatRelativeTime('не дата', now)).toBe('');
  });

  it('честно говорит про время из будущего', () => {
    expect(formatRelativeTime(now + HOUR, now)).toBe('в будущем');
  });
});

describe('formatDateTime', () => {
  it('пишет дату и время по-русски', () => {
    expect(formatDateTime('2026-08-12T01:19:02+02:00')).toBe('12 авг 2026, 01:19');
    expect(formatDateTime('2026-01-05T23:07:00+00:00')).toBe('5 янв 2026, 23:07');
  });

  it('оставляет время в таймзоне автора, а не переводит в местное', () => {
    // Полдень в Токио должен остаться полднем, у кого бы ни была открыта панель.
    expect(formatDateTime('2026-08-12T12:00:00+09:00')).toBe('12 авг 2026, 12:00');
  });

  it('не притворяется, что понял мусор', () => {
    expect(formatDateTime('')).toBe('');
    expect(formatDateTime('вчера')).toBe('');
  });
});
