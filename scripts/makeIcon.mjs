/**
 * Иконка расширения для маркетплейса: icon.png, 128×128.
 *
 * Рисуется кодом, а не в редакторе, — картинка плоская и геометричная, и держать
 * её исходником проще, чем бинарником: поменять цвет или ширину полосы можно
 * правкой пары чисел. Сглаживание — суперсэмплингом: рисуем вчетверо крупнее и
 * усредняем блоки 4×4.
 *
 * Запуск: node scripts/makeIcon.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 128;
const SS = 4;
const W = SIZE * SS;

const BACKGROUND = '#1b2028';
const PANEL = '#272d38';
const LINE = '#6e7681';
const ADDED = '#3fb950';
const REMOVED = '#f85149';

/** Скруглённый прямоугольник в координатах крупной сетки. */
const rect = (x, y, width, height, radius, color) => ({
  x0: x * SS,
  y0: y * SS,
  x1: (x + width) * SS,
  y1: (y + height) * SS,
  r: radius * SS,
  color,
});

/** Полоса «строки кода» внутри половины. */
const bar = (x, y, width, color) => rect(x, y, width, 7, 3.5, color);

// Две половины сравнения, в каждой — строки кода. По одной строке в половине
// подкрашено: слева удалённая, справа добавленная. Этого хватает, чтобы значок
// читался как дифф даже в списке расширений.
const LEFT = 14;
const RIGHT = 68;
const shapes = [
  rect(0, 0, 128, 128, 26, BACKGROUND),
  rect(LEFT, 26, 46, 76, 6, PANEL),
  rect(RIGHT, 26, 46, 76, 6, PANEL),

  bar(LEFT + 6, 34, 30, LINE),
  bar(LEFT + 6, 47, 22, LINE),
  bar(LEFT + 6, 60, 34, REMOVED),
  bar(LEFT + 6, 73, 26, LINE),
  bar(LEFT + 6, 86, 18, LINE),

  bar(RIGHT + 6, 34, 30, LINE),
  bar(RIGHT + 6, 47, 22, LINE),
  bar(RIGHT + 6, 60, 34, ADDED),
  bar(RIGHT + 6, 73, 30, ADDED),
  bar(RIGHT + 6, 86, 18, LINE),
];

const parseColor = (hex) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** Точка внутри скруглённого прямоугольника. */
function covers(shape, x, y) {
  const { x0, y0, x1, y1, r } = shape;
  if (x < x0 || x >= x1 || y < y0 || y >= y1) {
    return false;
  }
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Крупная сетка: последняя накрывшая фигура и выигрывает.
const big = new Uint8Array(W * W * 4);
for (let y = 0; y < W; y += 1) {
  for (let x = 0; x < W; x += 1) {
    for (let index = shapes.length - 1; index >= 0; index -= 1) {
      const shape = shapes[index];
      if (covers(shape, x + 0.5, y + 0.5)) {
        const [r, g, b] = parseColor(shape.color);
        const at = (y * W + x) * 4;
        big[at] = r;
        big[at + 1] = g;
        big[at + 2] = b;
        big[at + 3] = 255;
        break;
      }
    }
  }
}

// Усреднение блоков: за краем скругления пикселей нет, поэтому усредняется и
// прозрачность — от неё и берётся мягкий край.
const pixels = new Uint8Array(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    const sum = [0, 0, 0, 0];
    for (let dy = 0; dy < SS; dy += 1) {
      for (let dx = 0; dx < SS; dx += 1) {
        const at = ((y * SS + dy) * W + (x * SS + dx)) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          sum[channel] += big[at + channel];
        }
      }
    }
    const at = (y * SIZE + x) * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      pixels[at + channel] = Math.round(sum[channel] / (SS * SS));
    }
  }
}

writeFileSync('icon.png', encodePng(pixels, SIZE, SIZE));
console.log(`icon.png: ${SIZE}×${SIZE}`);

/** Минимальный PNG: RGBA без фильтров, одна IDAT. */
function encodePng(rgba, width, height) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // тип фильтра строки
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
