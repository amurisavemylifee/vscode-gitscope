import { describe, expect, it } from 'vitest';
import { authorColor, authorInitials } from '../../webview/graph/avatar';

describe('authorInitials', () => {
  it('берёт первые буквы имени и фамилии', () => {
    expect(authorInitials('Тарас Шашурин')).toBe('ТШ');
  });

  it('из одного слова берёт одну букву', () => {
    expect(authorInitials('dependabot')).toBe('D');
  });

  it('игнорирует лишние пробелы и хвост из отчества', () => {
    expect(authorInitials('  Иван   Иванович Иванов  ')).toBe('ИИ');
  });

  it('не разрезает символы за пределами BMP пополам', () => {
    // Эмодзи — суррогатная пара: посимвольный доступ по индексу вернул бы половину.
    expect(authorInitials('🚀 deploy-bot')).toBe('🚀D');
  });

  it('на пустом имени отдаёт заглушку, а не пустой кружок', () => {
    expect(authorInitials('')).toBe('?');
    expect(authorInitials('   ')).toBe('?');
  });
});

describe('authorColor', () => {
  it('у одного и того же имени цвет всегда один', () => {
    expect(authorColor('Тарас')).toBe(authorColor('Тарас'));
  });

  it('разным авторам обычно достаются разные оттенки', () => {
    expect(authorColor('Тарас')).not.toBe(authorColor('Мария'));
  });

  it('отдаёт корректный hsl в пределах круга оттенков', () => {
    const match = /^hsl\((\d+) \d+% \d+%\)$/.exec(authorColor('кто угодно'));

    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeLessThan(360);
  });

  it('переживает пустое имя', () => {
    expect(authorColor('')).toMatch(/^hsl\(/);
  });
});
