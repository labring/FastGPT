import { SandboxException } from './SandboxException';

/**
 * Error codes specific to file operations.
 */
export type FileErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'PATH_IS_DIRECTORY'
  | 'PATH_NOT_DIRECTORY'
  | 'INVALID_PATH'
  | 'QUOTA_EXCEEDED'
  | 'TRANSFER_ERROR';

/**
 * Thrown when a file operation fails.
 */
export class FileOperationError extends SandboxException {
  constructor(
    message: string,
    public readonly path: string,
    public readonly fileErrorCode: FileErrorCode,
    cause?: unknown
  ) {
    super(message, fileErrorCode, cause);
    this.name = 'FileOperationError';
    Object.setPrototypeOf(this, FileOperationError.prototype);
  }
}
