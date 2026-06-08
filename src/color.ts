/**
 * Minimal ANSI color utilities to replace chalk.
 * Supports bold and cyan only, matching current usage.
 * Automatically disables colors when:
 *   - NO_COLOR env is set (respects https://no-color.org)
 *   - stdout is not a TTY (e.g. piped to a file)
 * Unless FORCE_COLOR env is set to a non-zero value.
 */

const ANSI_BOLD = "\x1b[1m";
const ANSI_BOLD_OFF = "\x1b[22m";
const ANSI_CYAN = "\x1b[36m";
const ANSI_COLOR_OFF = "\x1b[39m";

/** Determine whether ANSI colors should be emitted. */
export function isColorEnabled(): boolean {
  if (process.env.FORCE_COLOR === "0") {
    return false;
  }
  if (process.env.FORCE_COLOR) {
    return true;
  }
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.stdout && !process.stdout.isTTY) {
    return false;
  }
  return true;
}

function wrap(open: string, close: string, text: string | number): string {
  if (!isColorEnabled()) {
    return String(text);
  }
  return open + String(text) + close;
}

export function bold(text: string | number): string {
  return wrap(ANSI_BOLD, ANSI_BOLD_OFF, text);
}

export function cyan(text: string | number): string {
  return wrap(ANSI_CYAN, ANSI_COLOR_OFF, text);
}
