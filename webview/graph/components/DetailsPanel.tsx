import type { GraphEntity } from '@shared/graph/model';
import { formatRelativeTime } from '@shared/time';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import './DetailsPanel.css';

interface DetailsPanelProps {
  readonly entity: GraphEntity | null;
  readonly width: number;
  readonly onJumpToSha: (sha: string) => void;
}

/** Боковая панель: подробности той сущности графа, по которой кликнули. */
export function DetailsPanel({ entity, width, onJumpToSha }: DetailsPanelProps) {
  if (!entity) {
    return (
      <aside className="gs-details" style={{ width: `${width}px` }}>
        <EmptyState
          title="Ничего не выбрано"
          description="Кликните по коммиту, ветке, тегу или стешу — здесь появятся подробности."
        />
      </aside>
    );
  }

  return (
    <aside className="gs-details" style={{ width: `${width}px` }}>
      {renderEntity(entity, onJumpToSha)}
    </aside>
  );
}

function renderEntity(entity: GraphEntity, onJumpToSha: (sha: string) => void) {
  switch (entity.kind) {
    case 'commit': {
      const { commit } = entity;
      return (
        <>
          <Header icon="commit" title="Коммит" />
          <Subject text={commit.subject} />
          <Field label="SHA" value={commit.sha} mono />
          <Field label="Автор" value={commit.authorName} />
          <DateField value={commit.authoredAt} />
          {commit.parents.length > 0 ? (
            <div className="gs-details__field">
              <span className="gs-details__label">
                {commit.parents.length === 1 ? 'Родитель' : 'Родители'}
              </span>
              <div className="gs-details__shas">
                {commit.parents.map((sha) => (
                  <ShaButton key={sha} sha={sha} onClick={() => onJumpToSha(sha)} />
                ))}
              </div>
            </div>
          ) : (
            <p className="gs-details__note">Корневой коммит — родителей нет.</p>
          )}
        </>
      );
    }

    case 'branch': {
      const { ref } = entity;
      const kindLabel = ref.kind === 'remote' ? 'удалённая ветка' : 'локальная ветка';
      return (
        <>
          <Header icon={ref.kind === 'remote' ? 'remote' : 'branch'} title={ref.isCurrent ? 'Текущая ветка' : 'Ветка'} />
          <Subject text={ref.name} />
          <Field label="Тип" value={kindLabel} />
          {ref.subject !== undefined ? <Field label="Тема коммита" value={ref.subject} /> : null}
          {ref.authorName !== undefined ? <Field label="Автор" value={ref.authorName} /> : null}
          {ref.authoredAt !== undefined ? <DateField value={ref.authoredAt} /> : null}
          <div className="gs-details__field">
            <span className="gs-details__label">Указывает на</span>
            <div className="gs-details__shas">
              <ShaButton sha={ref.sha} onClick={() => onJumpToSha(ref.sha)} />
            </div>
          </div>
        </>
      );
    }

    case 'tag': {
      const { ref } = entity;
      return (
        <>
          <Header icon="tag" title="Тег" />
          <Subject text={ref.name} />
          {ref.subject !== undefined ? (
            <Field label="Сообщение" value={ref.subject} />
          ) : (
            <p className="gs-details__note">Лёгкий тег — без сообщения.</p>
          )}
          {ref.authorName !== undefined ? <Field label="Автор" value={ref.authorName} /> : null}
          {ref.authoredAt !== undefined ? <DateField value={ref.authoredAt} /> : null}
          <div className="gs-details__field">
            <span className="gs-details__label">Указывает на</span>
            <div className="gs-details__shas">
              <ShaButton sha={ref.sha} onClick={() => onJumpToSha(ref.sha)} />
            </div>
          </div>
        </>
      );
    }

    case 'stash': {
      const { stash } = entity;
      return (
        <>
          <Header icon="stash" title="Стеш" />
          <Subject text={stash.message} />
          <Field label="Ссылка" value={stash.ref} mono />
          <Field label="Автор" value={stash.authorName} />
          <DateField value={stash.authoredAt} />
          {stash.baseSha !== undefined ? (
            <div className="gs-details__field">
              <span className="gs-details__label">Сделан поверх</span>
              <div className="gs-details__shas">
                <ShaButton sha={stash.baseSha} onClick={() => onJumpToSha(stash.baseSha as string)} />
              </div>
            </div>
          ) : null}
        </>
      );
    }
  }
}

function Header({ icon, title }: { readonly icon: Parameters<typeof Icon>[0]['name']; readonly title: string }) {
  return (
    <div className="gs-details__header">
      <Icon name={icon} size={14} />
      <span>{title}</span>
    </div>
  );
}

function Subject({ text }: { readonly text: string }) {
  return <p className="gs-details__subject">{text}</p>;
}

function Field({ label, value, mono = false }: { readonly label: string; readonly value: string; readonly mono?: boolean }) {
  return (
    <div className="gs-details__field">
      <span className="gs-details__label">{label}</span>
      <span className={mono ? 'gs-details__value gs-details__value--mono' : 'gs-details__value'}>{value}</span>
    </div>
  );
}

function DateField({ value }: { readonly value: string }) {
  const absolute = new Date(value).toLocaleString();
  return (
    <div className="gs-details__field">
      <span className="gs-details__label">Дата</span>
      <span className="gs-details__value" title={absolute}>
        {formatRelativeTime(value)}
      </span>
    </div>
  );
}

function ShaButton({ sha, onClick }: { readonly sha: string; readonly onClick: () => void }) {
  return (
    <button type="button" className="gs-details__sha-button" onClick={onClick}>
      {sha.slice(0, 12)}
    </button>
  );
}
