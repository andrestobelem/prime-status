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
        setStatus: (...args) => calls.push(args),
      },
    },
  };
}

test("publishes cwd and the current session name", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Release review");

  await handlers.get("session_start")({ type: "session_start", reason: "startup" }, context);

  assert.deepEqual(calls, [["prime-status", "cwd: /workspaces/prime-board | session: Release review"]]);
});

test("uses a visible fallback when the session has no name", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext(undefined);

  await handlers.get("turn_start")({ type: "turn_start", turnIndex: 0, timestamp: 0 }, context);

  assert.deepEqual(calls, [["prime-status", "cwd: /workspaces/prime-board | session: (unnamed)"]]);
});

test("refreshes on turns and clears on shutdown", async () => {
  const handlers = createExtension();
  const { calls, context } = createContext("Named session");

  await handlers.get("turn_end")({ type: "turn_end" }, context);
  await handlers.get("session_shutdown")({ type: "session_shutdown" }, context);

  assert.deepEqual(calls, [
    ["prime-status", "cwd: /workspaces/prime-board | session: Named session"],
    ["prime-status", undefined],
  ]);
});
