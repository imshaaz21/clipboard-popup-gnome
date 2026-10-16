# Security Policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do not open a public issue for security problems.
Use GitHub's private reporting: **Security** tab, then **Report a vulnerability**.
You will get a reply within a week.

## Scope

The extension runs inside the GNOME Shell process. It reads CLIPBOARD and optionally PRIMARY contents to build its history, writes selected plain text or PNG entries to CLIPBOARD, and optionally simulates the configured paste key combination. Paste is cancelled if focus or clipboard ownership changes before injection.

History is stored under `$XDG_CACHE_HOME/clipboard-popup/` (normally `~/.cache/clipboard-popup/`) using owner-only directories and files. It is unencrypted and never sent anywhere. Other processes running as your user can still access it.

Both selections always skip `x-kde-passwordManagerHint`. This does not detect unmarked secrets. Use private mode or focused-application exclusions for sensitive work. Those controls cancel pending capture requests, but do not remove previously captured entries. Exclusions use the focused application's desktop ID or window class, not a guaranteed identification of background clipboard owners.

Favorites-only mode keeps new unpinned content in memory, including images. Existing snapshots are rewritten asynchronously, with unused cached images removed after a successful snapshot write. Clearing or expiring history does not securely erase disk blocks or backups, and does not clear the system clipboard.

Cache reads are bounded, image paths are confined to the cache, symlink files are rejected, and JSON entries are validated. Invalid history is not overwritten automatically. Review a damaged cache before removing it; failed or interrupted writes may leave stale data or lose the latest pending changes.
