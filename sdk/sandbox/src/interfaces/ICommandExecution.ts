import type { ExecuteOptions, ExecuteResult, StreamHandlers } from '../types';

/**
 * Interface for command execution within a sandbox.
 * Follows Interface Segregation Principle.
 */
export interface ICommandExecution {
  /**
   * Execute a command and wait for completion.
   * @param command The command to execute
   * @param options Execution options
   * @returns Execution result with stdout, stderr, and exit code
   * @throws {CommandExecutionError} If command fails
   * @throws {TimeoutError} If execution times out
   */
  execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;

  /**
   * Execute a command with streaming output.
   * Provides real-time access to stdout/stderr via handlers.
   * @param command The command to execute
   * @param handlers Stream handlers for output
   * @param options Execution options
   * @throws {CommandExecutionError} If command fails
   */
  executeStream(command: string, handlers: StreamHandlers, options?: ExecuteOptions): Promise<void>;

  /**
   * Execute a command in the background.
   * Returns immediately with a handle to control the execution.
   * @param command The command to execute
   * @param options Execution options
   * @returns Handle for background execution
   */
  executeBackground(
    command: string,
    options?: ExecuteOptions
  ): Promise<{ sessionId: string; kill(): Promise<void> }>;

  /**
   * Interrupt/kill a running command session.
   * @param sessionId The session ID from executeBackground
   */
  interrupt(sessionId: string): Promise<void>;
}
