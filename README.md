# prime-status

A small Prime Agent package that adds the current working directory and session
name to the status display.

In the interactive TUI, the extension renders a compact, themed card below the
editor with a widget. In RPC sessions, it sends the same card as pre-rendered
widget lines because component factories are not supported there. It refreshes
when the session starts, when turns or prompts change, and when the session name
is renamed or cleared.

## Install

From a local tarball:

```sh
npm pack
prime-agent package install npm:prime-status@file:/absolute/path/prime-status-0.1.4.tgz
```

Use `--local` with `prime-agent package install` to install it only for the
current project. Restart Prime Agent, or run `/reload`, after installing.

## Display

```text
╭─ cwd ───────────────────────────────────────────────────╮
│  /workspaces/prime-board  •   session: Release review │
│  worktree: prime-board                                 │
╰─────────────────────────────────────────────────────────╯
```

The TUI card has a themed border, a `cwd` title, and responsive rows for the
path, session, and Git worktree name. Long values are truncated to the available
width. It follows the agents view palette: the border and title use `border`
and `accent`, the cwd uses `mdLink`, a named session uses `customMessageLabel`,
and a detected worktree uses `success`. Labels stay `muted`; unnamed sessions
and missing worktrees use `warning` and `dim`. The card uses the terminal width
when the host provides it and keeps an 80-column fallback in RPC sessions. In a
local TUI, it uses a `belowEditor` widget and leaves the built-in footer intact.
RPC clients receive the same card as pre-rendered `belowEditor` widget lines.
Print and JSON modes do not display extension UI.
The visual symbols use Nerd Font glyphs (``, ``) and the Powerline-thin
separator (``). With FiraCode Nerd Font Mono, these glyphs are included in the
terminal font; Powerline is not a separate font. If the session has no name, the
extension displays `(unnamed)`.

## Development

```sh
npm install
npm run typecheck
npm test
npm run pack:check
```

## License

MIT.
