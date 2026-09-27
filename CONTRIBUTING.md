# Contributing

Thanks for helping improve Ask Bar! Bug reports, ideas and pull requests are
all welcome.

## Reporting bugs

[Open an issue](https://github.com/kaleabcodes/ask-bar/issues) with:

- Your GNOME Shell version (`gnome-shell --version`)
- Steps to reproduce
- Relevant log output:
  `journalctl -b -o cat _COMM=gnome-shell | grep -i ask-bar`

## Development setup

```bash
git clone https://github.com/kaleabcodes/ask-bar.git
cd ask-bar
./install.sh      # links this folder into ~/.local/share/gnome-shell/extensions
npm test          # unit tests for the core logic (Node, no GNOME needed)
```

GNOME on Wayland only loads extension code at login. To try changes without
logging out, run a nested shell in a window:

```bash
dbus-run-session gnome-shell --devkit
```

## Project layout

| Folder | Purpose |
| --- | --- |
| `core/` | Pure JavaScript with no GNOME imports: prefix parsing, fuzzy ranking, calculator, file ranking, developer tools, web shortcuts. Covered by `tests/`. |
| `providers/` | One search source per file (apps, windows, files, commands, web, calculator), all returning the same result shape (`providers/types.js`) |
| `ui/` | The bar overlay and result rows |
| `lib/` | Non-blocking helpers for commands, files, randomness and the clipboard |
| `extension.js` | Wires providers to the bar and the keyboard shortcut |
| `prefs.js` | The settings window |

## Guidelines

- Put logic that doesn't need GNOME in `core/` and test it
- Never block the shell: use the async helpers in `lib/async.js`
- Release every signal, timer and actor in `disable()`, as required by the
  [extensions.gnome.org review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
- Test in a nested shell before opening a pull request

## Releasing

Pushing a version tag publishes a release:

```bash
git tag v1.1
git push origin v1.1
```

The [Release workflow](.github/workflows/release.yml) checks the sources, runs
the tests, builds the zip, uploads it to extensions.gnome.org and creates a
GitHub release. It needs the repository secrets `EGO_USERNAME` and
`EGO_PASSWORD`. To build the zip locally, run `./pack.sh` (the result goes in
`dist/`).
