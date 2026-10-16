# Clipboard Popup for GNOME: Win+V clipboard history

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
![GNOME Shell 45-50](https://img.shields.io/badge/GNOME_Shell-45%E2%80%9350-4a86cf)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=flat&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/imshaaz)

A GNOME Shell extension that brings the Windows **Win+V** clipboard experience to GNOME: press **Super+V** and a popup opens right where your mouse pointer is - like a right-click menu - listing your clipboard history. Pick an entry and it is pasted into whatever you were typing in.

## Features

- Popup at the mouse pointer, keyboard navigable (arrow keys + Enter), like a context menu
- Text **and images** (screenshots, copied PNGs) with image thumbnails
- **Pin** entries so they never expire and survive Clear history
- Per-entry delete, and a Clear history action that keeps pinned entries
- **Paste on select**: the chosen entry is placed on the clipboard and a Ctrl+V is simulated - the PowerToys trick
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
- **Paste on select** - simulate Ctrl+V after picking an entry
- **Popup shortcut** - change via `dconf` key `/org/gnome/shell/extensions/clipboard-popup/popup-shortcut` (default `['<Super>v']`)

## Privacy

Clipboard history may contain sensitive data (passwords, tokens). It is stored unencrypted in `~/.cache/clipboard-popup/` and never leaves your machine - the extension has no network access. See [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GPL-3.0. See [LICENSE](LICENSE).
