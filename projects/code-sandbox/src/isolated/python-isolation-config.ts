import { existsSync } from 'fs';
import { platform } from 'os';
import { join } from 'path';

export const PYTHON_SANDBOX_ROOT = '/tmp/fastgpt-python-sandbox';
export const PYTHON_SANDBOX_UID = 65537;
export const PYTHON_SANDBOX_GID = 65537;
export const PYTHON_ENABLE_NETWORK_SYSCALLS = false;

export function shouldEnablePythonNativeIsolation(): boolean {
  return platform() === 'linux';
}

/**
 * Python native 隔离是 Linux 多租户安全边界的一部分。
 *
 * Linux 环境固定启用 seccomp/chroot/setuid，缺失 native 库或 chroot 根目录时
 * 直接 fail-closed；macOS/Windows 仅保留本地开发兼容路径，不声明具备 OS 隔离。
 */
export function assertPythonNativeIsolationReady(libraryPath: string) {
  if (!shouldEnablePythonNativeIsolation()) return;

  if (!existsSync(libraryPath)) {
    throw new Error(`Python native sandbox library does not exist: ${libraryPath}`);
  }
  if (!existsSync(PYTHON_SANDBOX_ROOT)) {
    throw new Error(`Python sandbox root does not exist: ${PYTHON_SANDBOX_ROOT}`);
  }
}

export function getBundledPythonNativeLibraryPath(dirname: string) {
  return join(dirname, 'fastgpt_python_sandbox.so');
}
