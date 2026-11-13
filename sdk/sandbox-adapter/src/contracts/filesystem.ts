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
import type { ContentReplaceResult } from '../types/filesystem';

/** Filesystem contract. Batch result order always matches input order. */
export type IFileSystem = {
  readFiles(paths: string[]): Promise<FileReadResult[]>;
  writeFiles(entries: FileWriteEntry[]): Promise<FileWriteResult[]>;
  deleteFiles(paths: string[]): Promise<FileDeleteResult[]>;
  moveFiles(entries: MoveEntry[]): Promise<void>;
  /**
   * 按输入顺序返回每条结果，路径统一规范化；同文件的编辑依次执行。
   * 明确未命中后停止发送后续请求，已发送请求中的其他编辑可能已经生效。
   * 缺少计数时返回 unknown；参数、I/O 和传输异常向上抛出，不自动重试。
   */
  replaceContent(entries: ContentReplaceEntry[]): Promise<ContentReplaceResult[]>;

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
