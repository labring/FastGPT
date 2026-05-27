/**
 * ProcessPool - JS 子进程池
 *
 * 继承 BaseProcessPool，提供 JS worker 的 spawn 配置。
 * dev（tsx 直接跑 .ts 源码）：worker.ts + tsx
 * prod（tsdown 打包后）：worker.js + node
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { env } from '../env';
import { BaseProcessPool } from './base-process-pool';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isCompiled = import.meta.url.endsWith('.js');

const WORKER_SCRIPT = join(__dirname, isCompiled ? 'worker.js' : 'worker.ts');
const SPAWN_RUNTIME = isCompiled ? 'node' : 'tsx';
const RECYCLE_AFTER_TASK_MODULES = new Set([
  'child_process',
  'node:child_process',
  'cluster',
  'node:cluster',
  'worker_threads',
  'node:worker_threads'
]);

function shouldRecycleAfterTask(allowedModules: readonly string[]): boolean {
  return allowedModules.some((moduleName) => RECYCLE_AFTER_TASK_MODULES.has(moduleName));
}

export class ProcessPool extends BaseProcessPool {
  constructor(poolSize?: number) {
    super(poolSize, {
      name: 'JS',
      workerScript: WORKER_SCRIPT,
      spawnCommand: (script) => `exec ${SPAWN_RUNTIME} ${script}`,
      allowedModules: env.SANDBOX_JS_ALLOWED_MODULES,
      recycleAfterTask: shouldRecycleAfterTask(env.SANDBOX_JS_ALLOWED_MODULES)
    });
  }
}
