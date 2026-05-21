import { SandboxException } from './SandboxException';

/**
 * Thrown when command execution fails.
 */
export class CommandExecutionError extends SandboxException {
  public readonly exitCode?: number;
  public readonly stdout?: string;
  public readonly stderr?: string;
  public readonly commandError?: Error;

  constructor(
    message: string,
    public readonly command: string,
    exitCodeOrCause?: number | Error,
    stdout?: string,
    stderr?: string
  ) {
    super(
      message,
      'COMMAND_FAILED',
      exitCodeOrCause instanceof Error ? exitCodeOrCause : undefined
    );
    this.name = 'CommandExecutionError';
    Object.setPrototypeOf(this, CommandExecutionError.prototype);

    if (exitCodeOrCause instanceof Error) {
      this.commandError = exitCodeOrCause;
    } else {
      this.exitCode = exitCodeOrCause;
      this.stdout = stdout;
      this.stderr = stderr;
    }
  }

  /**
   * Returns the combined output (stdout + stderr).
   */
  getCombinedOutput(): string {
    let output = this.stdout || '';
    if (this.stderr) {
      output += output ? `\n${this.stderr}` : this.stderr;
    }
    return output;
  }
}
