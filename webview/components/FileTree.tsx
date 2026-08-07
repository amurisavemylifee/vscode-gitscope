import { useMemo, useState } from 'react';
import { buildFileTree, type FileTreeNode } from '@shared/fileTree';
import type { FileChange } from '@shared/model';
import { DiffStat } from './DiffStat';
import { Icon } from './Icon';
import { StatusBadge } from './StatusBadge';
import './FileTree.css';

interface FileTreeProps {
  readonly files: readonly FileChange[];
  readonly activePath: string | null;
  readonly onSelect: (path: string) => void;
}

/** Дерево изменённых файлов. Клик прокручивает правую панель к нужному файлу. */
export function FileTree({ files, activePath, onSelect }: FileTreeProps) {
  const tree = useMemo(() => buildFileTree(files.map((file) => file.path)), [files]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (path: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <nav className="gs-tree" aria-label="Изменённые файлы">
      <TreeLevel
        nodes={tree}
        depth={0}
        files={files}
        collapsed={collapsed}
        activePath={activePath}
        onToggle={toggle}
        onSelect={onSelect}
      />
    </nav>
  );
}

interface TreeLevelProps {
  readonly nodes: readonly FileTreeNode[];
  readonly depth: number;
  readonly files: readonly FileChange[];
  readonly collapsed: ReadonlySet<string>;
  readonly activePath: string | null;
  readonly onToggle: (path: string) => void;
  readonly onSelect: (path: string) => void;
}

function TreeLevel({ nodes, depth, files, collapsed, activePath, onToggle, onSelect }: TreeLevelProps) {
  return (
    <>
      {nodes.map((node) => {
        // Отступ рисуем через padding, а не вложенные контейнеры: строка
        // остаётся во всю ширину, и подсветка активного файла не рвётся.
        const indent = { paddingLeft: `${depth * 12 + 6}px` };

        if (node.kind === 'directory') {
          const isCollapsed = collapsed.has(node.path);
          return (
            <div key={node.path}>
              <button
                type="button"
                className="gs-tree__row gs-tree__row--directory"
                style={indent}
                aria-expanded={!isCollapsed}
                onClick={() => onToggle(node.path)}
              >
                <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={12} />
                <Icon name="folder" size={13} className="gs-tree__folder-icon" />
                <span className="gs-tree__name">{node.name}</span>
              </button>
              {isCollapsed ? null : (
                <TreeLevel
                  nodes={node.children}
                  depth={depth + 1}
                  files={files}
                  collapsed={collapsed}
                  activePath={activePath}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              )}
            </div>
          );
        }

        const file = files[node.index];
        if (!file) {
          return null;
        }

        return (
          <button
            key={node.path}
            type="button"
            className={`gs-tree__row gs-tree__row--file${activePath === file.path ? ' gs-tree__row--active' : ''}`}
            style={indent}
            title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}
            onClick={() => onSelect(file.path)}
          >
            <StatusBadge status={file.status} />
            <span className="gs-tree__name">{node.name}</span>
            {file.binary ? (
              <span className="gs-tree__binary">bin</span>
            ) : (
              <DiffStat insertions={file.insertions} deletions={file.deletions} compact />
            )}
          </button>
        );
      })}
    </>
  );
}
