import type { ICommandExecution } from '../../src/interfaces';
import type { ExecuteOptions, ExecuteResult, StreamHandlers } from '../../src/types';

/**
 * Mock implementation of ICommandExecution for testing.
 */
export class MockCommandExecution implements ICommandExecution {
  private commands: Map<string, ExecuteResult> = new Map();
  private executedCommands: { command: string; options?: ExecuteOptions }[] = [];

  /**
   * Register a mock response for a command.
   */
  mockCommand(command: string, result: ExecuteResult): void {
    this.commands.set(command, result);
  }

  /**
   * Get list of executed commands for verification.
   */
  getExecutedCommands(): { command: string; options?: ExecuteOptions }[] {
    return [...this.executedCommands];
  }

  /**
   * Clear all mock commands and execution history.
   */
  clear(): void {
    this.commands.clear();
    this.executedCommands = [];
  }

  async execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    this.executedCommands.push({ command, options });

    // Check for exact match
    if (this.commands.has(command)) {
      const result = this.commands.get(command);
      if (result) {
        return result;
      }
    }

    // Check for partial match (for commands with dynamic parts)
    for (const [key, result] of this.commands) {
      if (command.includes(key) || key.includes(command)) {
        return result;
      }
    }

    // Default response
    return {
      stdout: '',
      stderr: '',
      exitCode: 0
    };
  }

  async executeStream(
    command: string,
    handlers: StreamHandlers,
    options?: ExecuteOptions
  ): Promise<void> {
    const result = await this.execute(command, options);

    if (handlers.onStdout && result.stdout) {
      await handlers.onStdout({ text: result.stdout });
    }
    if (handlers.onStderr && result.stderr) {
      await handlers.onStderr({ text: result.stderr });
    }
    if (handlers.onComplete) {
      await handlers.onComplete(result);
    }
  }

  async executeBackground(
    command: string,
    options?: ExecuteOptions
  ): Promise<{ sessionId: string; kill(): Promise<void> }> {
    await this.execute(command, options);
    return {
      sessionId: `mock-${Date.now()}`,
      kill: async () => {
        // No-op
      }
    };
  }

  async interrupt(_sessionId: string): Promise<void> {
    // No-op in mock
  }
}
