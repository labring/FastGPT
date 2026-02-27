/**
 * prlimit 工具函数
 *
 * 用于检测和设置操作系统级资源限制
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 检测 prlimit 命令是否可用
 * @returns Promise<boolean>
 */
export async function checkPrlimitAvailable(): Promise<boolean> {
  try {
    // 尝试运行 prlimit --version
    await execAsync('prlimit --version', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取进程的当前内存限制
 * @param pid 进程 ID
 * @returns Promise<number | null> 返回限制字节数，失败返回 null
 */
export async function getMemoryLimit(pid: number): Promise<number | null> {
  try {
    // 使用 --pid 参数指定进程 ID
    const { stdout } = await execAsync(`prlimit --pid ${pid} --as`, { timeout: 5000 });
    // 解析输出: "RESOURCE DESCRIPTION     LIMIT      SOFT      UNITS
    //          AS     address space     268435456 268435456 bytes"
    const match = stdout.match(/AS\s+address\s+space\s+(\d+)\s+(\d+)\s+bytes/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 为进程设置内存限制
 * @param pid 进程 ID
 * @param limitMB 内存限制（MB）
 * @returns Promise<boolean> 是否成功设置
 */
export async function setMemoryLimit(pid: number, limitMB: number): Promise<boolean> {
  try {
    const limitBytes = limitMB * 1024 * 1024;
    // 使用 --pid 参数指定进程 ID
    await execAsync(`prlimit --pid ${pid} --as=${limitBytes}:${limitBytes}`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
