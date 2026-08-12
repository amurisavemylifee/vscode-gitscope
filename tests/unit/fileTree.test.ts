import { describe, expect, it } from 'vitest';
import { buildFileTree, flattenFileTree, type FileTreeNode } from '@shared/fileTree';

/** Компактная запись дерева для сравнений: `имя` для файла, `имя/[...]` для папки. */
function outline(nodes: readonly FileTreeNode[]): unknown[] {
  return nodes.map((node) => (node.kind === 'file' ? node.name : { [node.name]: outline(node.children) }));
}

describe('buildFileTree', () => {
  it('раскладывает пути по папкам', () => {
    const tree = buildFileTree(['src/a.ts', 'src/b.ts', 'README.md']);

    expect(outline(tree)).toEqual([{ src: ['a.ts', 'b.ts'] }, 'README.md']);
  });

  it('сжимает цепочку папок с единственным потомком', () => {
    const tree = buildFileTree(['src/api/handlers/get.ts', 'src/api/handlers/post.ts']);

    expect(outline(tree)).toEqual([{ 'src/api/handlers': ['get.ts', 'post.ts'] }]);
  });

  it('не сжимает папку, в которой есть свои файлы', () => {
    const tree = buildFileTree(['src/index.ts', 'src/api/client.ts']);

    expect(outline(tree)).toEqual([{ src: [{ api: ['client.ts'] }, 'index.ts'] }]);
  });

  it('ставит папки выше файлов и сортирует по алфавиту', () => {
    const tree = buildFileTree(['z.txt', 'a.txt', 'b/inner.txt']);

    expect(outline(tree)).toEqual([{ b: ['inner.txt'] }, 'a.txt', 'z.txt']);
  });

  it('сохраняет индекс исходного пути, чтобы найти запись об изменении', () => {
    const paths = ['src/a.ts', 'docs/b.md'];
    const tree = buildFileTree(paths);
    const flat = new Map<string, number>();

    const walk = (nodes: readonly FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'file') {
          flat.set(node.path, node.index);
        } else {
          walk(node.children);
        }
      }
    };
    walk(tree);

    expect(flat.get('src/a.ts')).toBe(0);
    expect(flat.get('docs/b.md')).toBe(1);
  });

  it('переживает пути с кириллицей и пробелами', () => {
    const tree = buildFileTree(['документы/мой файл.md']);

    expect(outline(tree)).toEqual([{ документы: ['мой файл.md'] }]);
  });

  it('на пустом списке отдаёт пустое дерево', () => {
    expect(buildFileTree([])).toEqual([]);
  });
});

describe('flattenFileTree', () => {
  it('перечисляет файлы так, как они видны сверху вниз', () => {
    const tree = buildFileTree(['README.md', 'src/b.ts', 'src/a.ts', 'docs/guide.md']);

    expect(flattenFileTree(tree).map((node) => node.path)).toEqual([
      'docs/guide.md',
      'src/a.ts',
      'src/b.ts',
      'README.md',
    ]);
  });

  it('оставляет при файле индекс исходного пути', () => {
    const tree = buildFileTree(['src/z.ts', 'a.txt']);

    expect(flattenFileTree(tree).map((node) => node.index)).toEqual([0, 1]);
  });

  it('на пустом дереве отдаёт пустой список', () => {
    expect(flattenFileTree([])).toEqual([]);
  });
});
