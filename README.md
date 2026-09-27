<div align="center">

# Ask Bar

**One keyboard shortcut to search everything on GNOME.**

Press **Alt+Space**, start typing, hit Enter.

[![License: GPL-2.0-or-later](https://img.shields.io/badge/license-GPL--2.0--or--later-blue.svg)](LICENSE)
[![GNOME Shell 48–50](https://img.shields.io/badge/GNOME%20Shell-48%20%7C%2049%20%7C%2050-4a86cf.svg?logo=gnome&logoColor=white)](https://www.gnome.org)

</div>

## Features

- **Apps**: fuzzy search by name, description and keywords; your most-used
  apps rank first
- **Open windows**: jump to any window on any workspace
- **Calculator**: type `2340 * 1.15` and the answer appears; Enter copies it
- **Keyboard first**: ↑↓ to move, Enter to open, Esc to close

### Coming next

| Prefix | Mode |
| --- | --- |
| `@` | File and folder search |
| `/` | Commands (lock, dark mode, developer tools…) |
| `!` | Web search shortcuts (`!gh`, `!yt`…) |
| `?` | Ask AI, with `@files` as context |

## Installation

Requires **GNOME Shell 48, 49 or 50**.

```bash
git clone https://github.com/kaleabcodes/ask-bar.git
cd ask-bar
./install.sh
```

Then log out and back in (on Wayland, GNOME loads new extensions at login).

The shortcut defaults to **Alt+Space** and can be changed in the settings:
`gnome-extensions prefs ask-bar@kaleabcodes.dev`.

## Development

```bash
npm test                                  # core logic tests (Node, no GNOME needed)
dbus-run-session gnome-shell --devkit     # try changes without logging out
```

## License

Released under the [GNU General Public License v2.0 or later](LICENSE).

Made by [Kaleab Tesfaye](https://github.com/kaleabcodes).
