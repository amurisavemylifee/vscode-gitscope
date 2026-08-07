/**
 * Грамматики Shiki, доступные панели.
 *
 * Загрузчики перечислены явно, а не взяты из `bundledLanguages`: тот тянет за
 * собой все двести с лишним языков, и сборка раскладывает их по отдельным
 * чанкам в `dist`, даже если ни один никогда не понадобится. Здесь ровно то,
 * что встречается в настоящих репозиториях.
 *
 * Импорты динамические — грамматика подгружается только когда в сравнении
 * действительно встретился файл на этом языке.
 */
type LanguageLoader = () => Promise<unknown>;

const LOADERS: Record<string, LanguageLoader> = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsonc: () => import('shiki/langs/jsonc.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  sass: () => import('shiki/langs/sass.mjs'),
  less: () => import('shiki/langs/less.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  svelte: () => import('shiki/langs/svelte.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  prisma: () => import('shiki/langs/prisma.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  proto: () => import('shiki/langs/proto.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  terraform: () => import('shiki/langs/terraform.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  make: () => import('shiki/langs/make.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
};

const BY_EXTENSION: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'jsonc',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  vue: 'vue',
  svelte: 'svelte',
  md: 'markdown',
  markdown: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'xml',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  ps1: 'powershell',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sql: 'sql',
  prisma: 'prisma',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'proto',
  tf: 'terraform',
  tfvars: 'terraform',
  lua: 'lua',
  ini: 'ini',
  env: 'ini',
  cfg: 'ini',
  conf: 'ini',
  diff: 'diff',
  patch: 'diff',
};

/** Файлы, у которых язык определяется именем целиком, а не расширением. */
const BY_FILENAME: Record<string, string> = {
  dockerfile: 'docker',
  makefile: 'make',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.editorconfig': 'ini',
  '.npmrc': 'ini',
};

/** Идентификатор грамматики для пути или `undefined`, если подсвечивать нечем. */
export function languageForPath(path: string): string | undefined {
  const name = (path.split('/').pop() ?? path).toLowerCase();

  const byName = BY_FILENAME[name];
  if (byName) {
    return byName;
  }

  const dot = name.lastIndexOf('.');
  if (dot < 0) {
    return undefined;
  }
  return BY_EXTENSION[name.slice(dot + 1)];
}

/** Загрузчик грамматики. `undefined` — язык вне списка поддерживаемых. */
export function languageLoader(language: string): LanguageLoader | undefined {
  return LOADERS[language];
}
