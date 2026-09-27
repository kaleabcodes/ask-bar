# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ask Bar: a Spotlight/Raycast-style launcher as a GNOME Shell extension (GJS, ES modules, GNOME Shell 48–50, developed on 50 / Wayland). UUID `ask-bar@kaleabcodes.dev`, schema `org.gnome.shell.extensions.ask-bar`, default shortcut **Alt+Space**. Super+Space is avoided because it switches input sources, and Ctrl+Space because it's code completion in IDEs. Sibling project: `../dock-hover-preview`; its CLAUDE.md documents the headless-shell testing technique used here.

Roadmap (step 1 is done): 2) `@` files through localsearch/TinySPARQL; 3) `/` commands, including developer tools (JSON, JWT, Base64, UUID…); 4) `?` / Tab Ask AI (Claude API and/or Ollama, streamed, with `@file` context, API key in the GNOME keyring); 5) `!` web shortcuts, polish, publishing. It was built as an extension rather than an app on purpose: only the shell can show a reliable overlay and global shortcut on Wayland.

## Commands

```bash
npm test                                           # node --test: pure-JS core tests in tests/
glib-compile-schemas --strict --dry-run schemas/
for f in *.js core/*.js providers/*.js ui/*.js; do cp "$f" /tmp/x.mjs && node --check /tmp/x.mjs; done
./install.sh        # dev: symlink into ~/.local/share/gnome-shell/extensions (curl | bash: install a copy)
./pack.sh [ver]     # dist/<uuid>.shell-extension.zip
```

`install.sh` and `pack.sh` copy whole folders (`core providers ui schemas`); a new top-level file or folder must be added to both. The running Wayland shell never reloads extension JS, so test in a nested or headless shell, or log out.

## Architecture

- `core/`: **pure JavaScript with no `gi://` imports**, tested by Node. Keep it that way.
  - `parse.js` maps the leading prefix to a mode (`@` files, `/` commands, `=` math, `!` web, `?` AI). A `/` followed by another `/` is a path, not a command.
  - `fuzzy.js`: an exact substring beats a scattered match; bonuses for the start of the text, word starts and consecutive characters. `bestScore` weights later fields down.
  - `calc.js`: a recursive-descent evaluator (never `eval`). `looksLikeMath` requires an operator or a function call, so plain numbers and words aren't treated as math.
- `providers/`: each provider has `search(query, opts) → Result[]` and `destroy()` (the `Result` shape is in `providers/types.js`). Scores are comparable across providers: the calculator is 1000 (always on top), windows are weighted by 0.9 so apps come first, and apps get running and most-used bonuses. `AppsProvider` caches its search fields and clears the cache on `installed-changed`.
- `extension.js` merges the providers for a mode, sorts and cuts to `max-results`, and registers the keybinding with `Main.wm.addKeybinding` (NORMAL | OVERVIEW | POPUP modes, so the same shortcut also closes the bar).
- `ui/bar.js`: a full-stage transparent backdrop in `Main.uiGroup` with a centered panel, using `Main.pushModal`/`popModal`. In GNOME 50 the grab object has no `get_seat_state`; the shell's own dialogs don't check the result either. The entry keeps key focus (rows have `can_focus: false`), and arrow keys move a `:selected` pseudo-class. `_activate` **closes the bar before calling `activate()`** so the launched app or window gets focus. The selection is kept by result `id` across updates.

## Planned-mode placeholders

Modes that aren't built yet return a single "coming soon" row (`COMING_SOON` in `extension.js`). Replace that entry when implementing a mode.
