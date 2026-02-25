/**
 * Logger utility for sandbox server
 * Provides structured, formatted logging with color support
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const levelColors: Record<LogLevel, string> = {
  DEBUG: colors.gray,
  INFO: colors.green,
  WARN: colors.yellow,
  ERROR: colors.red
};

const methodColors: Record<string, string> = {
  GET: colors.cyan,
  POST: colors.green,
  PUT: colors.yellow,
  PATCH: colors.yellow,
  DELETE: colors.red
};

/**
 * Format timestamp as HH:mm:ss.SSS
 */
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Format duration with appropriate unit
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Get color for HTTP status code
 */
function getStatusColor(status: number): string {
  if (status >= 500) return colors.red;
  if (status >= 400) return colors.yellow;
  if (status >= 300) return colors.cyan;
  if (status >= 200) return colors.green;
  return colors.white;
}

/**
 * Core log function
 */
function log(
  level: LogLevel,
  category: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const now = new Date();
  const time = formatTime(now);
  const levelColor = levelColors[level];
  const levelStr = level.padEnd(5);

  let output = `${colors.dim}${time}${colors.reset} ${levelColor}${levelStr}${colors.reset} ${colors.bright}[${category}]${colors.reset} ${message}`;

  if (meta && Object.keys(meta).length > 0) {
    const metaStr = Object.entries(meta)
      .map(([k, v]) => `${colors.dim}${k}=${colors.reset}${v}`)
      .join(' ');
    output += ` ${metaStr}`;
  }

  console.log(output);
}

/**
 * Logger interface
 */
export const logger = {
  debug: (category: string, message: string, meta?: Record<string, unknown>) =>
    log('DEBUG', category, message, meta),

  info: (category: string, message: string, meta?: Record<string, unknown>) =>
    log('INFO', category, message, meta),

  warn: (category: string, message: string, meta?: Record<string, unknown>) =>
    log('WARN', category, message, meta),

  error: (category: string, message: string, meta?: Record<string, unknown>) =>
    log('ERROR', category, message, meta),

  /**
   * Log HTTP request start
   */
  httpRequest: (method: string, path: string) => {
    const methodColor = methodColors[method] || colors.white;
    const methodStr = method.padEnd(6);
    log(
      'INFO',
      'HTTP',
      `${colors.bright}-->${colors.reset} ${methodColor}${methodStr}${colors.reset} ${path}`
    );
  },

  /**
   * Log HTTP response
   */
  httpResponse: (
    method: string,
    path: string,
    status: number,
    duration: number,
    error?: string
  ) => {
    const methodColor = methodColors[method] || colors.white;
    const statusColor = getStatusColor(status);
    const methodStr = method.padEnd(6);
    const durationStr = formatDuration(duration);
    const level: LogLevel = status >= 400 ? 'ERROR' : 'INFO';

    let message = `${colors.bright}<--${colors.reset} ${methodColor}${methodStr}${colors.reset} ${path} ${statusColor}${status}${colors.reset} ${colors.dim}${durationStr}${colors.reset}`;

    if (error) {
      message += ` ${colors.red}${error}${colors.reset}`;
    }

    log(level, 'HTTP', message);
  }
};

export default logger;
