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
 * 单条内容替换的结果，与输入条目一一对应。
 *
 * `replacedCount` 为 0 表示明确未命中，null 表示没有可用计数。
 * error 非空时说明编辑失败或未执行；否则 null 表示后端未返回计数，修改可能已经生效。
 * 未知结果不能当作未修改，调用方应读取文件确认后再决定是否重试。
 */
export type ContentReplaceResult = {
  path: string;
  replacedCount: number | null;
  error: Error | null;
};
