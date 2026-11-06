import type {
  ContentReplaceEntry,
  DirectoryEntry,
  FileDeleteResult,
  FileInfo,
  FileReadResult,
  FileWriteEntry,
  FileWriteResult,
  MoveEntry,
  PermissionEntry,
  SearchResult
} from '../types';

/** Filesystem contract. Batch result order always matches input order. */
export type IFileSystem = {
  readFiles(paths: string[]): Promise<FileReadResult[]>;
  writeFiles(entries: FileWriteEntry[]): Promise<FileWriteResult[]>;
  deleteFiles(paths: string[]): Promise<FileDeleteResult[]>;
  moveFiles(entries: MoveEntry[]): Promise<void>;
  replaceContent(entries: ContentReplaceEntry[]): Promise<void>;

  readFileStream(path: string): AsyncIterable<Uint8Array>;
  writeFileStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void>;

  createDirectories(
    paths: string[],
    options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void>;
  deleteDirectories(paths: string[]): Promise<void>;
  listDirectory(path: string): Promise<DirectoryEntry[]>;

  /**
   * 返回已找到路径的元数据，仅省略确定不存在（ENOENT）的路径。
   * 权限、传输、命令及响应校验错误必须抛出，整批查询失败时不返回部分 Map。
   */
  getFileInfo(paths: string[]): Promise<Map<string, FileInfo>>;
  setPermissions(entries: PermissionEntry[]): Promise<void>;
  search(pattern: string, path?: string): Promise<SearchResult[]>;
};
