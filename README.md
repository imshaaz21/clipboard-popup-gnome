# Clipboard Popup for GNOME: Win+V clipboard history

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![GNOME Shell 45-50](https://img.shields.io/badge/GNOME_Shell-45%E2%80%9350-4a86cf)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=flat&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/imshaaz)

A GNOME Shell extension that brings the Windows **Win+V** clipboard experience to GNOME: press **Super+V** and a popup opens right where your mouse pointer is - like a right-click menu - listing your clipboard history. Pick an entry and it is pasted into whatever you were typing in.

| The popup opens where the pointer is |
|:---:|
| ![Clipboard popup](docs/popup.png) |

## Features

- Popup at the mouse pointer, keyboard navigable (arrow keys + Enter), scrollable at 480px max, like a context menu
- Text **and images** (screenshots, copied PNGs) with image thumbnails
- **Pin** entries so they never expire and survive Clear history
- Per-entry delete, and a Clear history action that keeps pinned entries
- **Paste on select**: the chosen entry is placed on the clipboard and Shift+Insert is simulated (works in terminals too) - the PowerToys trick
- **Cycle without opening**: next/prev entry keybindings step through history with an OSD preview
- **Private mode**: right-click the panel icon (or use a keybinding/preference) to pause recording - the icon switches to a pause glyph while it is on
- History survives reboots (stored in `~/.cache/clipboard-popup/`)
- Configurable history size and text preview length
- Lightweight: signal-driven, no polling, no subprocesses, all file IO async - zero cost while idle

## Requirements

- GNOME Shell 45 to 50 (Wayland and X11)

## Installation

From source:

```bash
git clone https://github.com/imshaaz21/clipboard-popup-gnome.git
cd clipboard-popup-gnome
make install
```

Then log out and back in (Wayland), and enable it:

```bash
gnome-extensions enable clipboard-popup@imshaaz21.github.com
```

## Usage

1. Copy text or images as usual - they are recorded automatically.
2. Press **Super+V** - the popup appears at your pointer.
3. Click an entry or select it with arrows + Enter. It is pasted into the focused window.
4. Use the ☆ button on an entry to pin it, × to delete it, or **Clear history** at the bottom.

## Preferences

Open from Extensions app or `gnome-extensions prefs clipboard-popup@imshaaz21.github.com`:

- **History size** - maximum unpinned entries kept (5-200, default 25)
- **Text preview length** - characters shown per text entry
- **Paste on select** - simulate a paste keypress after picking an entry
- **Private mode** - pause recording; also togglable from the popup itself
- **Notify on copy** - show an OSD when new content is recorded
- **Confirm clear** - require a second click before wiping history (default on)
- **Strip text** - trim whitespace from copied text
- **Move item first** - selected entries jump to the top of history
- **Cache only favorites** - only pinned entries survive a restart
- **Shortcuts** - editable in preferences; popup (`<Super>v`), next/prev entry cycling, private-mode toggle; empty disables

The panel icon opens the popup on left-click; right-click toggles private mode. If `Super+V` clashes with GNOME's notification tray, pick another shortcut. Paste-on-select sends Shift+Insert, which terminals accept too, so it works in every app.

## Translations

The extension is translatable. To add a language:

```bash
make pot                            # regenerate po/clipboard-popup.pot
msginit -i po/clipboard-popup.pot -l <lang> -o po/<lang>.po
# translate, then make pack compiles it into the extension
```

## Privacy

Clipboard history may contain sensitive data (passwords, tokens). It is stored in `~/.cache/clipboard-popup/` and never leaves your machine; entries flagged by password managers (`x-kde-passwordManagerHint`) are skipped. History is not encrypted; the extension has no network access. See [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GPL-3.0. See [LICENSE](LICENSE).
