/** Ошибка запуска git: ненулевой код возврата или невозможность запустить бинарь. */
export class GitError extends Error {
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly args: readonly string[];
  /** Полный текст stderr — уходит в подсказку под сообщением об ошибке в UI. */
  readonly detail: string;

  constructor(message: string, options: { exitCode: number | null; stderr: string; args: readonly string[] }) {
    super(message);
    this.name = 'GitError';
    this.exitCode = options.exitCode;
    this.stderr = options.stderr;
    this.args = options.args;
    this.detail = options.stderr;
  }
}

/** Ревизия не разрешилась в коммит: опечатка, удалённая ветка, протухший remote-ref. */
export class RevisionNotFoundError extends Error {
  readonly spec: string;
  readonly detail: string;

  constructor(spec: string) {
    super(`Ревизия «${spec}» не найдена в этом репозитории`);
    this.name = 'RevisionNotFoundError';
    this.spec = spec;
    this.detail =
      'Проверьте написание. Для веток с сервера может потребоваться git fetch — ' +
      'локальная копия удалённых ссылок могла устареть.';
  }
}

/** Ошибка разбора вывода git — сигнал, что формат не тот, который мы ожидали. */
export class GitParseError extends Error {
  readonly detail: string;

  constructor(message: string, detail = '') {
    super(message);
    this.name = 'GitParseError';
    this.detail = detail;
  }
}
