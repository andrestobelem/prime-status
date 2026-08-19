import type { ExtensionAPI, ExtensionContext, ThemeColor } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "prime-status";
const UNNAMED_SESSION = "(unnamed)";
const CWD_ICON = "";
const SESSION_ICON = "";
const SEGMENT_SEPARATOR = "  ";

function updateStatus(ctx: ExtensionContext): void {
  const namedSession = ctx.sessionManager.getSessionName();
  const sessionName = namedSession ?? UNNAMED_SESSION;
  const sessionColor = namedSession === undefined ? "warning" : "accent";
  const fg = (color: ThemeColor, text: string): string => {
    try {
      return ctx.ui.theme.fg(color, text);
    } catch {
      // El daemon puede emitir eventos antes de que la TUI inicialice el tema.
      return text;
    }
  };
  const status =
    `${fg("accent", CWD_ICON)} ${fg("muted", "cwd:")} ${fg("accent", ctx.cwd)}` +
    fg("dim", SEGMENT_SEPARATOR) +
    `${fg("accent", SESSION_ICON)} ${fg("muted", "session:")} ` +
    fg(sessionColor, sessionName);
  ctx.ui.setStatus(STATUS_KEY, status);
  ctx.ui.setWidget(STATUS_KEY, [status], { placement: "belowEditor" });
}

export default function primeStatus(pi: ExtensionAPI): void {
  const refresh = async (_event: unknown, ctx: ExtensionContext): Promise<void> => {
    updateStatus(ctx);
  };

  pi.on("session_start", refresh);
  pi.on("session_info_changed", refresh);
  pi.on("input", refresh);
  pi.on("turn_start", refresh);
  pi.on("turn_end", refresh);
  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(STATUS_KEY, undefined);
  });
}
