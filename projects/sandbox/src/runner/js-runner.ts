import { writeFile } from 'fs/promises';
import { join } from 'path';
import { SubprocessRunner } from './base';
import { generateJsScript } from '../sandbox/js-template';
import { config } from '../config';
import type { RunnerConfig } from '../types';

/**
 * JsRunner - 通过 Bun 子进程执行 JS 代码
 *
 * 安全措施：
 * - 原型链冻结
 * - Bun 危险 API 删除
 * - require 模块白名单
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
    limits: { timeoutMs: number; memoryMB: number }
  ): Promise<string> {
    const script = generateJsScript(code, config.jsAllowedModules, limits);
    const scriptPath = join(tempDir, 'run.mjs');
    await writeFile(scriptPath, script, 'utf-8');
    return scriptPath;
  }
}
