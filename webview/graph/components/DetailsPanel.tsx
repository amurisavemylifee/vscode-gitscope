import { useEffect, useRef, useState } from 'react';
import type { GraphEntity, GraphNode } from '@shared/graph/model';
import { formatAbsoluteTime, formatRelativeTime } from '@shared/time';
import { Icon, type IconName } from '../../components/Icon';
import { Avatar } from './Avatar';
import { badgeAppearance, RefBadge, type BadgeEntity } from './RefBadge';
import './DetailsPanel.css';

interface DetailsPanelProps {
  readonly entity: GraphEntity | null;
  /** Узел коммита, к которому относится выбранная сущность, если он есть в графе. */
  readonly node: GraphNode | null;
  readonly width: number;
  readonly onJumpToSha: (sha: string) => void;
  readonly onSelect: (entity: GraphEntity) => void;
}

/** Боковая панель: подробности той сущности графа, по которой кликнули. */
export function DetailsPanel({ entity, node, width, onJumpToSha, onSelect }: DetailsPanelProps) {
  return (
    <aside className="gs-details" style={{ width: `${width}px` }} aria-label="Подробности">
      {entity ? (
        <>
          {renderEntity(entity, onJumpToSha)}
          <Decorations entity={entity} node={node} onSelect={onSelect} />
        </>
      ) : (
        <div className="gs-details__placeholder">
          <Icon name="commit" size={22} />
          <p className="gs-details__placeholder-title">Ничего не выбрано</p>
          <p className="gs-details__placeholder-text">
            Выберите коммит, ветку, тег или стеш — здесь появятся подробности.
          </p>
          <p className="gs-details__placeholder-hint">
            По графу можно ходить клавишами <kbd>↑</kbd> <kbd>↓</kbd>
          </p>
        </div>
      )}
    </aside>
  );
}

function renderEntity(entity: GraphEntity, onJumpToSha: (sha: string) => void) {
  switch (entity.kind) {
    case 'commit': {
      const { commit } = entity;
      return (
        <>
          <Kind icon="commit" tone="commit" label={commit.parents.length > 1 ? 'Merge-коммит' : 'Коммит'} />
          <h2 className="gs-details__subject">{commit.subject}</h2>

          <div className="gs-details__person">
            <Avatar name={commit.authorName} size={34} />
            <div className="gs-details__person-text">
              <span className="gs-details__person-name">{commit.authorName}</span>
              <span className="gs-details__person-when" title={formatAbsoluteTime(commit.authoredAt)}>
                {formatRelativeTime(commit.authoredAt)} · {formatAbsoluteTime(commit.authoredAt)}
              </span>
            </div>
          </div>

          <ShaSection title="Идентификатор" sha={commit.sha} />

          <Section title={commit.parents.length === 1 ? 'Родитель' : 'Родители'}>
            {commit.parents.length > 0 ? (
              <div className="gs-details__chips">
                {commit.parents.map((sha) => (
                  <button
                    key={sha}
                    type="button"
                    className="gs-details__chip"
                    title="Показать этот коммит"
                    onClick={() => onJumpToSha(sha)}
                  >
                    <Icon name="commit" size={11} />
                    {sha.slice(0, 8)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="gs-details__note">Корневой коммит — родителей нет.</p>
            )}
          </Section>
        </>
      );
    }

    case 'branch': {
      const { ref } = entity;
      const remote = ref.kind === 'remote';
      return (
        <>
          <Kind
            icon={remote ? 'remote' : 'branch'}
            tone={ref.isCurrent ? 'current' : remote ? 'remote' : 'branch'}
            label={ref.isCurrent ? 'Текущая ветка' : remote ? 'Ветка с сервера' : 'Локальная ветка'}
          />
          <h2 className="gs-details__subject gs-details__subject--mono">{ref.name}</h2>

          {ref.authorName !== undefined ? (
            <div className="gs-details__person">
              <Avatar name={ref.authorName} size={34} />
              <div className="gs-details__person-text">
                <span className="gs-details__person-name">{ref.authorName}</span>
                {ref.authoredAt !== undefined ? (
                  <span className="gs-details__person-when">{formatRelativeTime(ref.authoredAt)}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {ref.subject !== undefined ? (
            <Section title="Последний коммит">
              <p className="gs-details__text">{ref.subject}</p>
            </Section>
          ) : null}

          <ShaSection title="Указывает на" sha={ref.sha} onJumpToSha={onJumpToSha} />
        </>
      );
    }

    case 'tag': {
      const { ref } = entity;
      return (
        <>
          <Kind icon="tag" tone="tag" label="Тег" />
          <h2 className="gs-details__subject gs-details__subject--mono">{ref.name}</h2>

          {ref.authorName !== undefined ? (
            <div className="gs-details__person">
              <Avatar name={ref.authorName} size={34} />
              <div className="gs-details__person-text">
                <span className="gs-details__person-name">{ref.authorName}</span>
                {ref.authoredAt !== undefined ? (
                  <span className="gs-details__person-when">{formatRelativeTime(ref.authoredAt)}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <Section title="Сообщение">
            {ref.subject !== undefined ? (
              <p className="gs-details__text">{ref.subject}</p>
            ) : (
              <p className="gs-details__note">Лёгкий тег — без сообщения.</p>
            )}
          </Section>

          <ShaSection title="Указывает на" sha={ref.sha} onJumpToSha={onJumpToSha} />
        </>
      );
    }

    case 'stash': {
      const { stash } = entity;
      return (
        <>
          <Kind icon="stash" tone="stash" label="Стеш" />
          <h2 className="gs-details__subject">{stash.message}</h2>

          <div className="gs-details__person">
            <Avatar name={stash.authorName} size={34} />
            <div className="gs-details__person-text">
              <span className="gs-details__person-name">{stash.authorName}</span>
              <span className="gs-details__person-when" title={formatAbsoluteTime(stash.authoredAt)}>
                {formatRelativeTime(stash.authoredAt)}
              </span>
            </div>
          </div>

          <Section title="Ссылка">
            <p className="gs-details__text gs-details__text--mono">{stash.ref}</p>
          </Section>

          {stash.baseSha !== undefined ? (
            <ShaSection title="Сделан поверх" sha={stash.baseSha} onJumpToSha={onJumpToSha} />
          ) : null}
        </>
      );
    }
  }
}

/** Ветки и теги, стоящие на том же коммите — видно, чем этот коммит примечателен. */
function Decorations({
  entity,
  node,
  onSelect,
}: {
  readonly entity: GraphEntity;
  readonly node: GraphNode | null;
  readonly onSelect: (entity: GraphEntity) => void;
}) {
  if (!node) {
    return null;
  }

  const badges: BadgeEntity[] = [
    ...node.branches.map((ref): BadgeEntity => ({ kind: 'branch', ref })),
    ...node.tags.map((ref): BadgeEntity => ({ kind: 'tag', ref })),
    ...node.stashes.map((stash): BadgeEntity => ({ kind: 'stash', stash })),
  ].filter((badge) => !isSameEntity(badge, entity));

  if (badges.length === 0) {
    return null;
  }

  return (
    <Section title="На этом коммите">
      <div className="gs-details__chips">
        {badges.map((badge) => {
          const { icon, tone } = badgeAppearance(badge);
          const label = badge.kind === 'stash' ? badge.stash.ref : badge.ref.name;
          return (
            <RefBadge
              key={`${badge.kind}:${label}`}
              icon={icon}
              tone={tone}
              label={label}
              onClick={() => onSelect(badge)}
            />
          );
        })}
      </div>
    </Section>
  );
}

/** Сама выбранная сущность в списке «на этом коммите» не дублируется. */
function isSameEntity(badge: BadgeEntity, entity: GraphEntity): boolean {
  if (badge.kind === 'stash') {
    return entity.kind === 'stash' && badge.stash.ref === entity.stash.ref;
  }
  return badge.kind === entity.kind && (entity.kind === 'branch' || entity.kind === 'tag')
    ? badge.ref.name === entity.ref.name
    : false;
}

function Kind({ icon, tone, label }: { readonly icon: IconName; readonly tone: string; readonly label: string }) {
  return (
    <div className={`gs-details__kind gs-details__kind--${tone}`}>
      <Icon name={icon} size={12} />
      <span>{label}</span>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  readonly title: string;
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="gs-details__section">
      <div className="gs-details__section-head">
        <h3 className="gs-details__section-title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * SHA целиком плюс копирование — самое частое действие над коммитом.
 *
 * Кнопка копирования вынесена в заголовок секции, а не поставлена рядом со
 * значением: сорок символов хеша занимают всю ширину панели, и кнопка сбоку
 * ломала бы их на неровные строки.
 */
function ShaSection({
  title,
  sha,
  onJumpToSha,
}: {
  readonly title: string;
  readonly sha: string;
  readonly onJumpToSha?: (sha: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sha);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Буфер обмена недоступен — SHA всё равно виден и его можно выделить мышью.
    }
  };

  const copyButton = (
    <button
      type="button"
      className={`gs-details__copy${copied ? ' gs-details__copy--done' : ''}`}
      title="Скопировать SHA"
      aria-label={copied ? 'SHA скопирован' : 'Скопировать SHA'}
      onClick={copy}
    >
      <Icon name={copied ? 'check' : 'copy'} size={11} />
      {copied ? 'Скопировано' : 'Копировать'}
    </button>
  );

  return (
    <Section title={title} action={copyButton}>
      <div className="gs-details__sha">
        {onJumpToSha ? (
          <button
            type="button"
            className="gs-details__sha-value gs-details__sha-value--link"
            title="Показать этот коммит"
            onClick={() => onJumpToSha(sha)}
          >
            {sha}
          </button>
        ) : (
          <span className="gs-details__sha-value">{sha}</span>
        )}
      </div>
    </Section>
  );
}
