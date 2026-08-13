# GitScope

[English](#english) | [Русский](#русский)

---

## English

VS Code extension for reading git changes. Two features:

- **compare the state of the code** at any two points of history — like the “Files changed”
  tab of a pull request;
- **file history** — every version of the open file on the left, the selected one on the right.

> The panel interface is currently in Russian; command titles, setting descriptions and the
> marketplace listing follow the VS Code display language.

### Compare revisions

#### What exactly is shown

The comparison runs as `git diff <base> <compare>` — two-dot, tree against tree. That differs
from what GitHub shows in a PR (three-dot, from the point where the branches diverged):
GitScope honestly shows **all** the difference between two snapshots of the code. If something
landed in the base branch after the fork and is absent in the compared one, the file shows up
as deleted — because in that state of the code it really is gone.

#### How to use

Command palette → **GitScope: Compare Revisions…**

Then two pickers: the base revision and the compared one. Each accepts a branch (including
remote ones), a tag, a commit from the log, or anything `git rev-parse` understands — a raw
SHA, `HEAD~3`, `origin/main@{yesterday}`. The same pickers live in the panel header, so the
points of comparison can be changed without closing it.

The command also takes arguments — from a keybinding, a task or another extension:

```jsonc
{ "command": "gitscope.compareRevisions", "args": { "base": "origin/main", "compare": "HEAD" } }
```

#### In the panel

- on the left, a tree of changed files with statuses and line counters; a click scrolls to the file;
- on the right, every diff in one continuous scroll, with syntax highlighting;
- unified and split layouts, switched in the header;
- changed fragments are highlighted inside the line, not the whole line;
- long lines wrap and take several rows, keeping the number on the first one;
- collapsed lines between changes expand on a button;
- files fold one by one or all at once, from the header;
- the header shows when refs were last fetched and offers a fetch button: comparing against
  `origin/*` lies if the last fetch was a week ago.

### File history

Right click in the editor or in the explorer → **GitScope: File History…**, or the command
palette for the open file.

On the left, version cards from newest to oldest: commit subject, author, relative and exact
date, short SHA, branches and tags on that commit, counters of changed lines. If the file on
disk differs from HEAD, the first card is the **working copy**. The list walks with arrows,
Home/End and PageUp/PageDown.

On the right, the selected version. A switch in the header decides what to show:

- **File** — the whole content, with syntax highlighting and line numbers;
- **Changes** — what exactly this commit did to the file, in one or two columns.

Next to it: copying the SHA and opening the version as a separate editor tab (Enter). The tab
is read-only and is named `App@a1b2c3d.tsx` — history cannot be edited through it.

The header carries the same revision picker as the compare panel. It defaults to the current
branch, but any other branch, tag, commit or expression like `HEAD~10` works too: then the
history is shown **from the point of view** of that revision — only the commits reachable from
it. There is no working copy card in that case: the state of the disk does not belong to the
history seen from an older point.

History follows renames and moves across folders: on the commit where the file changed its
name it does not break off, and the card shows the previous path. A “deleted, then restored”
pair does not tear the history apart either. Merges are shown alongside ordinary commits: an
edit that arrived in a branch as conflict resolution lives exactly in the merge commit.
Versions load page by page as the list scrolls.

### Settings

| Setting | Default | What it does |
|---|---|---|
| `gitscope.diff.contextLines` | 3 | How many context lines around changes (in both panels) |
| `gitscope.diff.collapseFilesOverLines` | 1500 | Threshold after which a file starts collapsed. 0 — never collapse |
| `gitscope.diff.defaultViewMode` | `unified` | Layout a panel opens with (in both panels) |

### Not there yet

In revision comparison — the working tree, the index and stashes (commits, branches and tags
only). Everywhere: “viewed” marks, comments, stepping inside submodules, viewing images
(binary files are shown as sizes), a visual commit graph, search across a file's history, and
comparing two arbitrary versions of a file with each other.

### Development

```bash
pnpm install
pnpm build          # one-off build of the extension host + webview
pnpm typecheck      # tsc over both projects
pnpm lint
pnpm test           # logic (Node) + components (jsdom)
pnpm test:coverage  # 80% threshold for lines, branches, functions and statements
pnpm test:e2e       # in a real VS Code; on a headless machine under `xvfb-run -a`
pnpm package        # .vsix
```

Debugging: open the folder in VS Code and press **F5** — an Extension Development Host starts
and both builds go into watch mode.

### How it is built

The layers are arranged so that future git features reuse the bottom two:

| Layer | Depends on | Purpose |
|---|---|---|
| `src/shared/` | nothing | Data model, webview ⇄ host protocol, typed RPC, pure diff algorithms. Isomorphic: runs both in Node and in the browser |
| `src/core/` | Node | Running `git` and parsing its output. Knows nothing about `vscode`, tested with plain Vitest |
| `src/services/` | `core` + `vscode` | Workspace repositories, revisions, comparisons, settings |
| `src/features/` | everything above | Commands, pickers, webview panels |
| `webview/` | `src/shared/` | React apps of the panels: `webview/` — comparison, `webview/history/` — file history |

A few decisions worth knowing up front:

- **git runs as a process**, not through the built-in extension's API: that one has no diff for
  an arbitrary pair of revisions. `vscode.git` is used only to find repositories and the path to
  the binary.
- **Loading is two-phase**: the list of files is computed at once, patches are pulled one by one
  as a file approaches the screen.
- **Rows are virtualized** — both in comparison and in history there can be tens of thousands.
- **Wrapping is computed, not measured**: the virtualizer needs row heights before rendering, so
  the number of visual rows is derived from the column count the canvas hands to CSS. That only
  works because the wrap is hard (`word-break: break-all`).
- **Renames are tracked by our own code, not `git log --follow`.** The flag does exactly one of
  two things: either it follows the history through renames, or it shows merges — merge commits
  it drops silently. Instead the page is collected in chunks: when a chunk breaks off at the
  commit where the file “appeared”, that commit is re-read in full (`git diff` without a path
  filter), and if it turns out to be a rename, the walk continues under the previous name. With
  a path filter git does not show such a pair — a rename looks like an addition.
- **History pages by cursor**, not by `--skip`: `--skip` skips commits without parsing them, and
  a file moving across the skip boundary would be lost. The next page is taken from the parent of
  the last shown commit.
- **The file name is resolved at the chosen revision, in both directions.** The panel is opened on
  a working copy file, while history can be read from any point where the file might have had a
  different name. If the revision is newer than the rename, the name is followed forward — to
  whatever the file moved into; if older, backward — to what it was called back then; and if two
  branches renamed the file differently, both directions add up: back to the common name and
  forward from it along the chosen branch. Without this the history would either break off at the
  rename or not be found at all.
- **Webview styles are bundled into one file** (`cssCodeSplit: false`): when split by entry, shared
  rules move into a chunk there is no way to reference — the panel HTML is assembled by hand.
- **Highlighting is Shiki on the JavaScript engine**, without WebAssembly: WASM would require
  weakening the panel's CSP.

---

## Русский

Расширение VS Code для обзора изменений в git. Две функции:

- **сравнение состояний кода** в любых двух точках истории — как вкладка
  «Files changed» у pull request;
- **история файла** — все версии открытого файла слева, выбранная версия справа.

### Сравнение ревизий

#### Что именно показывается

Сравнение выполняется как `git diff <base> <compare>` — двухточечное, дерево против
дерева. Это отличается от того, что GitHub показывает в PR (там трёхточечное, от точки
расхождения веток): GitScope честно показывает **всю** разницу между двумя снимками
кода. Если после ветвления в базовую ветку что-то попало, а в сравниваемой этого нет,
файл будет показан как удалённый — потому что в этом состоянии кода его действительно
нет.

#### Как пользоваться

Палитра команд → **GitScope: Сравнить ревизии…**

Дальше два пикера: базовая ревизия и сравниваемая. В каждом можно выбрать ветку (в том
числе с сервера), тег, коммит из истории или ввести что угодно, что понимает
`git rev-parse` — сырой SHA, `HEAD~3`, `origin/main@{yesterday}`. Те же селекторы есть
в шапке панели, менять точки сравнения можно не закрывая её.

Команду можно звать и с аргументами — из сочетания клавиш, задачи или другого
расширения:

```jsonc
{ "command": "gitscope.compareRevisions", "args": { "base": "origin/main", "compare": "HEAD" } }
```

#### В панели

- слева дерево изменённых файлов со статусами и счётчиками строк, клик прокручивает к файлу;
- справа все диффы одним сплошным скроллом, с подсветкой синтаксиса;
- переключение между одной и двумя колонками в шапке;
- изменённые куски строки подсвечиваются внутри строки, а не строкой целиком;
- длинные строки переносятся и занимают несколько строк, номер остаётся у первой;
- свёрнутые строки между изменениями разворачиваются по кнопке;
- файлы сворачиваются по одному и все разом — кнопками в шапке;
- в шапке видно, когда последний раз обновлялись ссылки с сервера, и есть кнопка fetch:
  сравнение с `origin/*` врёт, если fetch был неделю назад.

### История файла

Правый клик в редакторе или в проводнике → **GitScope: История файла…**, либо
палитра команд для открытого файла.

Слева — карточки версий от свежих к старым: тема коммита, автор, относительная и
точная дата, короткий SHA, ветки и теги на этом коммите, счётчики изменённых
строк. Если файл на диске отличается от HEAD, первой карточкой идёт **рабочая
копия**. По списку можно ходить стрелками, Home/End и PageUp/PageDown.

Справа — выбранная версия. Переключатель в шапке решает, что показывать:

- **Файл** — содержимое целиком, с подсветкой синтаксиса и нумерацией строк;
- **Изменения** — что именно этот коммит сделал с файлом, в одну или две колонки.

Рядом — копирование SHA и открытие версии отдельной вкладкой редактора (Enter):
вкладка read-only, называется `App@a1b2c3d.tsx`, править историю ей нельзя.

В шапке — селектор точки истории, такой же, как в панели сравнения. По умолчанию
это текущая ветка, но можно выбрать любую другую ветку, тег, коммит или
выражение вроде `HEAD~10`: тогда история показывается **с точки зрения** этой
ревизии — только те коммиты, до которых от неё можно дойти. Карточки рабочей
копии при этом нет: состояние диска не относится к истории от старой точки.

История ведётся через переименования и переезды между папками: на коммите, где
файл сменил имя, она не обрывается, а карточка показывает прежний путь. Пара
«файл удалили — файл вернули» тоже не разрывает историю. Слияния показываются
наравне с обычными коммитами: правка, приехавшая в ветку разрешением конфликта,
живёт именно в merge-коммите. Версии подгружаются страницами по мере прокрутки.

### Настройки

| Настройка | По умолчанию | Что делает |
|---|---|---|
| `gitscope.diff.contextLines` | 3 | Сколько строк контекста вокруг изменений (в обеих панелях) |
| `gitscope.diff.collapseFilesOverLines` | 1500 | Порог, после которого файл сворачивается сам. 0 — не сворачивать |
| `gitscope.diff.defaultViewMode` | `unified` | Режим при открытии панели (в обеих панелях) |

### Чего пока нет

В сравнении ревизий — рабочего дерева, индекса и стеша (только коммиты, ветки и
теги). Везде: отметок «просмотрено», комментариев, захода внутрь подмодулей,
просмотра картинок (двоичные файлы показываются размерами), визуального графа
коммитов, поиска по истории файла и сравнения двух произвольных его версий между
собой.

### Разработка

```bash
pnpm install
pnpm build          # разовая сборка extension host + webview
pnpm typecheck      # tsc по обоим проектам
pnpm lint
pnpm test           # логика (Node) + компоненты (jsdom)
pnpm test:coverage  # порог 80% по строкам, ветвям, функциям и операторам
pnpm test:e2e       # в настоящем VS Code; на headless-машине под `xvfb-run -a`
pnpm package        # .vsix
```

Отладка: открыть папку в VS Code и нажать **F5** — поднимется Extension Development
Host, обе сборки уйдут в watch-режим.

### Устройство

Слои разложены так, чтобы будущие git-функции переиспользовали нижние два:

| Слой | Зависит от | Назначение |
|---|---|---|
| `src/shared/` | ничего | Модель данных, протокол webview ⇄ host, типизированный RPC, чистые алгоритмы diff. Изоморфный: работает и в Node, и в браузере |
| `src/core/` | Node | Запуск `git` и разбор его вывода. Про `vscode` не знает, тестируется обычным Vitest |
| `src/services/` | `core` + `vscode` | Репозитории воркспейса, ревизии, сравнения, настройки |
| `src/features/` | всё выше | Команды, пикеры, webview-панели |
| `webview/` | `src/shared/` | React-приложения панелей: `webview/` — сравнение, `webview/history/` — история файла |

Несколько решений, которые стоит знать заранее:

- **git запускается процессом**, а не через API встроенного расширения: у того нет diff
  по произвольной паре ревизий. `vscode.git` используется только чтобы найти
  репозитории и узнать путь к бинарю.
- **Загрузка двухфазная**: список файлов считается сразу, патчи подтягиваются по одному,
  когда файл подъезжает к экрану.
- **Строки виртуализированы** — и в сравнении, и в истории их бывают десятки тысяч.
- **Перенос считается, а не меряется**: виртуализатору нужны высоты до отрисовки,
  поэтому число визуальных строк выводится из числа колонок, которое канва отдаёт
  и в CSS. Это работает только потому, что перенос жёсткий (`word-break: break-all`).
- **Переименования отслеживаются своим кодом, а не `git log --follow`.** Флаг
  умеет ровно одно из двух: либо вести историю через переименования, либо
  показывать слияния — merge-коммиты он выбрасывает молча. Вместо него страница
  набирается кусками: когда кусок обрывается на коммите, где файл «появился»,
  этот коммит перечитывается целиком (`git diff` без фильтра по пути), и если он
  оказался переименованием, обход продолжается с прежним именем. С фильтром по
  пути git такую пару не показывает — переименование выглядит добавлением.
- **История листается курсором**, а не `--skip`: `--skip` пропускает коммиты, не
  разбирая их, и переезд файла на границе пропуска терялся бы. Следующая
  страница берётся от родителя последнего показанного коммита.
- **Имя файла разрешается на выбранной ревизии, в обе стороны.** Панель
  открывают на файле рабочей копии, а смотреть историю можно от любой точки, где
  файл мог лежать под другим именем. Если ревизия новее переименования, имя
  ведётся вперёд — к тому, во что файл переехал; если старше, назад — к тому,
  как он назывался тогда; а если в двух ветках файл переименовали по-разному,
  оба направления складываются: назад до общего имени и от него вперёд уже по
  выбранной ветке. Без этого история либо обрывалась на переименовании, либо не
  находилась вовсе.
- **Стили webview собираются одним файлом** (`cssCodeSplit: false`): при делении
  по входам общие правила уезжают в чанк, ссылку на который взять неоткуда —
  HTML панели собирается вручную.
- **Подсветка — Shiki на JavaScript-движке**, без WebAssembly: WASM потребовал бы
  ослабить CSP панели.
