# Changelog

## 0.1.4 - 2026-08-27

### Changed

- Render the card as a `belowEditor` widget without replacing the built-in footer.
- Align the package Node.js requirement with the supported Prime Agent runtime.

### Fixed

- Use `pi-tui` terminal-width calculations for grapheme-safe truncation.
- Bound raw display input and remove Unicode format controls that can spoof text.
- Retry failed Git detection and clear cached worktree names when a session ends.

## 0.1.3 - 2026-08-24

### Changed

- Replace the flat TUI cwd line with a responsive, themed card that also shows the session and Git worktree.
- Stack the local TUI card below the built-in agents summary and keep a widget fallback for daemon and RPC clients.
- Match the agents view palette and use the available terminal width with a compact daemon fallback.

### Fixed

- Sanitize terminal controls and bound dynamic cwd/session values before rendering them.
- Render a pre-styled card for daemon-backed TUI clients that cannot receive component factories.

## 0.1.2 - 2026-08-19

### Fixed

- Apply theme accent colors to status icons while keeping labels muted.


## 0.1.1 - 2026-08-19

### Added

- Added Nerd Font symbols and a Powerline-thin separator to the status display.
- Added a fallback for status updates before the theme is initialized.


## 0.1.0 - 2026-08-19

### Fixed

- Refresh the status line when a session is renamed or its name is cleared.
- Added CI checks for typechecking, tests, and package contents.

### Added

- Added the `prime-status` package with cwd and session-name status data.
- Added daemon-compatible status updates through `ctx.ui.setStatus()`.
- Added a `ctx.ui.setWidget()` fallback below the editor for Prime's empty built-in footer.
