import type {
  BackgroundExecution,
  ExecuteOptions,
  ExecuteResult,
  ExecuteStreamOptions
} from '../types';

/** Command execution contract shared by sandbox providers. */
export type ICommandExecution = {
  /** Execute a command and wait for its result. */
  execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;

  /**
   * Execute a command with real-time output callbacks.
   * Providers whose `capabilities.command.streaming` is false must reject this operation.
   */
  executeStream(command: string, options: ExecuteStreamOptions): Promise<void>;

  /** Start a background command and return its provider session handle. */
  executeBackground(command: string, options?: ExecuteOptions): Promise<BackgroundExecution>;

  /** Interrupt a provider command session. */
  interrupt(sessionId: string): Promise<void>;
};
