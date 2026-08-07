import type { ChangeStatus, DiffLine, Hunk } from '@shared/model';

export interface ParsedFileDiff {
  /** Путь на стороне compare; для удалённого файла — путь на стороне base. */
  readonly path: string;
  readonly previousPath?: string;
  readonly status: ChangeStatus;
  readonly binary: boolean;
  readonly hunks: readonly Hunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

/**
 * Разбирает unified diff в модель.
 *
 * Понимает вывод для нескольких файлов сразу — так один и тот же парсер годится
 * и для ленивой загрузки патча по одному файлу, и для будущего «показать всё
 * сравнение одним патчем».
 *
 * Устойчив к обрыву на середине: если вывод был обрезан по лимиту размера,
 * последний хунк просто окажется короче объявленного в заголовке.
 */
export function parseUnifiedDiff(patch: string): ParsedFileDiff[] {
  const lines = patch.split('\n');
  // Патч всегда заканчивается переводом строки, поэтому split даёт лишний
  // пустой элемент. Если его не убрать, он может быть принят за пустую строку
  // контекста в последнем хунке.
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  const files: ParsedFileDiff[] = [];
  let index = 0;

  while (index < lines.length) {
    const fileHeader = lines[index];
    if (!fileHeader?.startsWith('diff --git ')) {
      index += 1;
      continue;
    }
    index += 1;

    let status: ChangeStatus = 'modified';
    let binary = false;
    let previousPath: string | undefined;
    // Пути из строки `diff --git a/X b/Y` — запасной вариант. Он нужен, потому
    // что у чистого переименования и у бинарного файла строк `---`/`+++`
    // попросту нет, и без него такой файл выпал бы из результата.
    let { base: basePath, compare: comparePath } = parseDiffGitHeader(fileHeader);

    // Заголовок файла: всё до первого хунка или до следующего файла.
    while (index < lines.length) {
      const line = lines[index];
      if (line === undefined || line.startsWith('@@') || line.startsWith('diff --git ')) {
        break;
      }
      if (line.startsWith('new file mode')) {
        status = 'added';
      } else if (line.startsWith('deleted file mode')) {
        status = 'deleted';
      } else if (line.startsWith('rename from ')) {
        previousPath = line.slice('rename from '.length);
        status = 'renamed';
      } else if (line.startsWith('copy from ')) {
        previousPath = line.slice('copy from '.length);
        status = 'copied';
      } else if (line.startsWith('--- ')) {
        basePath = stripSidePrefix(line.slice(4));
      } else if (line.startsWith('+++ ')) {
        comparePath = stripSidePrefix(line.slice(4));
      } else if (line.startsWith('Binary files ') || line.startsWith('GIT binary patch')) {
        binary = true;
      }
      index += 1;
    }

    const hunks: Hunk[] = [];
    while (index < lines.length) {
      const header = lines[index];
      if (header === undefined || !header.startsWith('@@')) {
        break;
      }
      const match = HUNK_HEADER.exec(header);
      if (!match) {
        break;
      }
      index += 1;

      const baseStart = Number.parseInt(match[1] ?? '0', 10);
      const baseCount = match[2] === undefined ? 1 : Number.parseInt(match[2], 10);
      const compareStart = Number.parseInt(match[3] ?? '0', 10);
      const compareCount = match[4] === undefined ? 1 : Number.parseInt(match[4], 10);

      const { hunkLines, nextIndex } = readHunkBody(lines, index, baseStart, baseCount, compareStart, compareCount);
      index = nextIndex;

      hunks.push({
        baseStart,
        baseCount,
        compareStart,
        compareCount,
        header: match[5] ?? '',
        lines: hunkLines,
      });
    }

    // При добавлении файла base-сторона — /dev/null, при удалении наоборот.
    const path = comparePath ?? basePath;
    if (path === undefined) {
      continue;
    }

    files.push({
      path,
      status,
      binary,
      hunks,
      ...(previousPath !== undefined ? { previousPath } : {}),
    });
  }

  return files;
}

function readHunkBody(
  lines: readonly string[],
  start: number,
  baseStart: number,
  baseCount: number,
  compareStart: number,
  compareCount: number,
): { hunkLines: DiffLine[]; nextIndex: number } {
  const hunkLines: DiffLine[] = [];
  let index = start;
  let baseLine = baseStart;
  let compareLine = compareStart;
  let baseSeen = 0;
  let compareSeen = 0;

  while (index < lines.length && (baseSeen < baseCount || compareSeen < compareCount)) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }

    // Маркер «в конце файла нет перевода строки» относится к предыдущей строке
    // и сам ни одну сторону не продвигает.
    if (line.startsWith('\\')) {
      const previous = hunkLines[hunkLines.length - 1];
      if (previous) {
        hunkLines[hunkLines.length - 1] = { ...previous, noNewlineAtEof: true };
      }
      index += 1;
      continue;
    }

    const marker = line[0];
    const text = line.slice(1);

    if (marker === '+') {
      hunkLines.push({ kind: 'insert', text, compareLine });
      compareLine += 1;
      compareSeen += 1;
    } else if (marker === '-') {
      hunkLines.push({ kind: 'delete', text, baseLine });
      baseLine += 1;
      baseSeen += 1;
    } else if (marker === ' ' || marker === undefined) {
      // marker === undefined — пустая строка: git пишет её как одиночный
      // пробел, но пробел мог потеряться по дороге, поэтому считаем контекстом.
      hunkLines.push({ kind: 'context', text: marker === undefined ? '' : text, baseLine, compareLine });
      baseLine += 1;
      compareLine += 1;
      baseSeen += 1;
      compareSeen += 1;
    } else {
      // Что-то, чего в теле хунка быть не может, — например, начало следующего
      // файла при обрезанном выводе. Хунк заканчиваем здесь.
      break;
    }

    index += 1;
  }

  return { hunkLines, nextIndex: index };
}

/**
 * Достаёт пути из строки `diff --git a/<путь> b/<путь>`.
 *
 * Формат неоднозначен: пути не экранируются, и пробел внутри имени файла
 * невозможно отличить от разделителя. Поэтому сначала пробуем самый частый
 * случай — оба пути одинаковые, значит строка делится ровно пополам, — и
 * только потом откатываемся на поиск ` b/`.
 */
function parseDiffGitHeader(line: string): { base?: string; compare?: string } {
  const rest = line.slice('diff --git '.length);

  const middle = (rest.length - 1) / 2;
  if (Number.isInteger(middle) && rest[middle] === ' ') {
    const left = rest.slice(0, middle);
    const right = rest.slice(middle + 1);
    if (left.slice(2) === right.slice(2)) {
      return { base: stripSidePrefix(left), compare: stripSidePrefix(right) };
    }
  }

  const separator = rest.indexOf(' b/');
  if (separator > 0) {
    return { base: stripSidePrefix(rest.slice(0, separator)), compare: stripSidePrefix(rest.slice(separator + 1)) };
  }

  return {};
}

/** `a/src/foo.ts` → `src/foo.ts`, `/dev/null` → undefined. */
function stripSidePrefix(raw: string): string | undefined {
  if (raw === '/dev/null') {
    return undefined;
  }
  if (raw.startsWith('a/') || raw.startsWith('b/')) {
    return raw.slice(2);
  }
  return raw;
}
