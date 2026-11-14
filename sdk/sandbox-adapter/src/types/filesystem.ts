/**
 * File information/metadata.
 */
export type FileInfo = {
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
};

/**
 * Directory entry.
 */
export type DirectoryEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
  modifiedAt?: Date;
};

/**
 * Entry for writing a file.
 */
export type FileWriteEntry = {
  /** File path */
  path: string;

  /** File content (various types supported) */
  data: string | Uint8Array | ArrayBuffer | Blob | ReadableStream<Uint8Array>;

  /** POSIX permission bitmask, for example `0o644`. */
  mode?: number;

  /** Owner */
  owner?: string;

  /** Group */
  group?: string;
};

/**
 * Entry for permission changes.
 */
export type PermissionEntry = {
  path: string;
  mode?: number;
  owner?: string;
  group?: string;
};

/**
 * Result of reading a file.
 */
export type FileReadResult = {
  path: string;
  content: Uint8Array;
  error: Error | null;
};

/**
 * Result of writing a file.
 */
export type FileWriteResult = {
  path: string;
  bytesWritten: number;
  error: Error | null;
};

/**
 * Result of deleting a file.
 */
export type FileDeleteResult = {
  path: string;
  success: boolean;
  error: Error | null;
};

/**
 * Search result.
 */
export type SearchResult = {
  path: string;
  isDirectory?: boolean;
  isFile?: boolean;
};

/**
 * Move/rename entry.
 */
export type MoveEntry = {
  source: string;
  destination: string;
};

/**
 * Content replacement entry.
 */
export type ContentReplaceEntry = {
  path: string;
  oldContent: string;
  newContent: string;
};

/**
 * 单条内容替换的结果，与输入条目一一对应，路径统一为 provider 规范化后的路径。
 *
 * replaced 携带实际替换次数；unmatched 表示明确零匹配；unknown 表示请求已完成但缺少计数，
 * 修改可能已经生效；skipped 表示遇到未命中后尚未发送的编辑。真实 I/O 异常仍向上抛出。
 */
export type ContentReplaceResult = { path: string } & (
  | { status: 'replaced'; replacedCount: number }
  | { status: 'unmatched' | 'unknown' | 'skipped' }
);
