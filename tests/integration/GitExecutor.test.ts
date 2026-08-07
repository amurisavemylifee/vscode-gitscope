import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GitExecutor } from '@core/git/GitExecutor';
import { GitError } from '@core/git/errors';
import { TestRepo } from '../fixtures/testRepo';

describe('GitExecutor', () => {
  let repo: TestRepo;
  const git = new GitExecutor();

  beforeAll(() => {
    repo = TestRepo.create();
    repo.write('a.txt', 'содержимое\n');
    repo.commit('первый коммит');
  });

  afterAll(() => repo.dispose());

  it('возвращает вывод успешной команды', async () => {
    await expect(git.line(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo.root })).resolves.toBe('main');
  });

  it('поднимает GitError с текстом stderr при ненулевом коде', async () => {
    const failure = git.text(['cat-file', '-p', 'несуществующий-объект'], { cwd: repo.root });

    await expect(failure).rejects.toBeInstanceOf(GitError);
    await expect(failure).rejects.toMatchObject({ exitCode: expect.any(Number) });
  });

  it('сообщает, если бинарь git не найден', async () => {
    const missing = new GitExecutor('/несуществующий/путь/git');

    await expect(missing.text(['status'], { cwd: repo.root })).rejects.toBeInstanceOf(GitError);
  });

  it('обрезает вывод по maxBytes и помечает результат', async () => {
    repo.write('big.txt', 'x'.repeat(50_000));
    repo.commit('большой файл');

    const result = await git.run(['show', 'HEAD:big.txt'], { cwd: repo.root, maxBytes: 512 });

    expect(result.truncated).toBe(true);
    expect(result.stdout.length).toBeLessThanOrEqual(512);
  });

  it('прерывает выполнение по сигналу отмены', async () => {
    const controller = new AbortController();
    const pending = git.text(['log', '--all'], { cwd: repo.root, signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toThrow();
  });

  it('не экранирует не-ASCII в путях', async () => {
    repo.write('документы/файл.txt', 'текст\n');
    repo.commit('файл с кириллицей');

    const output = await git.text(['show', '--name-only', '--format=', 'HEAD'], { cwd: repo.root });

    expect(output).toContain('документы/файл.txt');
  });
});
