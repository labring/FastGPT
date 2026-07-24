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
  ReadFileOptions,
  SearchResult
} from '../types';

/** Filesystem contract. Batch result order always matches input order. */
export type IFileSystem = {
  readFiles(paths: string[], options?: ReadFileOptions): Promise<FileReadResult[]>;
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

  getFileInfo(paths: string[]): Promise<Map<string, FileInfo>>;
  setPermissions(entries: PermissionEntry[]): Promise<void>;
  search(pattern: string, path?: string): Promise<SearchResult[]>;
};
