/**
 * Browser error logger that keeps track of the last 10 errors
 */

export interface ErrorLog {
  timestamp: number;
  type: 'console.error' | 'runtime.error' | 'unhandled.rejection';
  message: string;
  stack?: string;
  url?: string;
  line?: number;
  column?: number;
}

class ErrorLogger {
  private maxLogs = 20;
  private logs: ErrorLog[] = [];
  private isInitialized = false;
  private originalConsoleError: typeof console.error;

  constructor() {
    this.originalConsoleError = console.error;
  }

  /**
   * Initialize error logger, override console.error and setup global error handlers
   */
  init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // Override console.error
    this.overrideConsoleError();

    // Setup global error handlers
    this.setupGlobalErrorHandlers();
  }

  /**
   * Override console.error to capture error logs
   */
  private overrideConsoleError() {
    const self = this;
    console.error = function (...args: any[]) {
      // Call original console.error
      self.originalConsoleError.apply(console, args);

      // Capture error log
      try {
        const message = args
          .map((arg) => {
            if (arg instanceof Error) {
              return arg.message;
            }
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          })
          .join(' ');

        const stack = args.find((arg) => arg instanceof Error)?.stack;

        self.addLog({
          timestamp: Date.now(),
          type: 'console.error',
          message,
          stack
        });
      } catch (e) {
        // Silently fail to avoid infinite loop
      }
    };
  }

  /**
   * Setup global error handlers for uncaught errors and unhandled promise rejections
   */
  private setupGlobalErrorHandlers() {
    // Capture JavaScript runtime errors
    window.addEventListener('error', (event) => {
      this.addLog({
        timestamp: Date.now(),
        type: 'runtime.error',
        message: event.message || 'Unknown error',
        stack: event.error?.stack,
        url: event.filename,
        line: event.lineno,
        column: event.colno
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : JSON.stringify(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;

      this.addLog({
        timestamp: Date.now(),
        type: 'unhandled.rejection',
        message: `Unhandled Promise Rejection: ${message}`,
        stack
      });
    });
  }

  /**
   * Add a new error log, maintaining only the last 10 logs
   */
  private addLog(log: ErrorLog) {
    this.logs.push(log);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  /**
   * Get all error logs as formatted string
   */
  getLogs(): string {
    if (this.logs.length === 0) {
      return '暂无错误日志';
    }

    return this.logs
      .map((log, index) => {
        const timestamp = new Date(log.timestamp).toLocaleString('zh-CN');
        let logStr = `[${index + 1}] ${timestamp} - [${log.type}]\n`;
        logStr += `Message: ${log.message}\n`;

        if (log.url) {
          logStr += `Location: ${log.url}`;
          if (log.line !== undefined) logStr += `:${log.line}`;
          if (log.column !== undefined) logStr += `:${log.column}`;
          logStr += '\n';
        }

        if (log.stack) {
          logStr += `Stack: ${log.stack}\n`;
        }

        return logStr;
      })
      .join('\n---\n\n');
  }

  /**
   * Clear all error logs
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * Restore original console.error (useful for cleanup)
   */
  restore() {
    if (this.isInitialized) {
      console.error = this.originalConsoleError;
      this.isInitialized = false;
    }
  }
}

// Create singleton instance
export const errorLogger = new ErrorLogger();
