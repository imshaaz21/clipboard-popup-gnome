# Contributing

Thanks for helping out. Bug reports, translations and pull requests are all welcome.

## Reporting a bug

Open an [issue](https://github.com/imshaaz21/clipboard-popup-gnome/issues/new/choose) and include:

- GNOME Shell version (`gnome-shell --version`) and distribution
- Session type (`echo $XDG_SESSION_TYPE`)
- Output of `journalctl -f -o cat /usr/bin/gnome-shell` while reproducing

## Development setup

```bash
git clone https://github.com/imshaaz21/clipboard-popup-gnome.git
cd clipboard-popup-gnome
make check    # Node.js 22+, GJS, and schema/syntax checks
make smoke    # isolated headless Shell with capture, UI, paste, and preferences tests
make nested   # interactive development Shell
```

Preferences run in a separate process, so watch their log with `journalctl -f -o cat /usr/bin/gjs`.

Code layout:

| File | Purpose |
|---|---|
| `extension/extension.js` | Hotkey, popup at pointer, clipboard watching, paste injection |
| `extension/history.js` | History validation, pin/delete/clear/trim, serialized snapshots |
| `extension/storage.js` | Async cache IO, permissions, bounded reads, image cleanup |
| `extension/capture.js` | Cancellable bounded transfers and secret hints |
| `extension/menu.js` | Search, favorites, independent popup/panel views |
| `extension/actions.js` | Paste, native caret signals, confirmation and preview dialogs |
| `tests/` | Node model/capture tests, GJS filesystem tests, isolated Shell/GTK smoke tests |
| `extension/prefs.js` | Preferences window |
| `extension/schemas/` | GSettings schema |

## Guidelines

These follow the [extensions.gnome.org review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html), which every release is checked against (see `.github/workflows/ci.yml`, the Shexli step).

- No synchronous subprocesses and no blocking calls in the shell process - all file IO must be async.
- Disconnect every signal, remove every main loop source, and destroy every object in `disable()`.
- No `try`/`catch` around `enable()` or `disable()`.
- Wrap user-visible strings in `_()`. Never put translatable text in a template literal.
- No custom `stylesheet.css`.
- Do not ship files that are not used.
