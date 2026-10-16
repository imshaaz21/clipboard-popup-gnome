# Security Policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do not open a public issue for security problems.
Use GitHub's private reporting: **Security** tab, then **Report a vulnerability**.
You will get a reply within a week.

## Scope

The extension runs inside the GNOME Shell process. It reads clipboard contents to build its history, writes the entry the user selects, and simulates a Ctrl+V keypress when paste-on-select is enabled.
History is stored locally in `~/.cache/clipboard-popup/` and is never sent anywhere — the extension does not use the network. Note that clipboard history may contain sensitive data such as copied passwords; clear it or pin selectively as needed.
