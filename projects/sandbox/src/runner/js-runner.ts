import { writeFile } from 'fs/promises';
import { join } from 'path';
import { SubprocessRunner } from './base';
import { generateJsScript } from '../sandbox/js-template';
import type { RunnerConfig } from '../types';

/** JS 模块白名单（网络模块已移除，统一通过 SystemHelper.httpRequest） */
const ALLOWED_MODULES = [
  'lodash', 'dayjs', 'moment', 'uuid',
  'crypto-js', 'qs', 'url', 'querystring'
];

/**
 * JsRunner - 通过 Bun 子进程执行 JS 代码
 *
 * 安全措施：
 * - 原型链冻结
 * - Bun 危险 API 删除
 * - require 模块白名单
 * - 临时文件系统隔离
 */
export class JsRunner extends SubprocessRunner {
  constructor(runnerConfig: RunnerConfig) {
    super(runnerConfig);
  }

  getCommand(scriptPath: string) {
    return { command: 'bun', args: ['run', scriptPath] };
  }

  async generateScript(
    tempDir: string,
    code: string,
    limits: { timeoutMs: number; memoryMB: number; diskMB: number }
  ): Promise<string> {
    const script = generateJsScript(code, ALLOWED_MODULES, limits);
    const scriptPath = join(tempDir, 'run.mjs');
    await writeFile(scriptPath, script, 'utf-8');
    return scriptPath;
  }
}
