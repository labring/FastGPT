import { writeFile } from 'fs/promises';
import { join } from 'path';
import { SubprocessRunner } from './base';
import { generatePythonScript } from '../sandbox/python-template';
import type { RunnerConfig } from '../types';

/** Python 危险模块黑名单 */
const DANGEROUS_MODULES = [
  'os', 'sys', 'subprocess', 'shutil', 'socket', 'ctypes',
  'multiprocessing', 'threading', 'pickle', 'importlib',
  'code', 'codeop', 'compile', 'compileall',
  'signal', 'resource', 'gc', 'inspect',
  'tempfile', 'pathlib', 'io', 'fileinput',
  'urllib', 'http', 'requests', 'httpx', 'aiohttp'
];

/**
 * PythonRunner - 通过 python3 子进程执行 Python 代码
 *
 * 安全措施：
 * - 宿主侧正则预检危险导入
 * - 运行时 __import__ 拦截
 * - resource 模块限制 CPU/内存/磁盘
 * - 临时文件系统隔离
 */
export class PythonRunner extends SubprocessRunner {
  constructor(runnerConfig: RunnerConfig) {
    super(runnerConfig);
  }

  getCommand(scriptPath: string) {
    return { command: 'python3', args: ['-u', scriptPath] };
  }

  /** 宿主侧预检：正则检测危险导入 */
  protected preCheck(code: string): void {
    const dangerousImport = this.detectDangerousImports(code);
    if (dangerousImport) {
      throw new Error(`Importing ${dangerousImport} is not allowed.`);
    }
  }

  async generateScript(
    tempDir: string,
    code: string,
    limits: { timeoutMs: number; memoryMB: number; diskMB: number }
  ): Promise<string> {
    const script = generatePythonScript(code, DANGEROUS_MODULES, limits, tempDir);
    const scriptPath = join(tempDir, 'run.py');
    await writeFile(scriptPath, script, 'utf-8');
    return scriptPath;
  }

  /** 正则检测危险导入（快速预检，不依赖 AST） */
  private detectDangerousImports(code: string): string | null {
    // 检测 import / from ... import 语句
    const importRegex = /(?:^|\n)\s*(?:import|from)\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(code)) !== null) {
      if (DANGEROUS_MODULES.includes(match[1])) {
        return match[1];
      }
    }
    // 检测 __import__('module') 调用
    const dunderImportRegex = /__import__\s*\(\s*['"]([\w.]+)['"]\s*\)/g;
    while ((match = dunderImportRegex.exec(code)) !== null) {
      const topLevel = match[1].split('.')[0];
      if (DANGEROUS_MODULES.includes(topLevel)) {
        return topLevel;
      }
    }
    return null;
  }
}
