# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keep-a-changelog.com/en/1.1.0/).

## [1.0.1] - Unreleased

### Fixed
- A screenshot no longer appears twice: images that decode to identical pixels (re-encoded by the screenshot tool within seconds) are deduplicated
- Paste-on-select no longer cancels when XWayland echoes the clipboard right after a pick (browser URL bars), and waits through transient menu/modal/key-focus states, then shows "Copied. Paste manually." instead of failing silently

## [1.0.0] - Unreleased

### Added
- Initial release: compact clipboard history popup near supported text cursors, the pointer, or the focused window
- Plain text and PNG history with thumbnails, full-history search, favorites filtering, paged previews, pinning, and deletion
- Optional configurable paste-on-select, numbered selection, keyboard pin/delete/preview, and clipboard cycling
- Private mode, focused-app exclusions, optional expiry, and favorites-only persistence
- Confirmation before clearing unpinned entries from menus or shortcuts
- Opt-in global shortcuts; assign Super+V in preferences for a Win+V-style workflow
- Bounded cancellable clipboard transfers, unconditional password-manager hint filtering for both selections, and image dimension limits
- Validated asynchronous persistence, private file permissions, serialized snapshots, cache path confinement, and stale-image cleanup
- Regression tests, real GJS filesystem tests, and an isolated headless Shell/GTK integration test
- CI review gate with compatible pinned Shexli parser dependencies

### Fixed
- Caret positioning API usage and handling of negative monitor coordinates
- PNG size accounting, image selection races, startup ID collisions, and whole-history text deduplication
- Pending captures surviving private-mode changes or disable
- Search excluding retained entries beyond the rendering limit
- Nonfunctional clear confirmation and empty initial panel menu
- Menu signal ownership, bounded panel rendering, and popup focus/grab cleanup
