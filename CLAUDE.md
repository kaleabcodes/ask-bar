# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ask Bar: a Spotlight/Raycast-style launcher as a GNOME Shell extension (GJS, ES modules, GNOME Shell 48–50, developed on 50 / Wayland). UUID `ask-bar@kaleabcodes.dev`, schema `org.gnome.shell.extensions.ask-bar`, default shortcut **Alt+Space**. Super+Space is avoided because it switches input sources, and Ctrl+Space because it's code completion in IDEs. Sibling project: `../dock-hover-preview`; its CLAUDE.md documents the headless-shell testing technique used here.

Built: launcher, `@` files, `/` commands, `!` web shortcuts, files in the default search, and a settings UI with General / Search / Appearance / Shortcuts pages. **Ask AI (`?`) is deliberately deferred** by the owner: `?` shows a "coming soon" row; don't implement AI unless asked. When it's picked up, the plan is Claude API and/or Ollama behind a setting, streamed, with `@file` context and the API key in the GNOME keyring. GJS has no Anthropic SDK, so it would be raw HTTP to `/v1/messages`. It was built as an extension rather than an app on purpose: only the shell can show a reliable overlay and global shortcut on Wayland.

## Commands

```bash
npm test                                           # node --test: pure-JS core tests in tests/
glib-compile-schemas --strict --dry-run schemas/
for f in *.js core/*.js providers/*.js ui/*.js; do cp "$f" /tmp/x.mjs && node --check /tmp/x.mjs; done
./install.sh        # dev: symlink into ~/.local/share/gnome-shell/extensions (curl | bash: install a copy)
./pack.sh [ver]     # dist/<uuid>.shell-extension.zip
```

`install.sh` and `pack.sh` copy whole folders (`core lib providers ui schemas`); a new top-level file or folder must be added to both. The running Wayland shell never reloads extension JS, so test in a nested or headless shell, or log out.

## Architecture

- `core/`: **pure JavaScript with no `gi://` imports**, tested by Node. Keep it that way.
  - `parse.js` maps the leading prefix to a mode (`@` files, `/` commands, `=` math, `!` web, `?` AI). A `/` followed by another `/` is a path, not a command.
  - `fuzzy.js`: an exact substring beats a scattered match; bonuses for the start of the text, word starts and consecutive characters. `bestScore` weights later fields down.
  - `calc.js`: a recursive-descent evaluator (never `eval`). `looksLikeMath` requires an operator or a function call, so plain numbers and words aren't treated as math.
- `providers/`: each provider has `search(query, opts) → Result[]` and `destroy()` (the `Result` shape is in `providers/types.js`). Scores are comparable across providers: the calculator is 1000 (always on top), windows are weighted by 0.9 so apps come first, and apps get running and most-used bonuses. `AppsProvider` caches its search fields and clears the cache on `installed-changed`.
- `extension.js` merges the providers for a mode, sorts and cuts to `max-results`, and registers the keybinding with `Main.wm.addKeybinding` (NORMAL | OVERVIEW | POPUP modes, so the same shortcut also closes the bar).
- `providers/files.js` (`@`) runs the `localsearch search` CLI (about 20 ms). The TinySPARQL typelib (`gi://Tsparql`) isn't installed on the host, only in Flatpak runtimes, and a raw SPARQL query over D-Bus took around 30 s. It runs two queries (`-f`, `-s`) and re-ranks them with `core/files.js`, because localsearch's own order is poor. localsearch **skips any folder containing `.git`**, so git repositories come from a cached background `find` scan (every 10 minutes, depth 6, skipping hidden and dependency folders), started by `prefetch()` when the bar opens. A bare `@` lists recent files from `recently-used.xbel`. Ctrl+Enter calls `org.freedesktop.FileManager1.ShowItems`.
- `providers/commands.js` (`/`) has three kinds of command. **System** actions run GNOME APIs (lock through `Main.screenShield`, suspend through logind over D-Bus, log out/restart/power off through `org.gnome.SessionManager`, which shows GNOME's own confirmation dialog) and settings toggles with live "Currently …" descriptions (getters). **Developer** tools are thin wrappers over pure `core/devtools.js`; their input is the text typed after the command, or else the clipboard. Only the top `PREVIEW_COUNT` matches compute a preview, the clipboard is capped at 1 MB, and matches scoring under half the best are dropped. **Custom** commands are a JSON string setting run with `sh -c`, edited in `prefs.js`. Randomness (UUID, password) reads `/dev/urandom`, not `Math.random`. Copying shows an OSD with `osdWindowManager.showOne(monitor, icon, label, null, -1)`. `searchQuick` adds non-tool commands to the default mode with weight 0.85 ("lock" → Lock Screen).
- `providers/web.js` (`!`): shortcuts ("bangs") from `core/web.js` (`DEFAULT_BANGS`, merged with the `custom-web-shortcuts` JSON setting; a custom key replaces a built-in one). A shortcut without search terms is a **`fill`** result: Enter or Tab puts `!key ` in the entry instead of closing. `fallback()` adds "Open <url>" for typed URLs (`asUrl`) and a "Search <engine> for …" row that is always last (negative score).
- Brand logos for the built-in shortcuts live in `icons/brands/` (Simple Icons v16.33.0, CC0; provenance is in its README). Colored brands are `<key>.svg` with `fill` set to the brand hex. Black brands (GitHub, Wikipedia, MDN) are `<key>-symbolic.svg`, which GNOME recolors to the text color so they work in both themes. `WebProvider._icon()` shows a logo only for an unmodified built-in shortcut (same key **and** URL); custom shortcuts get the generic icon.
- Default mode in `extension._search` returns `{results, more}`: instant sources first, then `more` (with `FilesProvider.searchTop`: query ≥ 3 characters, score ≥ 90, `default-file-results` items) replaces the list. Everything is ranked together with a relative cutoff (0.35 × the best score) so weak fuzzy matches don't bury strong ones. The bar keeps a selection across updates **only if the user moved it** (`_userSelected`); otherwise the new best result is selected. Every source can be turned off in the settings.
- Appearance settings are read on each `open()` (`_applyAppearance`, `_placePanel`): width, vertical position, monitor, dimming, compact mode (`ab-compact`, smaller icons, no subtitles), footer, animations, remember-last-query.
- `prefs.js` builds four pages from small row helpers (`switchRow`, `spinRow`, `comboRow`) and a generic `JsonListGroup` editor for the two JSON list settings. Reset All leaves `custom-*` lists alone.
- Async providers: `extension._search` may return a Promise. The bar cancels the previous search's `Gio.Cancellable` on every keystroke and drops results from older generations. It keeps the previous results of the same mode on screen while new ones load, so typing doesn't flicker. Cancellation errors are swallowed (`isCancelled` in `lib/async.js`, where all I/O helpers live).
- `ui/bar.js`: a full-stage transparent backdrop in `Main.uiGroup` with a centered panel, using `Main.pushModal`/`popModal`. In GNOME 50 the grab object has no `get_seat_state`; the shell's own dialogs don't check the result either. The entry keeps key focus (rows have `can_focus: false`), and arrow keys move a `:selected` pseudo-class. Enter and Ctrl+Enter are handled in the key-press handler (`altActivate`, with an `altLabel` footer hint). `_activate` **closes the bar before calling `activate()`** so the launched app or window gets focus. The selection is kept by result `id` across updates.

## Theming (light and dark)

A single `stylesheet.css` holds dark colors plus a `.ab-light` override section. On every `open()`, `_applyAppearance()` checks `Main.getStyleVariant()` and toggles `ab-light` on the backdrop and the panel. Set every color explicitly: inheriting the shell theme's text color produced dark text on the dark panel. **Don't rely on `stylesheet-light.css`**: GNOME didn't always reload extension stylesheets after a theme change (seen on Ubuntu with GNOME 50). To test light, use `--mode=ubuntu` with Ubuntu's Light appearance (`gtk-theme 'Yaru-purple'` and `color-scheme 'default'`), and save and restore both keys. The plain `user` mode never goes light, and Ubuntu mode rewrites `color-scheme` to match a `*-dark` gtk theme.

## Planned-mode placeholders

Modes that aren't built yet return a single "coming soon" row (`COMING_SOON` in `extension.js`). Replace that entry when implementing a mode.
