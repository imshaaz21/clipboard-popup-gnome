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
make nested   # runs extension/ in a throw-away GNOME Shell, your session is untouched
```

Preferences run in a separate process, so watch their log with `journalctl -f -o cat /usr/bin/gjs`.

Code layout:

| File | Purpose |
|---|---|
| `extension/extension.js` | Hotkey, popup at pointer, clipboard watching, paste injection |
| `extension/history.js` | History storage: pin, delete, clear, trim, persistence |
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
