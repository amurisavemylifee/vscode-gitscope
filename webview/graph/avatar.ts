/**
 * Аватары авторов рисуются из имени, а не грузятся с сервера: панель работает с
 * локальным репозиторием и не должна ходить в сеть (да и CSP webview этого не
 * позволит). Инициалы плюс стабильный цвет дают ту же функцию, что и настоящие
 * аватары — узнавать автора взглядом, не читая имя.
 */

/** Насыщенность и светлота подобраны так, чтобы белый текст читался поверх любого оттенка. */
const SATURATION = 45;
const LIGHTNESS = 45;

/** Первые буквы первых двух слов имени: «Тарас Шашурин» → «ТШ». */
export function authorInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  return words
    .slice(0, 2)
    // Через spread, а не по индексу: первый символ имени может быть суррогатной парой.
    .map((word) => [...word][0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

/**
 * Стабильный оттенок по имени: у одного и того же автора аватар всегда одного
 * цвета, в том числе между перезапусками — иначе от аватара не было бы пользы.
 */
export function authorColor(name: string): string {
  let hue = 0;
  for (const char of name) {
    hue = (hue * 31 + (char.codePointAt(0) ?? 0)) % 360;
  }
  return `hsl(${hue} ${SATURATION}% ${LIGHTNESS}%)`;
}
