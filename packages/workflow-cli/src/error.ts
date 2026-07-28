export class CliArgumentError extends Error {
  constructor(
    message: string,
    readonly params?: Record<string, unknown>,
    readonly code = 'CLI_ARGUMENT_INVALID'
  ) {
    super(message);
    this.name = 'CliArgumentError';
  }
}
