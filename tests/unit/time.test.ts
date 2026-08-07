import { describe, expect, it } from 'vitest';
import { formatAbsoluteTime, formatRelativeTime, plural } from '@shared/time';

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

describe('formatAbsoluteTime', () => {
  it('показывает и дату, и время — иначе подпись не отвечает на «когда именно»', () => {
    const formatted = formatAbsoluteTime('2026-08-07T09:30:00Z');

    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/\d{2}:\d{2}/);
  });

  it('принимает миллисекунды так же, как ISO-строку', () => {
    expect(formatAbsoluteTime(now)).toBe(formatAbsoluteTime('2026-08-07T12:00:00Z'));
  });

  it('не притворяется, что понял мусор', () => {
    expect(formatAbsoluteTime('не дата')).toBe('');
  });
});
