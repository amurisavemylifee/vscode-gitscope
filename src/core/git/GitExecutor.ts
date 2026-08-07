import { spawn } from 'node:child_process';
import { silentLogger, type Logger } from '@shared/logger';
import { GitError } from './errors';

export interface GitRunOptions {
  /** Рабочий каталог — корень репозитория. */
  readonly cwd: string;
  readonly signal?: AbortSignal;
  /**
   * Предел на размер stdout в байтах. По достижении процесс убивается, а
   * результат помечается как `truncated` — так огромный патч не съедает память
   * extension host, и UI может честно сказать, что показал не всё.
   */
  readonly maxBytes?: number;
}

export interface GitRunResult {
  readonly stdout: Buffer;
  /** Вывод обрезан по `maxBytes`. */
  readonly truncated: boolean;
}

/** Сколько stderr тащить в сообщение об ошибке. */
const STDERR_LIMIT = 8 * 1024;

/**
 * Тонкая обёртка над запуском `git`.
 *
 * Единственное место в проекте, которое порождает процессы. Ничего не знает ни
 * про VS Code, ни про модель сравнения — поэтому целиком тестируется в Node.
 */
export class GitExecutor {
  constructor(
    private readonly gitPath: string = 'git',
    private readonly logger: Logger = silentLogger,
  ) {}

  /** Запускает git и возвращает сырой stdout. */
  async run(args: readonly string[], options: GitRunOptions): Promise<GitRunResult> {
    const fullArgs = [
      // Пути должны приходить как есть: без этого git экранирует не-ASCII
      // в восьмеричные последовательности, и кириллические имена ломаются.
      '-c',
      'core.quotepath=false',
      '-c',
      'color.ui=false',
      '--no-pager',
      ...args,
    ];

    this.logger.debug(`git ${fullArgs.join(' ')}`);

    return new Promise<GitRunResult>((resolve, reject) => {
      const child = spawn(this.gitPath, fullArgs, {
        cwd: options.cwd,
        env: {
          ...process.env,
          // Читающие команды не должны трогать индекс: иначе они конкурируют
          // за .git/index.lock с тем, что пользователь делает в терминале.
          GIT_OPTIONAL_LOCKS: '0',
        },
        windowsHide: true,
        ...(options.signal ? { signal: options.signal } : {}),
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let truncated = false;
      let settled = false;

      child.stdout.on('data', (chunk: Buffer) => {
        if (truncated) {
          return;
        }
        if (options.maxBytes !== undefined && stdoutBytes + chunk.length > options.maxBytes) {
          const remaining = options.maxBytes - stdoutBytes;
          if (remaining > 0) {
            stdoutChunks.push(chunk.subarray(0, remaining));
            stdoutBytes += remaining;
          }
          truncated = true;
          child.kill();
          return;
        }
        stdoutChunks.push(chunk);
        stdoutBytes += chunk.length;
      });

      child.stderr.on('data', (chunk: Buffer) => {
        if (stderrBytes < STDERR_LIMIT) {
          stderrChunks.push(chunk);
          stderrBytes += chunk.length;
        }
      });

      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error.name === 'AbortError') {
          reject(error);
          return;
        }
        reject(
          new GitError(`Не удалось запустить git: ${error.message}`, {
            exitCode: null,
            stderr: error.message,
            args: fullArgs,
          }),
        );
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        // Убитый по maxBytes процесс отдаёт ненулевой код — это ожидаемо.
        if (code === 0 || truncated) {
          resolve({ stdout: Buffer.concat(stdoutChunks), truncated });
          return;
        }
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(
          new GitError(stderr.split('\n')[0] ?? `git завершился с кодом ${code}`, {
            exitCode: code,
            stderr,
            args: fullArgs,
          }),
        );
      });
    });
  }

  /** То же, но с декодированием в UTF-8 — формат вывода git всегда UTF-8. */
  async text(args: readonly string[], options: GitRunOptions): Promise<string> {
    const { stdout } = await this.run(args, options);
    return stdout.toString('utf8');
  }

  /** Однострочный ответ без завершающего перевода строки. */
  async line(args: readonly string[], options: GitRunOptions): Promise<string> {
    return (await this.text(args, options)).trim();
  }
}
