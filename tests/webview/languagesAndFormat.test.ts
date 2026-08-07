import { describe, expect, it } from 'vitest';
import { formatBytes } from '../../webview/format';
import { languageForPath, languageLoader } from '../../webview/syntax/languages';

describe('languageForPath', () => {
  it('определяет язык по расширению', () => {
    expect(languageForPath('src/api/client.ts')).toBe('typescript');
    expect(languageForPath('webview/App.tsx')).toBe('tsx');
    expect(languageForPath('styles/theme.scss')).toBe('scss');
  });

  it('узнаёт файлы, у которых расширения нет', () => {
    expect(languageForPath('Dockerfile')).toBe('docker');
    expect(languageForPath('deploy/Makefile')).toBe('make');
    expect(languageForPath('.gitignore')).toBe('ini');
  });

  it('не зависит от регистра', () => {
    expect(languageForPath('README.MD')).toBe('markdown');
  });

  it('честно отказывается от незнакомого расширения', () => {
    expect(languageForPath('assets/logo.png')).toBeUndefined();
    expect(languageForPath('LICENSE')).toBeUndefined();
  });

  it('смотрит на последнее расширение составного имени', () => {
    expect(languageForPath('vite.config.mts')).toBe('typescript');
  });

  it('для каждого определяемого языка есть загрузчик грамматики', () => {
    const paths = ['a.ts', 'a.tsx', 'a.py', 'a.go', 'a.rs', 'Dockerfile', 'Makefile', 'a.yml', 'a.sql'];

    for (const path of paths) {
      const language = languageForPath(path);
      expect(language, path).toBeDefined();
      expect(languageLoader(language as string), path).toBeTypeOf('function');
    }
  });
});

describe('formatBytes', () => {
  it('показывает байты, килобайты и мегабайты', () => {
    expect(formatBytes(512)).toBe('512 Б');
    expect(formatBytes(2048)).toBe('2.0 КБ');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 МБ');
  });

  it('отсутствие файла на стороне называет своими словами', () => {
    expect(formatBytes(undefined)).toBe('нет файла');
  });
});
