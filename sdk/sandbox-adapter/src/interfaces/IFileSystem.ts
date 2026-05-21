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

/**
 * Interface for filesystem operations within a sandbox.
 * Follows Interface Segregation Principle.
 *
 * All methods support batch operations for efficiency.
 * Providers without native batch support will have operations
 * automatically parallelized by the base adapter.
 */
export interface IFileSystem {
  // ==================== File Operations ====================

  /**
   * Read files from the sandbox.
   * @param paths Array of file paths to read
   * @param options Read options
   * @returns Array of results (one per path, may include errors)
   */
  readFiles(paths: string[], options?: ReadFileOptions): Promise<FileReadResult[]>;

  /**
   * Write files to the sandbox.
   * Supports strings, bytes, and streams.
   * @param entries Files to write
   * @returns Array of results with bytes written
   */
  writeFiles(entries: FileWriteEntry[]): Promise<FileWriteResult[]>;

  /**
   * Delete files from the sandbox.
   * @param paths Files to delete
   * @returns Array of results
   */
  deleteFiles(paths: string[]): Promise<FileDeleteResult[]>;

  /**
   * Move/rename files within the sandbox.
   * @param entries Move operations to perform
   */
  moveFiles(entries: MoveEntry[]): Promise<void>;

  /**
   * Replace content within files.
   * @param entries Replacement operations
   */
  replaceContent(entries: ContentReplaceEntry[]): Promise<void>;

  // ==================== Streaming Operations ====================

  /**
   * Read a file as a stream.
   * Efficient for large files.
   * @param path File path
   * @returns Async iterable of file chunks
   */
  readFileStream(path: string): AsyncIterable<Uint8Array>;

  /**
   * Write a file from a stream.
   * Efficient for large files.
   * @param path File path
   * @param stream Data stream
   */
  writeFileStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void>;

  // ==================== Directory Operations ====================

  /**
   * Create directories.
   * Creates parent directories as needed.
   * @param paths Directories to create
   * @param options Directory options (mode, owner, group)
   */
  createDirectories(
    paths: string[],
    options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void>;

  /**
   * Delete directories and their contents.
   * @param paths Directories to delete
   * @param options Options (recursive, force)
   */
  deleteDirectories(
    paths: string[],
    options?: { recursive?: boolean; force?: boolean }
  ): Promise<void>;

  /**
   * List directory contents.
   * @param path Directory path
   * @returns Array of directory entries
   */
  listDirectory(path: string): Promise<DirectoryEntry[]>;

  // ==================== Metadata Operations ====================

  /**
   * Get file/directory information.
   * @param paths Paths to query
   * @returns Map of path to file info
   */
  getFileInfo(paths: string[]): Promise<Map<string, FileInfo>>;

  /**
   * Set file permissions.
   * @param entries Permission changes to apply
   */
  setPermissions(entries: PermissionEntry[]): Promise<void>;

  // ==================== Search Operations ====================

  /**
   * Search for files matching a pattern.
   * @param pattern Search pattern (glob or regex, provider-dependent)
   * @param path Directory to search in
   * @returns Array of matching results
   */
  search(pattern: string, path?: string): Promise<SearchResult[]>;
}
