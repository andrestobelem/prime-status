import type { ExtensionAPI, ExtensionContext, ThemeColor } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "prime-status";
const UNNAMED_SESSION = "(unnamed)";
const CWD_ICON = "";
const SESSION_ICON = "";
const WORKTREE_ICON = "";
const CARD_BORDER_COLOR: ThemeColor = "border";
const CARD_TITLE_COLOR: ThemeColor = "accent";
const CWD_COLOR: ThemeColor = "mdLink";
const SESSION_ICON_COLOR: ThemeColor = "customMessageLabel";
const WORKTREE_COLOR: ThemeColor = "success";
const SEGMENT_SEPARATOR = "  ";
const ELLIPSIS = "…";
const NO_WORKTREE = "(none)";
const MAX_STATUS_VALUE_WIDTH = 160;
const MIN_CARD_WIDTH = 40;
const MAX_CARD_WIDTH = 120;
const DEFAULT_CARD_WIDTH = 80;

type WidgetTheme = {
  fg(color: ThemeColor, text: string): string;
  bold(text: string): string;
};

type WidgetComponent = {
  render(width: number): string[];
  invalidate(): void;
};

function safeFg(theme: WidgetTheme, color: ThemeColor, text: string): string {
  try {
    return theme.fg(color, text);
  } catch {
    // El daemon puede emitir eventos antes de que la TUI inicialice el tema.
    return text;
  }
}

function safeBold(theme: WidgetTheme, text: string): string {
  try {
    return theme.bold(text);
  } catch {
    return text;
  }
}

/** Remove terminal control sequences before user/session data reaches the TUI. */
function sanitizeDisplayText(value: string): string {
  return value
    .replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g, "")
    .replace(/\u009d[\s\S]*?(?:\u0007|\u009c)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u009b[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      /\p{Mark}/u.test(character) ||
      (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
      codePoint === 0x200d
    ) {
      continue;
    }
    const wide =
      (codePoint >= 0x1100 && codePoint <= 0x115f) ||
      (codePoint >= 0x2329 && codePoint <= 0x232a) ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xff01 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff);
    width += wide ? 2 : 1;
  }
  return width;
}

function truncateText(value: string, maxWidth: number, fromEnd = false): string {
  if (maxWidth <= 0) return "";
  if (textWidth(value) <= maxWidth) return value;
  if (maxWidth === 1) return ELLIPSIS;

  const budget = maxWidth - textWidth(ELLIPSIS);
  const characters = Array.from(value);
  if (fromEnd) {
    let result = "";
    for (let index = characters.length - 1; index >= 0; index -= 1) {
      const next = characters[index] + result;
      if (textWidth(next) > budget) break;
      result = next;
    }
    return ELLIPSIS + result;
  }

  let result = "";
  for (const character of characters) {
    if (textWidth(result + character) > budget) break;
    result += character;
  }
  return result + ELLIPSIS;
}

function truncatePath(value: string, maxWidth: number): string {
  return truncateText(value, maxWidth, true);
}

async function detectWorktree(executor: Pick<ExtensionAPI, "exec">, cwd: string): Promise<string> {
  if (typeof executor.exec !== "function") return NO_WORKTREE;

  try {
    const result = await executor.exec("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      timeout: 500,
    });
    if (result.code !== 0) return NO_WORKTREE;

    const root = sanitizeDisplayText(result.stdout).replace(/[\\/]+$/, "");
    const separator = Math.max(root.lastIndexOf("/"), root.lastIndexOf("\\"));
    return root.slice(separator + 1) || root || NO_WORKTREE;
  } catch {
    return NO_WORKTREE;
  }
}

const worktreeCache = new Map<string, string>();
const worktreeRequests = new Map<string, Promise<string>>();

async function getWorktree(executor: Pick<ExtensionAPI, "exec">, cwd: string): Promise<string> {
  const cached = worktreeCache.get(cwd);
  if (cached !== undefined) return cached;

  const pending = worktreeRequests.get(cwd);
  if (pending !== undefined) return pending;

  const request = detectWorktree(executor, cwd)
    .then(worktree => {
      worktreeCache.set(cwd, worktree);
      return worktree;
    })
    .finally(() => {
      worktreeRequests.delete(cwd);
    });
  worktreeRequests.set(cwd, request);
  return request;
}

function hasWidgetUI(ctx: ExtensionContext): boolean {
  // `hasUI` is true for both local TUI contexts and daemon/RPC contexts. The latter
  // accept only string-array widgets, so updateStatus publishes a static fallback
  // before attempting the component factory.
  return ctx.hasUI === true;
}

function contextTheme(ctx: ExtensionContext): WidgetTheme {
  return {
    fg: (color, text) => {
      try {
        return ctx.ui.theme.fg(color, text);
      } catch {
        return text;
      }
    },
    bold: text => {
      try {
        return ctx.ui.theme.bold(text);
      } catch {
        return text;
      }
    },
  };
}

function cardWidth(): number {
  const processColumns = process.stdout.columns;
  const environmentColumns = Number(process.env.COLUMNS);
  const columns = Number.isFinite(processColumns) && processColumns > 0
    ? processColumns
    : Number.isFinite(environmentColumns) && environmentColumns > 0
      ? environmentColumns
      : undefined;
  return columns === undefined
    ? DEFAULT_CARD_WIDTH
    : Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, columns));
}

function buildStatus(
  cwd: string,
  sessionName: string,
  sessionColor: ThemeColor,
  theme: WidgetTheme,
): string {
  const boundedCwd = truncatePath(cwd, MAX_STATUS_VALUE_WIDTH);
  const boundedSession = truncateText(sessionName, MAX_STATUS_VALUE_WIDTH);
  return (
    `${safeFg(theme, CWD_COLOR, CWD_ICON)} ${safeFg(theme, "muted", "cwd:")} ${safeFg(theme, CWD_COLOR, boundedCwd)}` +
    safeFg(theme, "dim", SEGMENT_SEPARATOR) +
    `${safeFg(theme, SESSION_ICON_COLOR, SESSION_ICON)} ${safeFg(theme, "muted", "session:")} ` +
    safeFg(theme, sessionColor, boundedSession)
  );
}

function createCwdWidget(
  cwd: string,
  sessionName: string,
  worktreeName: string,
  sessionColor: ThemeColor,
  theme: WidgetTheme,
): WidgetComponent {
  const border = (text: string): string => safeFg(theme, CARD_BORDER_COLOR, text);
  const renderRow = (rawContent: string, styledContent: string, innerWidth: number): string => {
    const padding = " ".repeat(Math.max(0, innerWidth - textWidth(rawContent)));
    return `${border("│")} ${styledContent}${padding} ${border("│")}`;
  };

  return {
    render(width: number): string[] {
      const cardWidth = Number.isFinite(width) ? Math.max(1, Math.floor(width)) : 1;
      if (cardWidth < 16) {
        const compact = `${CWD_ICON} ${truncatePath(cwd, Math.max(1, cardWidth - 2))}`;
        return [truncateText(compact, cardWidth)];
      }

      const innerWidth = cardWidth - 4;
      const pathPrefix = `${CWD_ICON} `;
      const sessionPrefix = `${SESSION_ICON} session: `;
      const worktreePrefix = `${WORKTREE_ICON} worktree: `;
      const separator = "  •  ";
      const available = innerWidth - textWidth(pathPrefix) - textWidth(sessionPrefix) - textWidth(separator);
      const title = safeFg(theme, CARD_TITLE_COLOR, safeBold(theme, "cwd"));
      const pathIcon = safeFg(theme, CWD_COLOR, CWD_ICON);
      const sessionIcon = safeFg(theme, SESSION_ICON_COLOR, SESSION_ICON);
      const sessionLabel = safeFg(theme, "muted", "session:");
      const worktreeIcon = safeFg(
        theme,
        worktreeName === NO_WORKTREE ? "dim" : WORKTREE_COLOR,
        WORKTREE_ICON,
      );
      const worktreeLabel = safeFg(theme, "muted", "worktree:");
      const worktreeColor: ThemeColor = worktreeName === NO_WORKTREE ? "dim" : WORKTREE_COLOR;
      const bottom = border(`╰${"─".repeat(cardWidth - 2)}╯`);
      const topFill = Math.max(1, cardWidth - 8);
      const top = `${border("╭─ ")}${title}${border(` ${"─".repeat(topFill)}╮`)}`;
      const worktreeBudget = Math.max(1, innerWidth - textWidth(worktreePrefix));
      const worktree = truncateText(worktreeName, worktreeBudget);
      const worktreeRaw = `${worktreePrefix}${worktree}`;
      const worktreeStyled = `${worktreeIcon} ${worktreeLabel} ${safeFg(theme, worktreeColor, worktree)}`;
      const worktreeRow = renderRow(worktreeRaw, worktreeStyled, innerWidth);

      if (available < 14) {
        const pathBudget = Math.max(1, innerWidth - textWidth(pathPrefix));
        const sessionBudget = Math.max(1, innerWidth - textWidth(sessionPrefix));
        const path = truncatePath(cwd, pathBudget);
        const session = truncateText(sessionName, sessionBudget);
        const pathRaw = `${pathPrefix}${path}`;
        const sessionRaw = `${sessionPrefix}${session}`;
        const pathStyled = `${pathIcon} ${safeFg(theme, CWD_COLOR, path)}`;
        const sessionStyled = `${sessionIcon} ${sessionLabel} ${safeFg(theme, sessionColor, session)}`;
        return [
          top,
          renderRow(pathRaw, pathStyled, innerWidth),
          renderRow(sessionRaw, sessionStyled, innerWidth),
          worktreeRow,
          bottom,
        ];
      }

      const pathBudget = Math.max(1, Math.floor(available * 0.64));
      const sessionBudget = available - pathBudget;
      const path = truncatePath(cwd, pathBudget);
      const session = truncateText(sessionName, sessionBudget);
      const rawContent = `${pathPrefix}${path}${separator}${sessionPrefix}${session}`;
      const styledSeparator = safeFg(theme, "dim", separator);
      const styledContent =
        `${pathIcon} ${safeFg(theme, CWD_COLOR, path)}${styledSeparator}` +
        `${sessionIcon} ${sessionLabel} ${safeFg(theme, sessionColor, session)}`;
      return [top, renderRow(rawContent, styledContent, innerWidth), worktreeRow, bottom];
    },
    invalidate(): void {
      // The widget renders from the current theme on every paint.
    },
  };
}

function installCwdFooter(
  ctx: ExtensionContext,
  cwd: string,
  sessionName: string,
  worktreeName: string,
  sessionColor: ThemeColor,
): boolean {
  if (typeof ctx.ui.setFooter !== "function") return false;

  let installed = false;
  try {
    // Local interactive hosts invoke the factory immediately. Daemon/RPC contexts
    // expose setFooter as a no-op, so the callback is also our capability check.
    ctx.ui.setFooter((_tui, theme) => {
      installed = true;
      return createCwdWidget(cwd, sessionName, worktreeName, sessionColor, theme);
    });
  } catch {
    installed = false;
  }
  return installed;
}

function updateStatus(ctx: ExtensionContext, worktreeName = NO_WORKTREE): void {
  const namedSession = ctx.sessionManager.getSessionName();
  const cwd = sanitizeDisplayText(ctx.cwd);
  const sessionName = sanitizeDisplayText(namedSession ?? UNNAMED_SESSION);
  const sessionColor: ThemeColor = namedSession === undefined ? "warning" : SESSION_ICON_COLOR;

  if (hasWidgetUI(ctx)) {
    const options = { placement: "belowEditor" as const };
    const card = createCwdWidget(cwd, sessionName, worktreeName, sessionColor, contextTheme(ctx));

    ctx.ui.setStatus(STATUS_KEY, undefined);
    if (installCwdFooter(ctx, cwd, sessionName, worktreeName, sessionColor)) {
      // The footer is in the prompt dock, directly below the built-in agents line.
      // Clear any fallback widget left by a previous daemon-backed render.
      ctx.ui.setWidget(STATUS_KEY, undefined);
    } else {
      // Daemon/RPC hosts silently ignore component factories and custom footers.
      // Keep a rendered fallback for those clients and older interactive hosts.
      ctx.ui.setWidget(STATUS_KEY, card.render(cardWidth()), options);
      try {
        ctx.ui.setWidget(
          STATUS_KEY,
          (_tui, theme) => createCwdWidget(cwd, sessionName, worktreeName, sessionColor, theme),
          options,
        );
      } catch {
        // Older hosts may reject component factories; the static card remains visible.
      }
    }
    return;
  }

  // Keep a simple protocol-friendly representation for other headless clients.
  const status = buildStatus(cwd, sessionName, sessionColor, contextTheme(ctx));
  ctx.ui.setStatus(STATUS_KEY, status);
  ctx.ui.setWidget(STATUS_KEY, [status], { placement: "belowEditor" });
}

export default function primeStatus(pi: ExtensionAPI): void {
  let refreshGeneration = 0;
  const refresh = async (_event: unknown, ctx: ExtensionContext): Promise<void> => {
    const generation = ++refreshGeneration;
    const worktreeName = hasWidgetUI(ctx)
      ? await getWorktree(pi, ctx.cwd)
      : NO_WORKTREE;
    if (generation !== refreshGeneration) return;
    updateStatus(ctx, worktreeName);
  };

  pi.on("session_start", refresh);
  pi.on("session_info_changed", refresh);
  pi.on("input", refresh);
  pi.on("turn_start", refresh);
  pi.on("turn_end", refresh);
  pi.on("session_shutdown", async (_event, ctx) => {
    refreshGeneration += 1;
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(STATUS_KEY, undefined);
    if (typeof ctx.ui.setFooter === "function") {
      ctx.ui.setFooter(undefined);
    }
  });
}
