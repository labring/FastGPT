import { CommandExecutionError, FileOperationError } from '../errors';
import type { ICommandExecution } from '../interfaces';
import type { DirectoryEntry, FileInfo, SearchResult } from '../types';
import { base64ToBytes, bytesToBase64 } from '../utils/base64';

/**
 * Service that implements filesystem operations via command execution.
 *
 * This is the core polyfill mechanism that enables feature parity
 * for providers that only offer raw command execution without
 * native filesystem APIs.
 *
 * All commands use POSIX-compliant syntax for maximum compatibility.
 */
export class CommandPolyfillService {
  constructor(private readonly executor: ICommandExecution) {}

  // ==================== File Read Operations ====================

  /**
   * Chunk size used when reading files through command execution. Each chunk
   * produces a base64-encoded stdout of roughly `READ_CHUNK_SIZE * 4 / 3`
   * bytes, which must fit within the executor's stdout byte cap (default
   * 1 MiB) with room to spare.
   */
  private static readonly READ_CHUNK_SIZE = 256 * 1024;

  /**
   * Read a file in chunks via `dd | base64`. Uses `stat` to discover the file
   * size, then issues range reads so that no single command's stdout exceeds
   * the executor's bounded output limit.
   *
   * Falls back to a single `cat | base64` read when `stat` fails (e.g. when
   * the sandbox lacks GNU stat). That fallback is bounded by the caller's
   * `maxOutputBytes`, so very large files require stat-based chunking.
   */
  async readFile(path: string): Promise<Uint8Array> {
    try {
      const size = await this.statSize(path);
      if (size === undefined) {
        const result = await this.executor.execute(`cat ${this.shellQuote(path)} | base64 -w 0`);
        if (result.exitCode !== 0) {
          throw this.createFileError(path, result.stderr);
        }
        return base64ToBytes(result.stdout);
      }

      if (size === 0) return new Uint8Array();

      const chunks: Uint8Array[] = [];
      let totalLength = 0;
      for (let offset = 0; offset < size; offset += CommandPolyfillService.READ_CHUNK_SIZE) {
        const end = Math.min(offset + CommandPolyfillService.READ_CHUNK_SIZE, size);
        const chunk = await this.readFileRange(path, offset, end);
        chunks.push(chunk);
        totalLength += chunk.length;
      }

      const combined = new Uint8Array(totalLength);
      let writeOffset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, writeOffset);
        writeOffset += chunk.length;
      }
      return combined;
    } catch (error) {
      if (error instanceof FileOperationError) {
        throw error;
      }
      if (error instanceof CommandExecutionError) {
        throw this.createFileError(path, error.stderr || '');
      }
      throw error;
    }
  }

  /**
   * Return the file size in bytes, or undefined if stat fails (e.g. the file
   * does not exist or stat is unavailable).
   */
  private async statSize(path: string): Promise<number | undefined> {
    // GNU stat uses -c '%s', BSD/macOS stat uses -f '%z'.
    const quotedPath = this.shellQuote(path);
    const result = await this.executor.execute(
      `stat -c '%s' ${quotedPath} 2>/dev/null || stat -f '%z' ${quotedPath} 2>/dev/null || echo STAT_FAILED`
    );
    const stdout = result.stdout.trim();
    if (!stdout || stdout.includes('STAT_FAILED')) return undefined;
    const parsed = Number.parseInt(stdout, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  /**
   * Read a portion of a file via `tail -c +N | head -c M | base64`.
   *
   * `tail -c +N` emits bytes starting at position N (1-indexed). `head -c M`
   * caps the length. Both are POSIX-ish and avoid the `dd bs=1` one-syscall-
   * per-byte trap that made the old implementation unusable for large reads.
   */
  async readFileRange(path: string, start: number, end?: number): Promise<Uint8Array> {
    const quotedPath = this.shellQuote(path);
    const tailPos = start + 1; // tail -c uses 1-indexed byte position
    const cmd =
      end !== undefined
        ? `tail -c +${tailPos} ${quotedPath} | head -c ${end - start} | base64 -w 0`
        : `tail -c +${tailPos} ${quotedPath} | base64 -w 0`;

    const result = await this.executor.execute(cmd);
    if (result.exitCode !== 0) {
      throw this.createFileError(path, result.stderr);
    }
    return base64ToBytes(result.stdout);
  }

  // ==================== File Write Operations ====================

  /**
   * Write a file via base64 decoding.
   * Uses: echo <base64> | base64 -d > <file>
   */
  async writeFile(path: string, data: Uint8Array): Promise<number> {
    await this.appendBytes(path, data, { truncate: true });
    return data.length;
  }

  /**
   * Append `data` to `path`, chunking the base64 payload to stay under the
   * shell command line length limit. Set `truncate` to rewrite the file
   * from scratch on the first append.
   *
   * Parent directory creation runs once when `truncate` is set, so streaming
   * writes pay the mkdir cost only on the first chunk.
   */
  async appendBytes(
    path: string,
    data: Uint8Array,
    options?: { truncate?: boolean }
  ): Promise<void> {
    if (options?.truncate) {
      await this.createParentDirectory(path);
    }

    if (data.length === 0) {
      if (options?.truncate) {
        // Create/truncate the file even if there's nothing to write.
        const result = await this.executor.execute(`: > ${this.shellQuote(path)}`);
        if (result.exitCode !== 0) {
          throw this.createFileError(path, result.stderr);
        }
      }
      return;
    }

    const base64 = bytesToBase64(data);
    const chunkSize = 1024; // Avoid command line length limits
    let first = Boolean(options?.truncate);

    for (let i = 0; i < base64.length; i += chunkSize) {
      const chunk = base64.slice(i, i + chunkSize);
      const redirect = first ? '>' : '>>';
      const result = await this.executor.execute(
        `echo "${chunk}" | base64 -d ${redirect} ${this.shellQuote(path)}`
      );
      if (result.exitCode !== 0) {
        throw this.createFileError(path, result.stderr);
      }
      first = false;
    }
  }

  /**
   * Write a text file directly.
   */
  async writeTextFile(path: string, content: string): Promise<number> {
    const data = new TextEncoder().encode(content);
    await this.writeFile(path, data);
    return data.length;
  }

  // ==================== File Delete Operations ====================

  /**
   * Delete files via rm command.
   */
  async deleteFiles(paths: string[]): Promise<{ path: string; success: boolean; error?: Error }[]> {
    const results: { path: string; success: boolean; error?: Error }[] = [];

    for (const path of paths) {
      try {
        const result = await this.executor.execute(`rm -f ${this.shellQuote(path)}`);
        results.push({
          path,
          success: result.exitCode === 0,
          error: result.exitCode !== 0 ? new Error(result.stderr) : undefined
        });
      } catch (error) {
        results.push({
          path,
          success: false,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }

    return results;
  }

  // ==================== Directory Operations ====================

  /**
   * Create directories via mkdir -p.
   */
  async createDirectories(
    paths: string[],
    options?: { mode?: number; owner?: string; group?: string }
  ): Promise<void> {
    for (const path of paths) {
      const result = await this.executor.execute(`mkdir -p ${this.shellQuote(path)}`);
      if (result.exitCode !== 0) {
        throw new FileOperationError(
          `Failed to create directory: ${result.stderr}`,
          path,
          'PATH_NOT_DIRECTORY'
        );
      }

      // Set permissions if specified
      if (options?.mode) {
        await this.executor.execute(`chmod ${options.mode.toString(8)} ${this.shellQuote(path)}`);
      }

      // Set ownership if specified
      if (options?.owner || options?.group) {
        const owner = options.owner || '';
        const group = options.group ? `:${options.group}` : '';
        await this.executor.execute(
          `chown ${this.shellQuote(`${owner}${group}`)} ${this.shellQuote(path)} 2>/dev/null || true`
        );
      }
    }
  }

  /**
   * Delete directories via rm -rf.
   */
  async deleteDirectories(
    paths: string[],
    options?: { recursive?: boolean; force?: boolean }
  ): Promise<void> {
    const flagParts: string[] = [];
    if (options?.recursive !== false) flagParts.push('r');
    if (options?.force !== false) flagParts.push('f');
    const flags = flagParts.length > 0 ? `-${flagParts.join('')}` : '';

    for (const path of paths) {
      const result = await this.executor.execute(`rm ${flags} ${this.shellQuote(path)}`.trim());
      if (result.exitCode !== 0) {
        throw new FileOperationError(
          `Failed to delete directory: ${result.stderr}`,
          path,
          'PATH_IS_DIRECTORY'
        );
      }
    }
  }

  /**
   * List directory contents via ls -la.
   */
  async listDirectory(path: string): Promise<DirectoryEntry[]> {
    let result = await this.executor.execute(
      `ls -la ${this.shellQuote(path)} --time-style=+"%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "DIRECTORY_NOT_FOUND"`
    );

    if (result.stdout.includes('DIRECTORY_NOT_FOUND') || result.exitCode !== 0) {
      result = await this.executor.execute(
        `ls -la ${this.shellQuote(path)} 2>/dev/null || echo "DIRECTORY_NOT_FOUND"`
      );
    }

    if (result.stdout.includes('DIRECTORY_NOT_FOUND')) {
      throw new FileOperationError('Directory not found', path, 'FILE_NOT_FOUND');
    }

    return this.parseLsOutput(result.stdout, path);
  }

  /**
   * Create parent directory for a file path.
   */
  private async createParentDirectory(filePath: string): Promise<void> {
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash > 0) {
      const parentDir = filePath.slice(0, lastSlash);
      await this.executor.execute(`mkdir -p ${this.shellQuote(parentDir)}`);
    }
  }

  // ==================== Metadata Operations ====================

  /**
   * Get file information via stat.
   */
  async getFileInfo(paths: string[]): Promise<Map<string, FileInfo>> {
    const infoMap = new Map<string, FileInfo>();

    for (const path of paths) {
      try {
        // Use stat for detailed info
        const result = await this.executor.execute(
          `stat -c '%s|%Y|%W|%a|%U|%G|%F' ${this.shellQuote(path)} 2>/dev/null || echo "STAT_FAILED"`
        );

        if (result.stdout.includes('STAT_FAILED')) {
          continue; // File doesn't exist
        }

        const parts = result.stdout.trim().split('|');
        if (parts.length >= 7) {
          infoMap.set(path, {
            path,
            size: Number.parseInt(parts[0], 10) || undefined,
            modifiedAt: parts[1] ? new Date(Number.parseInt(parts[1], 10) * 1000) : undefined,
            createdAt: parts[2] ? new Date(Number.parseInt(parts[2], 10) * 1000) : undefined,
            mode: Number.parseInt(parts[3], 8) || undefined,
            owner: parts[4] || undefined,
            group: parts[5] || undefined,
            isDirectory: parts[6].includes('directory'),
            isFile: parts[6].includes('regular file'),
            isSymlink: parts[6].includes('symbolic link')
          });
        }
      } catch {
        // Skip files that can't be stat'd
      }
    }

    return infoMap;
  }

  /**
   * Set file permissions via chmod.
   */
  async setPermissions(
    entries: { path: string; mode?: number; owner?: string; group?: string }[]
  ): Promise<void> {
    for (const entry of entries) {
      if (entry.mode !== undefined) {
        await this.executor.execute(
          `chmod ${entry.mode.toString(8)} ${this.shellQuote(entry.path)}`
        );
      }

      if (entry.owner || entry.group) {
        const owner = entry.owner || '';
        const group = entry.group ? `:${entry.group}` : '';
        await this.executor.execute(
          `chown ${this.shellQuote(`${owner}${group}`)} ${this.shellQuote(entry.path)} 2>/dev/null || true`
        );
      }
    }
  }

  // ==================== Search Operations ====================

  /**
   * Search for files via find command.
   */
  async search(pattern: string, path: string = '.'): Promise<SearchResult[]> {
    const quotedPattern = this.shellQuote(pattern);
    const quotedPath = this.shellQuote(path);

    // Try find command first
    let result = await this.executor.execute(
      `find ${quotedPath} -name ${quotedPattern} -print 2>/dev/null || echo "FIND_FAILED"`
    );

    if (!result.stdout.includes('FIND_FAILED')) {
      return result.stdout
        .split('\n')
        .filter((p) => p.trim())
        .map((p) => ({ path: p }));
    }

    // Fallback to ls + grep if find not available
    result = await this.executor.execute(
      `ls -R ${quotedPath} 2>/dev/null | grep -E ${quotedPattern} || true`
    );

    return result.stdout
      .split('\n')
      .filter((p) => p.trim())
      .map((p) => ({ path: `${path}/${p}` }));
  }

  /**
   * Move/rename files via mv command.
   */
  async moveFiles(entries: { source: string; destination: string }[]): Promise<void> {
    for (const { source, destination } of entries) {
      const result = await this.executor.execute(
        `mv ${this.shellQuote(source)} ${this.shellQuote(destination)}`
      );
      if (result.exitCode !== 0) {
        throw new FileOperationError(
          `Failed to move file: ${result.stderr}`,
          source,
          'TRANSFER_ERROR'
        );
      }
    }
  }

  /**
   * Replace content in files via sed.
   */
  async replaceContent(
    entries: { path: string; oldContent: string; newContent: string }[]
  ): Promise<void> {
    for (const { path, oldContent, newContent } of entries) {
      // Escape sed special characters
      const escapedOld = oldContent
        .replace(/\\/g, '\\\\\\\\')
        .replace(/\//g, '\\/')
        .replace(/&/g, '\\&');
      const escapedNew = newContent
        .replace(/\\/g, '\\\\\\\\')
        .replace(/\//g, '\\/')
        .replace(/&/g, '\\&');

      const result = await this.executor.execute(
        `sed -i ${this.shellQuote(`s/${escapedOld}/${escapedNew}/g`)} ${this.shellQuote(path)}`
      );

      if (result.exitCode !== 0) {
        throw new FileOperationError(
          `Failed to replace content: ${result.stderr}`,
          path,
          'INVALID_PATH'
        );
      }
    }
  }

  // ==================== Health Check Polyfill ====================

  /**
   * Simple health check via echo command.
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.executor.execute('echo "PING"');
      return result.exitCode === 0 && result.stdout.includes('PING');
    } catch {
      return false;
    }
  }

  /**
   * Get metrics via /proc filesystem.
   */
  async getMetrics(): Promise<{
    cpuCount: number;
    cpuUsedPercentage: number;
    memoryTotalMiB: number;
    memoryUsedMiB: number;
    timestamp: number;
  }> {
    const timestamp = Date.now();

    // Get CPU count
    const cpuResult = await this.executor.execute('nproc 2>/dev/null || echo "1"');
    const cpuCount = Number.parseInt(cpuResult.stdout.trim(), 10) || 1;

    // Get memory info from /proc/meminfo
    const memResult = await this.executor.execute('cat /proc/meminfo 2>/dev/null || echo "FAILED"');

    let memoryTotalMiB = 0;
    let memoryUsedMiB = 0;

    if (!memResult.stdout.includes('FAILED')) {
      const totalMatch = memResult.stdout.match(/MemTotal:\s+(\d+)\s+kB/);
      const availableMatch = memResult.stdout.match(/MemAvailable:\s+(\d+)\s+kB/);

      if (totalMatch) {
        memoryTotalMiB = Math.floor(Number.parseInt(totalMatch[1], 10) / 1024);
      }
      if (totalMatch && availableMatch) {
        const total = Number.parseInt(totalMatch[1], 10);
        const available = Number.parseInt(availableMatch[1], 10);
        memoryUsedMiB = Math.floor((total - available) / 1024);
      }
    }

    // Estimate CPU usage (simplified)
    const cpuUsedPercentage = 0; // Would require multiple samples

    return {
      cpuCount,
      cpuUsedPercentage,
      memoryTotalMiB,
      memoryUsedMiB,
      timestamp
    };
  }

  // ==================== Private Helpers ====================

  /**
   * Quote a shell operand with POSIX single-quote escaping.
   *
   * Double quotes still allow command substitution (`$()` and backticks), so
   * every user-controlled path/pattern passed to command polyfills must go
   * through this helper before being concatenated into a shell command.
   */
  private shellQuote(value: string): string {
    const safeValue = value || '.';
    return `'${safeValue.replace(/'/g, `'\\''`)}'`;
  }

  /**
   * Parse ls -la output into DirectoryEntry objects.
   */
  private parseLsOutput(output: string, basePath: string): DirectoryEntry[] {
    const lines = output.split('\n');
    const entries: DirectoryEntry[] = [];

    for (const line of lines) {
      // Skip total line and empty lines
      if (line.startsWith('total') || !line.trim()) {
        continue;
      }

      // Parse ls -la format:
      // drwxr-xr-x 2 user group 4096 2024-01-15T10:30:00 filename
      const match = line.match(
        /^([-dl])([-rwxsStT]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\s+(.+)$/
      );

      if (match) {
        const [, type, , size, dateStr, name] = match;

        // Skip . and ..
        if (name === '.' || name === '..') {
          continue;
        }

        const isDirectory = type === 'd';
        const isSymlink = type === 'l';

        entries.push({
          name,
          path: `${basePath}/${name}`,
          isDirectory: isDirectory || isSymlink, // Treat symlinks as directories for safety
          isFile: type === '-',
          size: Number.parseInt(size, 10) || undefined,
          modifiedAt: new Date(dateStr)
        });
        continue;
      }

      // Fallback to standard Unix/BSD ls -la parse:
      // drwxr-xr-x 2 user group 4096 May 20 19:16 skills
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 8) {
        const permissions = parts[0];
        const type = permissions[0];
        const size = parts[4];
        const name = parts.slice(8).join(' ');

        if (name === '.' || name === '..') {
          continue;
        }

        entries.push({
          name,
          path: `${basePath}/${name}`,
          isDirectory: type === 'd' || type === 'l',
          isFile: type === '-',
          size: Number.parseInt(size, 10) || undefined
        });
      }
    }

    return entries;
  }

  /**
   * Create a FileOperationError from stderr.
   */
  private createFileError(path: string, stderr: string): FileOperationError {
    const lowerStderr = stderr.toLowerCase();

    if (lowerStderr.includes('no such file') || lowerStderr.includes('does not exist')) {
      return new FileOperationError(stderr, path, 'FILE_NOT_FOUND');
    }
    if (lowerStderr.includes('permission denied')) {
      return new FileOperationError(stderr, path, 'PERMISSION_DENIED');
    }
    if (lowerStderr.includes('is a directory')) {
      return new FileOperationError(stderr, path, 'PATH_IS_DIRECTORY');
    }
    if (lowerStderr.includes('not a directory')) {
      return new FileOperationError(stderr, path, 'PATH_NOT_DIRECTORY');
    }

    return new FileOperationError(stderr, path, 'TRANSFER_ERROR');
  }
}
