import assert from "node:assert/strict";
import test from "node:test";

import primeStatus from "../dist/index.js";

function createExtension() {
  const handlers = new Map();
  primeStatus({
    on(event, handler) {
      handlers.set(event, handler);
    },
  });
  return handlers;
}

function createContext(sessionName) {
  const calls = [];
  return {
    calls,
    context: {
      cwd: "/workspaces/prime-board",
      sessionManager: {
        getSessionName: () => sessionName,
      },
      ui: {
        theme: {
          fg: (_color, text) => text,
        },
        setStatus: (...args) => calls.push(["setStatus", ...args]),
        setWidget: (...args) => calls.push(["setWidget", ...args]),
      },
    },
  };
}

test("publishes cwd and the current session name", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Release review");

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  assert.deepEqual(calls, [
    ["setStatus", "prime-status", "cwd: /workspaces/prime-board | session: Release review"],
    ["setWidget", "prime-status", ["cwd: /workspaces/prime-board | session: Release review"], { placement: "belowEditor" }],
  ]);
});

test("uses theme colors for labels, values, and an unnamed session", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext(undefined);
  context.ui.theme.fg = (color, text) => `<${color}>${text}</${color}>`;

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  const status =
    "<muted>cwd:</muted> <accent>/workspaces/prime-board</accent><dim> | </dim>" +
    "<muted>session:</muted> <warning>(unnamed)</warning>";
  assert.deepEqual(calls, [
    ["setStatus", "prime-status", status],
    ["setWidget", "prime-status", [status], { placement: "belowEditor" }],
  ]);
});

test("uses accent color for a named session", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Release review");
  context.ui.theme.fg = (color, text) => `<${color}>${text}</${color}>`;

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  const status =
    "<muted>cwd:</muted> <accent>/workspaces/prime-board</accent><dim> | </dim>" +
    "<muted>session:</muted> <accent>Release review</accent>";
  assert.deepEqual(calls, [
    ["setStatus", "prime-status", status],
    ["setWidget", "prime-status", [status], { placement: "belowEditor" }],
  ]);
});

test("refreshes when a prompt is entered", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Prompt session");

  await handlers.get("input")({ type: "input", text: "hello", source: "interactive" }, context);

  assert.deepEqual(calls, [
    ["setStatus", "prime-status", "cwd: /workspaces/prime-board | session: Prompt session"],
    ["setWidget", "prime-status", ["cwd: /workspaces/prime-board | session: Prompt session"], { placement: "belowEditor" }],
  ]);
});

test("uses a visible fallback when the session has no name", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext(undefined);

  await handlers.get("turn_start")({ type: "turn_start", turnIndex: 0, timestamp: 0 }, context);

  assert.deepEqual(calls, [
    ["setStatus", "prime-status", "cwd: /workspaces/prime-board | session: (unnamed)"],
    ["setWidget", "prime-status", ["cwd: /workspaces/prime-board | session: (unnamed)"], { placement: "belowEditor" }],
  ]);
});

test("refreshes on turns and clears on shutdown", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Named session");

  await handlers.get("turn_end")({ type: "turn_end" }, context);
  await handlers.get("session_shutdown")({ type: "session_shutdown" }, context);

  assert.deepEqual(calls, [
    ["setStatus", "prime-status", "cwd: /workspaces/prime-board | session: Named session"],
    ["setWidget", "prime-status", ["cwd: /workspaces/prime-board | session: Named session"], { placement: "belowEditor" }],
    ["setStatus", "prime-status", undefined],
    ["setWidget", "prime-status", undefined],
  ]);
});
