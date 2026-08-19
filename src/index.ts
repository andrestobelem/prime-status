import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "prime-status";
const UNNAMED_SESSION = "(unnamed)";

function updateStatus(ctx: ExtensionContext): void {
  const namedSession = ctx.sessionManager.getSessionName();
  const sessionName = namedSession ?? UNNAMED_SESSION;
  const sessionColor = namedSession === undefined ? "warning" : "accent";
  const theme = ctx.ui.theme;
  const status =
    `${theme.fg("muted", "cwd:")} ${theme.fg("accent", ctx.cwd)}` +
    `${theme.fg("dim", " | ")}${theme.fg("muted", "session:")} ` +
    theme.fg(sessionColor, sessionName);
  ctx.ui.setStatus(STATUS_KEY, status);
  ctx.ui.setWidget(STATUS_KEY, [status], { placement: "belowEditor" });
}

export default function primeStatus(pi: ExtensionAPI): void {
  const refresh = async (_event: unknown, ctx: ExtensionContext): Promise<void> => {
    updateStatus(ctx);
  };

  pi.on("session_start", refresh);
  pi.on("input", refresh);
  pi.on("turn_start", refresh);
  pi.on("turn_end", refresh);
  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(STATUS_KEY, undefined);
  });
}
