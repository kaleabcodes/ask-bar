# Changelog

## Unreleased

- Calculator: percentages (`20% of 80`, `80 + 20%`), hex, binary and octal
  literals, unit conversion (`10 km in mi`, `72 f to c`, `1 gib in mb`),
  currency conversion with live rates (`$20 in eur`; rates by
  exchangerate-api.com, cached for 12 hours, can be turned off) and number
  bases (`255 to hex`). All work without the `=` prefix too.
- Emoji and symbol search with `:` (`:fire`, `:shrug`, `:right arrow`);
  Enter copies the character.
- Clipboard history: `/clip` searches recent copies; Alt+Enter removes one or
  clears all. Kept in memory only, never written to disk; `/password` output
  is excluded.
- Window actions on Alt+Enter: close, minimize, maximize, always on top, move
  to another workspace or monitor.
- GNOME Settings panels in the default search (`wifi`, `bluetooth`,
  `displays`).
- `/rank <query>` explains the ranking of the default search.
- Footer shows "Enter Copy" where Enter copies, and "Enter Run" in action lists.
- CI runs tests, schema and syntax checks on every push and pull request.

## 1.3

- If a search fails, the bar opens and shows the error. Before, Alt+Space could
  seem to do nothing while the hidden bar kept the keyboard.
- Restore the "Ask anything, @ files, / commands, = math" placeholder.

## 1.2

- Pin apps, files, projects and commands from their Alt+Enter actions. Favorites
  appear first in an empty search, stay in pin order and survive restarts.
- Unpin from the same menu without closing the bar. Removed apps and commands
  remain available to unpin, and all favorites stay reachable by scrolling.
- Type `/help` to browse instructions or `/help files` to search a topic. Enter
  or Tab fills an example into the bar so you can try it.
- Pinned developer tools reopen with fresh input. Favorites store references,
  never clipboard contents or generated output.
- Keep late search results from replacing an open actions menu.
