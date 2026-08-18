# Change Log

## English

### Unreleased

- **Stashes** — a read-only panel for everything put aside: the list of stashes with messages,
  branches, dates, authors and the commit each one sits on top of; the selected stash expands
  into its file tree, and its changes are shown by the same canvas as the compare panel. Files
  that were not in git and changes that were in the index are marked in the list. A file from a
  stash opens as a read-only tab, its diff with the base — as a native diff tab. Nothing can be
  created, applied or dropped from here

### 0.1.1

- Fixed: in file history the code wrapped at the narrowest width until the view mode was toggled — the wrap width was measured before the scroll area appeared in the markup

### 0.1.0

- Initial release
- **Compare revisions** — pick any two points of history (branches, tags, commits or anything `git rev-parse` understands) and read the difference as one continuous scroll: file tree with statuses and line counters, unified and split layouts, word-level diff inside changed lines, syntax highlighting, collapsible files, expandable context between hunks
- **File history** — every version of a file on the left, the selected one on the right: the whole file or just what that commit changed, navigation between changes with a ruler of the whole file, opening a version as a read-only editor tab, copying a SHA
- History follows renames and moves across folders, shows merge commits, and can be read from any revision, not just the current branch
- Long lines wrap instead of scrolling sideways, with the line number kept on the first visual row
- Settings for context lines, the auto-collapse threshold and the default layout
- Extension name, command titles and setting descriptions are localized to English and Russian

## Русский

### Не выпущено

- **Стеши** — панель только для чтения: список стешей с сообщениями, ветками, датами,
  авторами и коммитом, поверх которого каждый сделан; выбранный стеш раскрывается в дерево
  файлов, а его изменения показывает то же полотно, что и в сравнении ревизий. Файлы, которых
  не было в git, и изменения из индекса помечены в списке. Файл из стеша открывается вкладкой
  только для чтения, его сравнение с базой — нативной вкладкой diff. Создать, применить или
  удалить стеш отсюда нельзя

### 0.1.1

- Исправлено: в истории файла код переносился по наименьшей ширине, пока не переключишь режим — ширина переноса мерилась раньше, чем в разметке появлялась область прокрутки

### 0.1.0

- Первый релиз
- **Сравнение ревизий** — выбрать любые две точки истории (ветки, теги, коммиты или что угодно, что понимает `git rev-parse`) и прочитать разницу одним сплошным скроллом: дерево файлов со статусами и счётчиками строк, одна и две колонки, словный diff внутри изменённых строк, подсветка синтаксиса, сворачивание файлов, разворачивание контекста между хунками
- **История файла** — все версии файла слева, выбранная справа: файл целиком или только то, что сделал с ним этот коммит, переход между изменениями с полосой-обзором всего файла, открытие версии отдельной вкладкой редактора, копирование SHA
- История ведётся через переименования и переезды между папками, показывает слияния и читается от любой ревизии, а не только от текущей ветки
- Длинные строки переносятся, а не уезжают вбок; номер остаётся у первой строки переноса
- Настройки: строки контекста, порог автоматического сворачивания файла и раскладка по умолчанию
- Название расширения, заголовки команд и описания настроек переведены на английский и русский
