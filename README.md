# prime-status

A small Prime Agent package that adds the current working directory and session
name to the status line.

The extension uses `ctx.ui.setStatus()` and mirrors the same line with
`ctx.ui.setWidget()` below the editor. The widget keeps the information visible in
Prime's current TUI, whose built-in footer is empty, while remaining compatible
with interactive and daemon sessions. It refreshes when the session starts, when
turns or prompts change, and when the session name is renamed or cleared.

## Install

From a local tarball:

```sh
npm pack
prime-agent package install npm:prime-status@file:/absolute/path/prime-status-0.1.0.tgz
```

Use `--local` with `prime-agent package install` to install it only for the
current project. Restart Prime Agent, or run `/reload`, after installing.

## Display

```text
cwd: /workspaces/prime-board | session: Release review
```

The line is published as a persistent status and as a widget below the editor.
The labels use the muted theme color, values use the accent color, and an unnamed
session uses the warning color. If the session has no name, the extension displays
`(unnamed)`.

## Development

```sh
npm install
npm run typecheck
npm test
npm run pack:check
```

## License

MIT.
