# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Overview

**Clipboard Popup** - a GNOME Shell extension implementing a Windows-style
clipboard history experience: an opt-in shortcut opens a context-menu-style popup at
the mouse pointer listing clipboard history (text + PNG images), with pinning,
per-entry delete, clear-keeps-pinned, persistence, and paste-on-select via a
simulated Ctrl+V.

- GNOME Shell 45-50, Wayland and X11
- No dependencies, no subprocesses, no network access

## Structure

```
extension/extension.js   # hotkey, popup at pointer, clipboard watch, paste inject
extension/history.js     # validated history model, limits, deduplication, serialized snapshots
extension/storage.js     # asynchronous private files, bounded reads, image cleanup
extension/capture.js     # cancellable bounded clipboard transfers and secret hints
extension/actions.js     # clipboard selection, paste, caret tracking, dialogs
extension/menu.js        # independent popup/panel views, search, keyboard controls
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
  literals. Translations live in `po/`; `make pot` regenerates the POT and
  `make pack` compiles `.po` files into `extension/locale/`. When the first
  `.po` is added, also add `"gettext-domain": "clipboard-popup"` to
  metadata.json. Shexli 0.2.1 crashes with tree-sitter 0.26.0; use the CI-pinned
  tree-sitter 0.25.2 and tree-sitter-javascript 0.25.0 without disabling rules.
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
make check    # Node.js 22+ regression tests, real GJS persistence tests, schema/syntax checks
make smoke    # isolated headless Shell + GTK client: capture, menus, paste, lifecycle, preferences

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
- Image `_bytes` stay in the bounded in-memory cache so favorites-only mode
  never needs to write unpinned images and selection cannot race disk reads.
- The payload budget includes pins. Existing pins survive lowering the limit;
  new entries are refused when pins leave insufficient space. Hard cap: 200 pins.
- Native cursor tracking uses `Main.inputMethod` and IBus signals, not AT-SPI
  synchronous queries. Keep the pointer/focused-window fallback.
- Clipboard shortcuts ship unassigned, in line with the current review rules.
- Node 14 may precede the system Node on PATH. Locally use
  `make check NODE=/usr/bin/node` when necessary (the system Node is 22).
- Smoke-test helpers stay under `tests/` and must never be included in the ZIP.
- Prepare the virtual keyboard before the first paste. A headless Wayland client
  needs time to bind the new keyboard capability; creating it at injection time
  can drop the first paste. The smoke test covers this with a real GTK client.
- Release modal grabs explicitly before destroying dialogs, and never inject
  paste while another system modal is active.
- Adw preference-group descriptions use markup. Escape accelerator examples
  such as `&lt;Super&gt;v` rather than inserting literal angle brackets.
