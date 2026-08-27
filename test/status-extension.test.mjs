import assert from "node:assert/strict";
import test from "node:test";

import { visibleWidth } from "@earendil-works/pi-tui";
import primeStatus from "../dist/index.js";

function createExtension(exec = async () => ({
  stdout: `${process.cwd()}\n`,
  stderr: "",
  code: 0,
  killed: false,
})) {
  const handlers = new Map();
  primeStatus({
    on(event, handler) {
      handlers.set(event, handler);
    },
    exec,
  });
  return handlers;
}

function createContext(sessionName, mode, hasUI, supportsWidgetFactory = true) {
  const calls = [];
  const factoryAttempts = [];
  let currentSessionName = sessionName;
  return {
    calls,
    factoryAttempts,
    setSessionName(name) {
      currentSessionName = name;
    },
    context: {
      ...(hasUI === undefined ? {} : { hasUI }),
      mode,
      cwd: "/workspaces/prime-board",
      sessionManager: {
        getSessionName: () => currentSessionName,
      },
      ui: {
        theme: {
          fg: (_color, text) => text,
          bold: text => text,
        },
        setStatus: (...args) => calls.push(["setStatus", ...args]),
        setWidget: (...args) => {
          if (!supportsWidgetFactory && typeof args[1] === "function") {
            factoryAttempts.push(args);
            return;
          }
          calls.push(["setWidget", ...args]);
        },
      },
    },
  };
}

test("publishes cwd and the current session name", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Release review");

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  assert.deepEqual(calls, [
    ["setStatus", "prime-status", " cwd: /workspaces/prime-board   session: Release review"],
    ["setWidget", "prime-status", [" cwd: /workspaces/prime-board   session: Release review"], { placement: "belowEditor" }],
  ]);
});

test("publishes an unstyled fallback before the theme is initialized", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Early session");
  Object.defineProperty(context.ui, "theme", {
    get() {
      throw new Error("Theme not initialized");
    },
  });

  await handlers.get("input")({ type: "input", text: "hello", source: "interactive" }, context);

  const status = " cwd: /workspaces/prime-board   session: Early session";
  assert.deepEqual(calls, [
    ["setStatus", "prime-status", status],
    ["setWidget", "prime-status", [status], { placement: "belowEditor" }],
  ]);
});

test("uses theme colors for labels, values, and an unnamed session", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext(undefined);
  context.ui.theme.fg = (color, text) => `<${color}>${text}</${color}>`;

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  const status =
    "<mdLink></mdLink> <muted>cwd:</muted> <mdLink>/workspaces/prime-board</mdLink><dim>  </dim>" +
    "<customMessageLabel></customMessageLabel> <muted>session:</muted> <warning>(unnamed)</warning>";
  assert.deepEqual(calls, [
    ["setStatus", "prime-status", status],
    ["setWidget", "prime-status", [status], { placement: "belowEditor" }],
  ]);
});

test("uses the agents-view color palette for a named session", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Release review");
  context.ui.theme.fg = (color, text) => `<${color}>${text}</${color}>`;

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  const status =
    "<mdLink></mdLink> <muted>cwd:</muted> <mdLink>/workspaces/prime-board</mdLink><dim>  </dim>" +
    "<customMessageLabel></customMessageLabel> <muted>session:</muted> <customMessageLabel>Release review</customMessageLabel>";
  assert.deepEqual(calls, [
    ["setStatus", "prime-status", status],
    ["setWidget", "prime-status", [status], { placement: "belowEditor" }],
  ]);
});

test("refreshes when the session name changes or is cleared", async () => {
  const handlers = createExtension();
  const { calls, context, setSessionName } = createContext("Initial name");

  setSessionName("Renamed session");
  await handlers.get("session_info_changed")({
    type: "session_info_changed",
    name: "Renamed session",
  }, context);
  setSessionName(undefined);
  await handlers.get("session_info_changed")({
    type: "session_info_changed",
    name: undefined,
  }, context);

  assert.deepEqual(calls, [
    ["setStatus", "prime-status", " cwd: /workspaces/prime-board   session: Renamed session"],
    ["setWidget", "prime-status", [" cwd: /workspaces/prime-board   session: Renamed session"], { placement: "belowEditor" }],
    ["setStatus", "prime-status", " cwd: /workspaces/prime-board   session: (unnamed)"],
    ["setWidget", "prime-status", [" cwd: /workspaces/prime-board   session: (unnamed)"], { placement: "belowEditor" }],
  ]);
});

test("refreshes when a prompt is entered", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Prompt session");

  await handlers.get("input")({ type: "input", text: "hello", source: "interactive" }, context);

  assert.deepEqual(calls, [
    ["setStatus", "prime-status", " cwd: /workspaces/prime-board   session: Prompt session"],
    ["setWidget", "prime-status", [" cwd: /workspaces/prime-board   session: Prompt session"], { placement: "belowEditor" }],
  ]);
});

test("uses a visible fallback when the session has no name", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext(undefined);

  await handlers.get("turn_start")({ type: "turn_start", turnIndex: 0, timestamp: 0 }, context);

  assert.deepEqual(calls, [
    ["setStatus", "prime-status", " cwd: /workspaces/prime-board   session: (unnamed)"],
    ["setWidget", "prime-status", [" cwd: /workspaces/prime-board   session: (unnamed)"], { placement: "belowEditor" }],
  ]);
});

test("refreshes on turns and clears on shutdown", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Named session");

  await handlers.get("turn_end")({ type: "turn_end" }, context);
  await handlers.get("session_shutdown")({ type: "session_shutdown" }, context);

  assert.deepEqual(calls, [
    ["setStatus", "prime-status", " cwd: /workspaces/prime-board   session: Named session"],
    ["setWidget", "prime-status", [" cwd: /workspaces/prime-board   session: Named session"], { placement: "belowEditor" }],
    ["setStatus", "prime-status", undefined],
    ["setWidget", "prime-status", undefined],
  ]);
});


function stripThemeMarkup(value) {
  return value.replace(/<\/?[a-zA-Z]+>/g, "");
}

test("renders a compact themed cwd card in the TUI", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Release review", "tui", true);
  context.ui.theme.fg = (color, text) => `<${color}>${text}</${color}>`;
  context.ui.theme.bold = text => `<bold>${text}</bold>`;

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  assert.equal(calls[0][0], "setStatus");
  assert.equal(calls[0][2], undefined);
  assert.equal(calls[1][0], "setWidget");
  assert.ok(Array.isArray(calls[1][2]));
  assert.equal(calls[2][0], "setWidget");
  assert.equal(typeof calls[2][2], "function");
  const widget = calls[2][2]({}, context.ui.theme);
  const lines = widget.render(64);
  const plainLines = lines.map(stripThemeMarkup);

  assert.match(lines[0], /<border>╭─ <\/border><accent><bold>cwd<\/bold><\/accent>/);
  assert.match(lines[1], /<mdLink><\/mdLink>.*<mdLink>.*prime-board.*<\/mdLink>/);
  assert.match(lines[1], /<customMessageLabel><\/customMessageLabel>.*<customMessageLabel>Release review<\/customMessageLabel>/);
  assert.match(lines[2], /<success><\/success>.*<success>prime-status<\/success>/);

  assert.equal(lines.length, 4);
  assert.match(plainLines[0], /^╭─ cwd ─+╮$/);
  assert.match(plainLines[1], / .*prime-board.*•.* session: Release review/);
  assert.match(plainLines[2], / worktree: prime-status/);
  assert.match(plainLines[3], /^╰─+╯$/);
  assert.ok(plainLines.every(line => visibleWidth(line) <= 64));
});



test("keeps the built-in footer and renders the cwd card as a TUI widget", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Release review", "tui", true);
  context.ui.theme.fg = (color, text) => `<${color}>${text}</${color}>`;
  context.ui.theme.bold = text => `<bold>${text}</bold>`;
  let footerCalls = 0;
  context.ui.setFooter = () => {
    footerCalls += 1;
  };

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  assert.equal(calls[0][0], "setStatus");
  assert.equal(calls[0][2], undefined);
  assert.equal(calls[1][0], "setWidget");
  assert.ok(Array.isArray(calls[1][2]));
  assert.equal(calls[2][0], "setWidget");
  assert.equal(typeof calls[2][2], "function");
  assert.equal(footerCalls, 0);

  const widget = calls[2][2]({}, context.ui.theme);
  const lines = widget.render(64);
  const plainLines = lines.map(stripThemeMarkup);
  assert.match(lines[0], /<accent><bold>cwd<\/bold><\/accent>/);
  assert.match(lines[1], /<mdLink><\/mdLink>.*prime-board.*<customMessageLabel><\/customMessageLabel>/);
  assert.match(lines[2], /<success><\/success>.*<success>prime-status<\/success>/);
  assert.equal(lines.length, 4);
  assert.match(plainLines[0], /^╭─ cwd ─+╮$/);
  assert.match(plainLines[3], /^╰─+╯$/);

  await handlers.get("session_shutdown")({ type: "session_shutdown" }, context);
  assert.equal(calls[3][0], "setStatus");
  assert.equal(calls[4][0], "setWidget");
  assert.equal(calls[4][2], undefined);
  assert.equal(footerCalls, 0);
});



test("renders the card as a styled string widget for daemon-backed TUI clients", async () => {
  const handlers = createExtension();
  const { calls, context, factoryAttempts } = createContext("Release review", "rpc", true, false);
  context.ui.theme.fg = (color, text) => `<${color}>${text}</${color}>`;
  context.ui.setFooter = () => {};
  context.ui.theme.bold = text => `<bold>${text}</bold>`;

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  assert.equal(calls[0][0], "setStatus");
  assert.equal(calls[0][2], undefined);
  assert.equal(calls[1][0], "setWidget");
  assert.ok(Array.isArray(calls[1][2]));
  assert.equal(factoryAttempts.length, 0);
  const plainLines = calls[1][2].map(stripThemeMarkup);

  assert.equal(plainLines.length, 4);
  assert.equal(plainLines[0].length, 80);
  assert.match(plainLines[0], /^╭─ cwd ─+╮$/);
  assert.match(plainLines[1], / .*prime-board.*•.* session: Release review/);
  assert.match(plainLines[2], / worktree: prime-status/);
  assert.match(plainLines[3], /^╰─+╯$/);
});

test("sanitizes terminal controls and adapts the card at narrow widths", async () => {
  const handlers = createExtension();
  const { calls, context, setSessionName } = createContext("Safe session", "tui", true);
  context.cwd = "/" + "very-long-folder/".repeat(20) + "project";
  setSessionName("Release\n\x1b[31m review");

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  const widget = calls[2][2]({}, context.ui.theme);
  const lines = widget.render(20);
  const plain = lines.map(stripThemeMarkup);

  assert.equal(lines.length, 5);
  assert.ok(plain.every(line => visibleWidth(line) <= 20));
  assert.match(plain[3], /worktree:/);
  assert.ok(!plain.join("").includes("\x1b"));
  assert.ok(!plain.join("").includes("31m"));
  assert.match(plain.join("\n"), /Rele…/);
});


test("keeps TUI rows within the terminal width for grapheme clusters", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("1️⃣", "tui", true);
  context.cwd = "/workspaces/1️⃣";

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  const widget = calls[2][2]({}, context.ui.theme);
  for (const width of [16, 17, 20, 40, 64, 120]) {
    const lines = widget.render(width);
    assert.ok(
      lines.every(line => visibleWidth(line) <= width),
      `rendered line exceeds width ${width}: ${lines.map(visibleWidth)}`,
    );
  }
});

test("bounds zero-width input and removes bidi controls", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("\u0301".repeat(10_000));
  context.cwd = `/repo/\u202e${"\u0301".repeat(10_000)}`;

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  const status = calls[0][2];
  assert.ok(status.length < 200);
  assert.ok(!status.includes("\u0301"));
  assert.ok(!status.includes("\u202e"));
});

test("retries failed worktree detection and clears its cache on shutdown", async () => {
  let worktreeRoot;
  let execCalls = 0;
  const handlers = createExtension(async () => {
    execCalls += 1;
    return worktreeRoot === undefined
      ? { stdout: "", stderr: "not a repository", code: 128, killed: false }
      : { stdout: `/workspaces/${worktreeRoot}\n`, stderr: "", code: 0, killed: false };
  });
  const { calls, context } = createContext("Cache test", "rpc", true);
  const latestCard = () => [...calls]
    .reverse()
    .find(call => call[0] === "setWidget" && Array.isArray(call[2]))[2];

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);
  assert.equal(execCalls, 1);
  assert.match(latestCard()[2], /worktree: \(none\)/);

  worktreeRoot = "first";
  await handlers.get("input")({ type: "input", text: "hello", source: "interactive" }, context);
  assert.equal(execCalls, 2);
  assert.match(latestCard()[2], /worktree: first/);

  worktreeRoot = "second";
  await handlers.get("input")({ type: "input", text: "hello", source: "interactive" }, context);
  assert.equal(execCalls, 2);
  assert.match(latestCard()[2], /worktree: first/);

  await handlers.get("session_shutdown")({ type: "session_shutdown" }, context);
  await handlers.get("input")({ type: "input", text: "hello", source: "interactive" }, context);
  assert.equal(execCalls, 3);
  assert.match(latestCard()[2], /worktree: second/);
});
