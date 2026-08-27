import { visibleWidth as terminalWidth } from "@earendil-works/pi-tui";
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
const MAX_RAW_DISPLAY_LENGTH = 1024;
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
    // The daemon can emit events before the TUI initializes the theme.
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

type LimitedText = {
  text: string;
  wasLimited: boolean;
};

type PreparedText = {
  segments: string[];
  text: string;
  wasLimited: boolean;
};

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Limit raw display input before width calculations and terminal rendering. */
function limitRawText(value: string, fromEnd = false): LimitedText {
  if (value.length <= MAX_RAW_DISPLAY_LENGTH) {
    return { text: value, wasLimited: false };
  }

  let text = fromEnd
    ? value.slice(-MAX_RAW_DISPLAY_LENGTH)
    : value.slice(0, MAX_RAW_DISPLAY_LENGTH);

  // Do not leave an unpaired UTF-16 surrogate at the truncation boundary.
  if (fromEnd) {
    const first = text.charCodeAt(0);
    if (first >= 0xdc00 && first <= 0xdfff) text = text.slice(1);
  } else {
    const last = text.charCodeAt(text.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) text = text.slice(0, -1);
  }

  return { text, wasLimited: true };
}

/** Remove terminal control sequences before user/session data reaches the TUI. */
function sanitizeDisplayText(value: string, fromEnd = false): string {
  const sanitized = value
    .replace(/\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g, "")
    .replace(/\u009d[\s\S]*?(?:\u0007|\u009c)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u009b[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[ -/]*[@-~]/g, "")
    // Keep ZWJ for valid emoji graphemes, but remove other format controls
    // such as bidi overrides, zero-width spaces, and word joiners.
    .replace(/\p{Cf}/gu, control => (control === "\u200d" ? control : ""))
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
  return limitRawText(sanitized, fromEnd).text.replace(/\s+/g, " ").trim();
}

function graphemeSegments(value: string): string[] {
  return Array.from(graphemeSegmenter.segment(value), part => part.segment);
}

function prepareText(value: string, fromEnd = false): PreparedText {
  const limited = limitRawText(value, fromEnd);
  const segments = graphemeSegments(limited.text).filter(segment => terminalWidth(segment) > 0);
  const text = segments.join("");
  return {
    segments,
    text,
    wasLimited: limited.wasLimited || text.length !== limited.text.length,
  };
}

function textWidth(value: string): number {
  return terminalWidth(value);
}

function truncateText(value: string, maxWidth: number, fromEnd = false): string {
  if (maxWidth <= 0 || value.length === 0) return "";

  const prepared = prepareText(value, fromEnd);
  const ellipsisWidth = textWidth(ELLIPSIS);
  if (!prepared.wasLimited && textWidth(prepared.text) <= maxWidth) return prepared.text;
  if (maxWidth <= ellipsisWidth) return ELLIPSIS;

  const budget = maxWidth - ellipsisWidth;
  if (fromEnd) {
    let result = "";
    for (let index = prepared.segments.length - 1; index >= 0; index -= 1) {
      const next = prepared.segments[index] + result;
      if (textWidth(next) > budget) break;
      result = next;
    }
    return ELLIPSIS + result;
  }

  let result = "";
  for (const segment of prepared.segments) {
    if (textWidth(result + segment) > budget) break;
    result += segment;
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

    const root = sanitizeDisplayText(result.stdout, true).replace(/[\\/]+$/, "");
    const separator = Math.max(root.lastIndexOf("/"), root.lastIndexOf("\\"));
    return root.slice(separator + 1) || root || NO_WORKTREE;
  } catch {
    return NO_WORKTREE;
  }
}

type WorktreeCacheEntry = {
  name: string;
  expiresAt: number;
};

const WORKTREE_CACHE_TTL_MS = 30_000;

function createWorktreeResolver(executor: Pick<ExtensionAPI, "exec">): {
  get(cwd: string): Promise<string>;
  clear(cwd: string): void;
} {
  const cache = new Map<string, WorktreeCacheEntry>();
  const requests = new Map<string, Promise<string>>();
  const generations = new Map<string, number>();

  const get = async (cwd: string): Promise<string> => {
    const cached = cache.get(cwd);
    if (cached !== undefined) {
      if (cached.expiresAt > Date.now()) return cached.name;
      cache.delete(cwd);
    }

    const pending = requests.get(cwd);
    if (pending !== undefined) return pending;

    const requestGeneration = generations.get(cwd) ?? 0;
    let request: Promise<string>;
    request = detectWorktree(executor, cwd)
      .then(worktree => {
        if (worktree !== NO_WORKTREE && (generations.get(cwd) ?? 0) === requestGeneration) {
          cache.set(cwd, {
            name: worktree,
            expiresAt: Date.now() + WORKTREE_CACHE_TTL_MS,
          });
        }
        return worktree;
      })
      .finally(() => {
        if (requests.get(cwd) === request) requests.delete(cwd);
      });
    requests.set(cwd, request);
    return request;
  };

  const clear = (cwd: string): void => {
    cache.delete(cwd);
    generations.set(cwd, (generations.get(cwd) ?? 0) + 1);
    requests.delete(cwd);
  };

  return { get, clear };
}

function hasWidgetUI(ctx: ExtensionContext): boolean {
  // `hasUI` is true for both local TUI contexts and daemon/RPC contexts. Static
  // widgets work in both; component factories are restricted to local TUI mode.
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
      const worktreeBudget = Math.max(0, innerWidth - textWidth(worktreePrefix));
      const worktree = truncateText(worktreeName, worktreeBudget);
      const worktreeRaw = `${worktreePrefix}${worktree}`;
      const worktreeStyled = `${worktreeIcon} ${worktreeLabel} ${safeFg(theme, worktreeColor, worktree)}`;
      const worktreeRow = renderRow(worktreeRaw, worktreeStyled, innerWidth);

      if (available < 14) {
        const pathBudget = Math.max(0, innerWidth - textWidth(pathPrefix));
        const sessionBudget = Math.max(0, innerWidth - textWidth(sessionPrefix));
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

function setCwdWidget(
  ctx: ExtensionContext,
  cwd: string,
  sessionName: string,
  worktreeName: string,
  sessionColor: ThemeColor,
): void {
  const options = { placement: "belowEditor" as const };
  const card = createCwdWidget(cwd, sessionName, worktreeName, sessionColor, contextTheme(ctx));

  // Keep a static version for RPC clients and older hosts that do not support
  // component factories. The local TUI replaces it with the themed component.
  ctx.ui.setWidget(STATUS_KEY, card.render(cardWidth()), options);
  if (ctx.mode !== "tui") return;

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

function updateStatus(ctx: ExtensionContext, worktreeName = NO_WORKTREE): void {
  const namedSession = ctx.sessionManager.getSessionName();
  const cwd = sanitizeDisplayText(ctx.cwd, true);
  const sessionName = sanitizeDisplayText(namedSession ?? UNNAMED_SESSION);
  const sessionColor: ThemeColor = namedSession === undefined ? "warning" : SESSION_ICON_COLOR;

  if (hasWidgetUI(ctx)) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    setCwdWidget(ctx, cwd, sessionName, worktreeName, sessionColor);
    return;
  }

  // Keep a simple protocol-friendly representation for other headless clients.
  const status = buildStatus(cwd, sessionName, sessionColor, contextTheme(ctx));
  ctx.ui.setStatus(STATUS_KEY, status);
  ctx.ui.setWidget(STATUS_KEY, [status], { placement: "belowEditor" });
}

export default function primeStatus(pi: ExtensionAPI): void {
  const worktreeResolver = createWorktreeResolver(pi);
  let refreshGeneration = 0;
  const refresh = async (_event: unknown, ctx: ExtensionContext): Promise<void> => {
    const generation = ++refreshGeneration;
    const worktreeName = hasWidgetUI(ctx)
      ? await worktreeResolver.get(ctx.cwd)
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
    worktreeResolver.clear(ctx.cwd);
    ctx.ui.setStatus(STATUS_KEY, undefined);
    ctx.ui.setWidget(STATUS_KEY, undefined);
  });
}
