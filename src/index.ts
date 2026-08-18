import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "prime-status";
const UNNAMED_SESSION = "(unnamed)";

function updateStatus(ctx: ExtensionContext): void {
  const sessionName = ctx.sessionManager.getSessionName() ?? UNNAMED_SESSION;
  ctx.ui.setStatus(STATUS_KEY, `cwd: ${ctx.cwd} | session: ${sessionName}`);
}

export default function primeStatus(pi: ExtensionAPI): void {
  const refresh = async (_event: unknown, ctx: ExtensionContext): Promise<void> => {
    updateStatus(ctx);
  };

  pi.on("session_start", refresh);
  pi.on("turn_start", refresh);
  pi.on("turn_end", refresh);
  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });
}
