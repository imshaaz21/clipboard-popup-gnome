# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keep-a-changelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Initial release: <kbd>Super</kbd>+<kbd>V</kbd> opens a clipboard history popup at the mouse pointer, context-menu style, keyboard navigable
- Text and image (PNG) history with thumbnails, pinning, per-entry delete, and clear-keeps-pinned
- Paste-on-select: chosen entry is placed on the clipboard and Ctrl+V is simulated
- History persists across restarts in `~/.cache/clipboard-popup/`
- Preferences for history size, preview length, paste-on-select, and an editable popup shortcut
- Panel icon that opens the popup
- Scrollable history list
- Entries flagged by password managers are not captured

### Fixed
- Early clipboard copies lost when history finished loading; duplicate images; virtual keyboard device leaked on every paste
