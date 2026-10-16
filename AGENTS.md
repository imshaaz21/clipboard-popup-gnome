# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

**Clipboard Popup** - a GNOME Shell extension implementing the Windows PowerToys
Win+V clipboard history experience: Super+V opens a context-menu-style popup at
the mouse pointer listing clipboard history (text + PNG images), with pinning,
per-entry delete, clear-keeps-pinned, persistence, and paste-on-select via a
simulated Ctrl+V.

- GNOME Shell 45-50, Wayland and X11
- No dependencies, no subprocesses, no network access

## Structure

```
extension/extension.js   # hotkey, popup at pointer, clipboard watch, paste inject
extension/history.js     # entry storage: pin/delete/clear/trim, JSON persistence
extension/prefs.js       # Adw preferences window (GTK 4)
extension/schemas/       # GSettings schema
.github/workflows/ci.yml # schema check, node --check, Shexli review gate
Makefile                 # pack / install / nested (throwaway shell for testing)
```

## Hard rules (extensions.gnome.org review guidelines - CI enforced)

- **No synchronous IO in the shell process** - `Gio.File.load_contents_async`,
  `replace_contents_async`, never their sync variants. No `GLib.spawn*`, no
  subprocesses at all.
- **Destroy everything in `disable()`** - disconnect every signal (store the id),
  remove every main loop source (track ids, `GLib.Source.remove`), destroy every
  actor, and null every `this._` reference.
- **No `try`/`catch` around `enable()` or `disable()`** - errors inside must
  propagate to the shell log.
- **No `stylesheet.css`** - size/style via widget properties only.
- **Wrap user-visible strings in `_()`** - never translatable text in template
  literals.
- **No em dashes** anywhere - use `-`.
- **Clipboard access is declared** in `metadata.json` description; keep that
  sentence accurate if behavior changes.
- **Password-manager entries are never stored** - entries offering
  `x-kde-passwordManagerHint` are skipped; do not remove this check.

## Commands

```bash
make pack     # build dist/*.shell-extension.zip
make install  # install + pack for the current user (log out/in to enable)
make nested   # run extension/ in a throwaway GNOME Shell session

# local CI equivalent:
glib-compile-schemas --strict --dry-run extension/schemas
for f in extension/*.js; do cp "$f" "/tmp/$(basename "$f" .js).mjs"; node --check "/tmp/$(basename "$f" .js).mjs"; done
(cd extension && zip -qr ../extension.zip . -x 'schemas/gschemas.compiled') && shexli extension.zip
```

Shexli must report 0 errors and 0 warnings; `manual_review` findings are fine
when declared (clipboard access).

## Conventions

- Commits: plain sentence-case titles, no co-author trailers.
- History entries: `{id, kind: 'text'|'image', text?, imageFile?, imgHash?,
  pinned, timestamp}`; `_bytes` is runtime-only and stripped on save.
- Only the newest image keeps `_bytes` in memory; `imgHash` dedupes across the
  whole history including persisted entries.
