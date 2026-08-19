# Changelog

## 0.1.0 - 2026-08-19

### Fixed

- Refresh the status line when a session is renamed or its name is cleared.
- Added CI checks for typechecking, tests, and package contents.

### Added

- Added the `prime-status` package with cwd and session-name status data.
- Added daemon-compatible status updates through `ctx.ui.setStatus()`.
- Added a `ctx.ui.setWidget()` fallback below the editor for Prime's empty built-in footer.
