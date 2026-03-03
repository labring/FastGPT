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
   * Read a file via base64 encoding.
   * Uses: cat <file> | base64
   */
  async readFile(path: string): Promise<Uint8Array> {
    try {
      const result = await this.executor.execute(`cat "${this.escapePath(path)}" | base64 -w 0`);
      if (result.exitCode !== 0) {
        throw this.createFileError(path, result.stderr);
      }
      return base64ToBytes(result.stdout);
    } catch (error) {
      if (error instanceof FileOperationError) {
        throw error;
      }
      if (error instanceof CommandExecutionError) {
        throw this.createFileError(path, error.stderr);
      }
      throw error;
    }
  }

  /**
   * Read a portion of a file via dd + base64.
   */
  async readFileRange(path: string, start: number, end?: number): Promise<Uint8Array> {
    const length = end ? end - start : '';
    const cmd = `dd if="${this.escapePath(
      path
    )}" bs=1 skip=${start} count=${length} 2>/dev/null | base64 -w 0`;

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
    const base64 = bytesToBase64(data);
    const chunkSize = 1024; // Avoid command line length limits

    // Ensure parent directory exists
    await this.createParentDirectory(path);

    // Write in chunks to avoid command length limits
    let first = true;
    for (let i = 0; i < base64.length; i += chunkSize) {
      const chunk = base64.slice(i, i + chunkSize);
      const redirect = first ? '>' : '>>';
      const result = await this.executor.execute(
        `echo "${chunk}" | base64 -d ${redirect} "${this.escapePath(path)}"`
      );
      if (result.exitCode !== 0) {
        throw this.createFileError(path, result.stderr);
      }
      first = false;
    }

    return data.length;
  }

  /**
   * Write a text file directly.
   */
  async writeTextFile(path: string, content: string): Promise<number> {
    await this.createParentDirectory(path);

    // Use heredoc for text content to avoid escaping issues
    const escapedContent = content.replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
    const result = await this.executor.execute(
      `cat > "${this.escapePath(path)}" << 'POLYFILL_EOF'\n${escapedContent}\nPOLYFILL_EOF`
    );

    if (result.exitCode !== 0) {
      throw this.createFileError(path, result.stderr);
    }

    return content.length;
  }

  // ==================== File Delete Operations ====================

  /**
   * Delete files via rm command.
   */
  async deleteFiles(paths: string[]): Promise<{ path: string; success: boolean; error?: Error }[]> {
    const results: { path: string; success: boolean; error?: Error }[] = [];

    for (const path of paths) {
      try {
        const result = await this.executor.execute(`rm -f "${this.escapePath(path)}"`);
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
      const result = await this.executor.execute(`mkdir -p "${this.escapePath(path)}"`);
      if (result.exitCode !== 0) {
        throw new FileOperationError(
          `Failed to create directory: ${result.stderr}`,
          path,
          'PATH_NOT_DIRECTORY'
        );
      }

      // Set permissions if specified
      if (options?.mode) {
        await this.executor.execute(`chmod ${options.mode.toString(8)} "${this.escapePath(path)}"`);
      }

      // Set ownership if specified
      if (options?.owner || options?.group) {
        const owner = options.owner || '';
        const group = options.group ? `:${options.group}` : '';
        await this.executor.execute(
          `chown ${owner}${group} "${this.escapePath(path)}" 2>/dev/null || true`
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
    const flags = [options?.recursive !== false ? '-r' : '', options?.force !== false ? '-f' : '']
      .filter(Boolean)
      .join('');

    for (const path of paths) {
      const result = await this.executor.execute(`rm ${flags} "${this.escapePath(path)}"`);
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
    const result = await this.executor.execute(
      `ls -la "${this.escapePath(path)}" --time-style=+"%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "DIRECTORY_NOT_FOUND"`
    );

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
      await this.executor.execute(`mkdir -p "${this.escapePath(parentDir)}"`);
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
          `stat -c '%s|%Y|%W|%a|%U|%G|%F' "${this.escapePath(path)}" 2>/dev/null || echo "STAT_FAILED"`
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
      } catch (_error) {
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
          `chmod ${entry.mode.toString(8)} "${this.escapePath(entry.path)}"`
        );
      }

      if (entry.owner || entry.group) {
        const owner = entry.owner || '';
        const group = entry.group ? `:${entry.group}` : '';
        await this.executor.execute(
          `chown ${owner}${group} "${this.escapePath(entry.path)}" 2>/dev/null || true`
        );
      }
    }
  }

  // ==================== Search Operations ====================

  /**
   * Search for files via find command.
   */
  async search(pattern: string, path: string = '.'): Promise<SearchResult[]> {
    // Escape pattern for shell but allow glob characters
    const escapedPattern = pattern.replace(/'/g, "'\"'\"'");
    const escapedPath = this.escapePath(path);

    // Try find command first
    let result = await this.executor.execute(
      `find "${escapedPath}" -name '${escapedPattern}' -print 2>/dev/null || echo "FIND_FAILED"`
    );

    if (!result.stdout.includes('FIND_FAILED')) {
      return result.stdout
        .split('\n')
        .filter((p) => p.trim())
        .map((p) => ({ path: p }));
    }

    // Fallback to ls + grep if find not available
    result = await this.executor.execute(
      `ls -R "${escapedPath}" 2>/dev/null | grep -E "${escapedPattern}" || true`
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
        `mv "${this.escapePath(source)}" "${this.escapePath(destination)}"`
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
        `sed -i 's/${escapedOld}/${escapedNew}/g' "${this.escapePath(path)}"`
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
   * Escape a path for safe shell usage.
   */
  private escapePath(path: string): string {
    // Replace " with \" for shell safety
    return path.replace(/"/g, '\\"');
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
