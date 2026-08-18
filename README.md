# prime-status

A small Prime Agent package that adds the current working directory and session
name to the status line.

The extension uses `ctx.ui.setStatus()`, so it works in interactive and daemon
sessions without a custom TUI component.

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

If the session has no name, the extension displays `(unnamed)`.

## Development

```sh
npm install
npm run typecheck
npm test
npm run pack:check
```

## License

MIT.
