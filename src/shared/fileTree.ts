/**
 * Построение дерева файлов из плоского списка путей.
 *
 * Изоморфно и без зависимостей: дерево рисует webview, но алгоритм проверяется
 * обычными юнит-тестами, и его же переиспользует любая будущая панель со
 * списком файлов.
 */

export interface FileTreeFileNode {
  readonly kind: 'file';
  readonly name: string;
  readonly path: string;
  /** Индекс в исходном массиве путей — по нему находится FileChange. */
  readonly index: number;
}

export interface FileTreeDirectoryNode {
  readonly kind: 'directory';
  /** Может содержать несколько сегментов: цепочки одиночных папок сжимаются. */
  readonly name: string;
  readonly path: string;
  readonly children: readonly FileTreeNode[];
}

export type FileTreeNode = FileTreeFileNode | FileTreeDirectoryNode;

interface MutableDirectory {
  readonly directories: Map<string, MutableDirectory>;
  readonly files: { name: string; index: number }[];
}

const createDirectory = (): MutableDirectory => ({ directories: new Map(), files: [] });

/**
 * Строит дерево. Цепочки папок с единственным потомком-папкой сжимаются в одну
 * строку (`src/api/handlers`) — так дерево не превращается в лестницу отступов
 * на глубоких проектах.
 */
export function buildFileTree(paths: readonly string[]): FileTreeNode[] {
  const root = createDirectory();

  paths.forEach((path, index) => {
    const segments = path.split('/').filter((segment) => segment !== '');
    if (segments.length === 0) {
      return;
    }

    let current = root;
    for (const segment of segments.slice(0, -1)) {
      let next = current.directories.get(segment);
      if (!next) {
        next = createDirectory();
        current.directories.set(segment, next);
      }
      current = next;
    }
    current.files.push({ name: segments[segments.length - 1] as string, index });
  });

  return toNodes(root, '');
}

function toNodes(directory: MutableDirectory, prefix: string): FileTreeNode[] {
  const directories: FileTreeDirectoryNode[] = [];

  for (const [name, child] of directory.directories) {
    let compressedName = name;
    let compressedPath = prefix === '' ? name : `${prefix}/${name}`;
    let current = child;

    // Пока у папки ровно один потомок и это папка — приклеиваем её имя.
    while (current.files.length === 0 && current.directories.size === 1) {
      const [onlyName, onlyChild] = [...current.directories][0] as [string, MutableDirectory];
      compressedName = `${compressedName}/${onlyName}`;
      compressedPath = `${compressedPath}/${onlyName}`;
      current = onlyChild;
    }

    directories.push({
      kind: 'directory',
      name: compressedName,
      path: compressedPath,
      children: toNodes(current, compressedPath),
    });
  }

  const files: FileTreeFileNode[] = directory.files.map((file) => ({
    kind: 'file',
    name: file.name,
    path: prefix === '' ? file.name : `${prefix}/${file.name}`,
    index: file.index,
  }));

  // Папки выше файлов — как в проводнике VS Code.
  directories.sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  files.sort((left, right) => left.name.localeCompare(right.name, 'ru'));

  return [...directories, ...files];
}
