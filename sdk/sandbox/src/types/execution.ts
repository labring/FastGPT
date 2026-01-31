/**
 * Options for executing commands.
 */
export interface ExecuteOptions {
  /** Working directory for execution */
  workingDirectory?: string;

  /** Run in background (don't wait for completion) */
  background?: boolean;

  /** Timeout in milliseconds */
  timeoutMs?: number;

  /** Environment variables to set */
  env?: Record<string, string>;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Result of command execution.
 */
export interface ExecuteResult {
  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Exit code (null if not completed) */
  exitCode: number | null;

  /** Whether output was truncated */
  truncated?: boolean;

  /** Execution duration in milliseconds */
  durationMs?: number;
}

/**
 * Output message from streaming execution.
 */
export interface OutputMessage {
  /** Message content */
  text: string;

  /** Timestamp (Unix milliseconds) */
  timestamp?: number;
}

/**
 * Handlers for streaming command output.
 */
export interface StreamHandlers {
  /** Called for each stdout message */
  onStdout?: (msg: OutputMessage) => void | Promise<void>;

  /** Called for each stderr message */
  onStderr?: (msg: OutputMessage) => void | Promise<void>;

  /** Called when execution completes */
  onComplete?: (result: ExecuteResult) => void | Promise<void>;

  /** Called on error */
  onError?: (error: Error) => void | Promise<void>;
}

/**
 * Background execution handle.
 */
export interface BackgroundExecution {
  /** Session ID for the background execution */
  sessionId: string;

  /** Kill the background execution */
  kill(): Promise<void>;
}
