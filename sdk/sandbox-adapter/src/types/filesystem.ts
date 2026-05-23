/**
 * File information/metadata.
 */
export interface FileInfo {
  path: string;
  size?: number;
  modifiedAt?: Date;
  createdAt?: Date;
  mode?: number;
  owner?: string;
  group?: string;
  isDirectory?: boolean;
  isFile?: boolean;
  isSymlink?: boolean;
}

/**
 * Directory entry.
 */
export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedAt?: Date;
}

/**
 * Entry for writing a file.
 */
export interface FileWriteEntry {
  /** File path */
  path: string;

  /** File content (various types supported) */
  data: string | Uint8Array | ArrayBuffer | Blob | ReadableStream<Uint8Array>;

  /** File permissions (octal) */
  mode?: number;

  /** Owner */
  owner?: string;

  /** Group */
  group?: string;
}

/**
 * Entry for permission changes.
 */
export interface PermissionEntry {
  path: string;
  mode?: number;
  owner?: string;
  group?: string;
}

/**
 * Result of reading a file.
 */
export interface FileReadResult {
  path: string;
  content: Uint8Array;
  error: Error | null;
}

/**
 * Result of writing a file.
 */
export interface FileWriteResult {
  path: string;
  bytesWritten: number;
  error: Error | null;
}

/**
 * Result of deleting a file.
 */
export interface FileDeleteResult {
  path: string;
  success: boolean;
  error: Error | null;
}

/**
 * Search result.
 */
export interface SearchResult {
  path: string;
  isDirectory?: boolean;
  isFile?: boolean;
}

/**
 * Move/rename entry.
 */
export interface MoveEntry {
  source: string;
  destination: string;
}

/**
 * Content replacement entry.
 */
export interface ContentReplaceEntry {
  path: string;
  oldContent: string;
  newContent: string;
}

/**
 * File read options.
 */
export interface ReadFileOptions {
  /** Character encoding (default: binary/Uint8Array) */
  encoding?: 'utf-8' | 'base64' | 'binary';

  /** Byte range to read (format: "start-end" or "start-") */
  range?: string;
}
