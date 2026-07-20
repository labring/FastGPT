export class CliArgumentError extends Error {
  readonly code = 'CLI_ARGUMENT_INVALID';

  constructor(
    message: string,
    readonly params?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CliArgumentError';
  }
}
