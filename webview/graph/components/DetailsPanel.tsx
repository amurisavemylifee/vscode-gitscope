import { useEffect, useRef, useState } from 'react';
import type { GraphEntity, GraphNode } from '@shared/graph/model';
import { formatAbsoluteTime, formatRelativeTime } from '@shared/time';
import { EmptyState } from '../../components/EmptyState';
import { Icon, type IconName } from '../../components/Icon';
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
        <EmptyState
          title="Ничего не выбрано"
          description="Выберите коммит, ветку, тег или стеш — здесь появятся подробности. По графу можно ходить стрелками ↑ и ↓."
        />
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
          <Header icon="commit" tone="commit" title={commit.parents.length > 1 ? 'Merge-коммит' : 'Коммит'} />
          <Subject text={commit.subject} />
          <dl className="gs-details__meta">
            <ShaField label="SHA" sha={commit.sha} />
            <Field label="Автор" value={commit.authorName} />
            <DateField value={commit.authoredAt} />
          </dl>
          {commit.parents.length > 0 ? (
            <Section title={commit.parents.length === 1 ? 'Родитель' : 'Родители'}>
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
            </Section>
          ) : (
            <p className="gs-details__note">Корневой коммит — родителей нет.</p>
          )}
        </>
      );
    }

    case 'branch': {
      const { ref } = entity;
      const remote = ref.kind === 'remote';
      return (
        <>
          <Header
            icon={remote ? 'remote' : 'branch'}
            tone={ref.isCurrent ? 'current' : remote ? 'remote' : 'branch'}
            title={ref.isCurrent ? 'Текущая ветка' : remote ? 'Ветка с сервера' : 'Локальная ветка'}
          />
          <Subject text={ref.name} />
          <dl className="gs-details__meta">
            {ref.subject !== undefined ? <Field label="Последний коммит" value={ref.subject} /> : null}
            {ref.authorName !== undefined ? <Field label="Автор" value={ref.authorName} /> : null}
            {ref.authoredAt !== undefined ? <DateField value={ref.authoredAt} /> : null}
            <ShaField label="Указывает на" sha={ref.sha} onJumpToSha={onJumpToSha} />
          </dl>
        </>
      );
    }

    case 'tag': {
      const { ref } = entity;
      return (
        <>
          <Header icon="tag" tone="tag" title="Тег" />
          <Subject text={ref.name} />
          <dl className="gs-details__meta">
            {ref.subject !== undefined ? <Field label="Сообщение" value={ref.subject} /> : null}
            {ref.authorName !== undefined ? <Field label="Автор" value={ref.authorName} /> : null}
            {ref.authoredAt !== undefined ? <DateField value={ref.authoredAt} /> : null}
            <ShaField label="Указывает на" sha={ref.sha} onJumpToSha={onJumpToSha} />
          </dl>
          {ref.subject === undefined ? <p className="gs-details__note">Лёгкий тег — без сообщения.</p> : null}
        </>
      );
    }

    case 'stash': {
      const { stash } = entity;
      return (
        <>
          <Header icon="stash" tone="stash" title="Стеш" />
          <Subject text={stash.message} />
          <dl className="gs-details__meta">
            <Field label="Ссылка" value={stash.ref} mono />
            <Field label="Автор" value={stash.authorName} />
            <DateField value={stash.authoredAt} />
            {stash.baseSha !== undefined ? (
              <ShaField label="Сделан поверх" sha={stash.baseSha} onJumpToSha={onJumpToSha} />
            ) : null}
          </dl>
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

function Header({ icon, tone, title }: { readonly icon: IconName; readonly tone: string; readonly title: string }) {
  return (
    <div className={`gs-details__head gs-details__head--${tone}`}>
      <Icon name={icon} size={13} />
      <span>{title}</span>
    </div>
  );
}

function Subject({ text }: { readonly text: string }) {
  return <p className="gs-details__subject">{text}</p>;
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <section className="gs-details__section">
      <h3 className="gs-details__section-title">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value, mono = false }: { readonly label: string; readonly value: string; readonly mono?: boolean }) {
  return (
    <>
      <dt className="gs-details__label">{label}</dt>
      <dd className={`gs-details__value${mono ? ' gs-details__value--mono' : ''}`}>{value}</dd>
    </>
  );
}

function DateField({ value }: { readonly value: string }) {
  return (
    <>
      <dt className="gs-details__label">Дата</dt>
      <dd className="gs-details__value">
        {formatRelativeTime(value)}
        <span className="gs-details__value-note">{formatAbsoluteTime(value)}</span>
      </dd>
    </>
  );
}

/** SHA с кнопкой копирования — самое частое действие над коммитом. */
function ShaField({
  label,
  sha,
  onJumpToSha,
}: {
  readonly label: string;
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

  return (
    <>
      <dt className="gs-details__label">{label}</dt>
      <dd className="gs-details__value gs-details__sha-row">
        {onJumpToSha ? (
          <button type="button" className="gs-details__sha-link" title="Показать этот коммит" onClick={() => onJumpToSha(sha)}>
            {sha}
          </button>
        ) : (
          <span className="gs-details__value--mono">{sha}</span>
        )}
        <button
          type="button"
          className="gs-details__copy"
          title="Скопировать SHA"
          aria-label={copied ? 'SHA скопирован' : 'Скопировать SHA'}
          onClick={copy}
        >
          {copied ? 'скопировано' : 'копировать'}
        </button>
      </dd>
    </>
  );
}
